package com.anthonyaya.platypus.ui.videostudy

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.anthonyaya.platypus.data.model.WordGroup
import com.anthonyaya.platypus.data.remote.ApiFactory
import com.anthonyaya.platypus.data.remote.PlatypusApi
import com.google.gson.Gson
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import retrofit2.HttpException
import java.util.UUID

data class VideoCandidate(val id: String, val title: String, val channel: String, val duration: String)
data class VideoCandidatesResponse(val candidates: List<VideoCandidate>)
data class VideoDocumentResponse(val document: VideoStudyDocument)
data class VideoServiceStatus(val workerReady: Boolean, val captionsConfigured: Boolean, val groups: List<WordGroup>)
data class VideoJobItem(val word: String, val status: String, val error: String? = null) {
    fun displayItem() = ImportItem(word, when (status) {
        "processing" -> ImportStatus.Processing; "success" -> ImportStatus.Success
        "failed" -> ImportStatus.Failed; else -> ImportStatus.Waiting
    }, error)
}
data class VideoImportJob(val id: String, val status: String, val groupName: String, val items: List<VideoJobItem>, val error: String? = null)
data class VideoJobResponse(val job: VideoImportJob)
data class PendingVideoImport(val requestId: String, val groupId: String, val words: List<DraftWord>)
data class VideoLiveSession(
    val draft: List<DraftWord> = emptyList(), val documentId: String = "", val jobId: String = "",
    val acknowledged: List<String> = emptyList(), val pending: PendingVideoImport? = null,
    val examplesMigrated: Boolean = false,
)

fun applyVideoJob(current: VideoLiveSession, job: VideoImportJob): VideoLiveSession {
    if (job.id != current.jobId) return current
    val successes = job.items.filter { it.status == "success" && it.word !in current.acknowledged }.map { it.word }
    return current.copy(draft = current.draft.filter { it.word !in successes }, acknowledged = current.acknowledged + successes)
}

class VideoLiveStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("video-study-live", Context.MODE_PRIVATE)
    private val gson = Gson()
    fun load(): VideoLiveSession = runCatching {
        gson.fromJson(prefs.getString("session-v1", "{}"), VideoLiveSession::class.java)?.let {
            it.copy(draft = it.draft.take(300).filter { word -> normalizeStudyWord(word.word) != null }.distinctBy { word -> word.word })
        } ?: VideoLiveSession()
    }.getOrDefault(VideoLiveSession())
    fun save(session: VideoLiveSession) { prefs.edit().putString("session-v1", gson.toJson(session)).apply() }
}

data class VideoLiveState(
    val session: VideoLiveSession = VideoLiveSession(), val document: VideoStudyDocument? = null,
    val job: VideoImportJob? = null, val groups: List<WordGroup> = emptyList(),
    val candidates: List<VideoCandidate>? = null, val busy: Boolean = false,
    val message: String = "", val health: String = "正在连接服务…",
    val history: List<StudyHistoryItem> = emptyList(), val historyError: String = "",
) {
    val running: Boolean get() = session.pending != null || (session.jobId.isNotEmpty() && (job == null || job.status in listOf("queued", "running")))
}

class VideoStudyLiveModel(context: Context, private val api: PlatypusApi = ApiFactory.api) : ViewModel() {
    private val store = VideoLiveStore(context)
    private val articleStore = VideoStudyHistoryStore(context)
    private val examples = loadDemoVideoDocuments(context).map { it.copy(channel = "内置文章", status = "ready") }
    private val initialSession = store.load().let { current ->
        var draft = current.draft
        if (!current.examplesMigrated) VideoStudyDraftStore(context).load().forEach { item ->
            draft = addDraftWord(draft, item.word)
            item.sources.forEach { draft = addDraftWord(draft, item.word, it) }
        }
        current.copy(draft = draft, documentId = current.documentId.ifBlank { examples.first().id }, examplesMigrated = true).also(store::save)
    }
    private val mutable = MutableStateFlow(VideoLiveState(session = initialSession,
        document = articleStore.document(initialSession.documentId) ?: examples.first(),
        history = mergeStudyHistory(articleStore.entries(), examples.map { it.historyItem() })))
    val state = mutable.asStateFlow()
    private var lastHealth = 0L
    private var lastDocumentPoll = 0L

    init {
        viewModelScope.launch {
            withContext(Dispatchers.IO) { runCatching { examples.forEach { if (articleStore.document(it.id) == null) articleStore.remember(it) } } }
            refreshHistory()
        }
        viewModelScope.launch {
            while (isActive) {
                if (System.currentTimeMillis() - lastHealth > 15_000) {
                    attempt(notify = false) {
                        val status = api.videoStatus()
                        mutable.update { it.copy(groups = status.groups, health = when {
                            !status.workerReady -> "后台处理服务尚未就绪，任务会在队列中保留。"
                            !status.captionsConfigured -> "字幕服务未配置，可先导入 SRT / VTT 字幕。"
                            else -> "后台服务已连接 · 选词不会自动调用 LLM"
                        }) }
                    }
                    lastHealth = System.currentTimeMillis()
                }
                val pending = mutable.value.session.pending
                if (pending != null) {
                    try {
                        val job = api.createVideoImport(pending).job
                        updateSession { it.copy(pending = null, jobId = job.id, acknowledged = emptyList()) }
                        mutable.update { it.copy(job = job, message = "收藏任务已提交，退出页面也会继续处理。") }
                    } catch (error: CancellationException) { throw error }
                    catch (error: Exception) {
                        if (error is HttpException && error.code() in 400..499) updateSession { it.copy(pending = null) }
                        mutable.update { it.copy(message = "${errorMessage(error)}。草稿已保留；网络中断时会用同一批次编号重连。") }
                    }
                }
                val current = mutable.value
                if (current.session.documentId.isNotEmpty() && !current.session.documentId.startsWith("demo-") && (current.document?.id != current.session.documentId || current.document.status in listOf("queued", "fetching", "translating"))) {
                    if (current.document?.id != current.session.documentId || current.document.sentences.size <= 600 || System.currentTimeMillis() - lastDocumentPoll >= 10_000) attempt(notify = false) {
                        lastDocumentPoll = System.currentTimeMillis()
                        val id = current.session.documentId
                        val document = api.videoDocument(id).document
                        rememberDocument(document)
                        mutable.update { if (it.session.documentId == id) it.copy(document = document) else it }
                    }
                }
                val snapshot = mutable.value
                if (snapshot.session.jobId.isNotEmpty() && (snapshot.job?.id != snapshot.session.jobId || snapshot.job.status in listOf("queued", "running"))) {
                    attempt { acceptJob(api.videoImport(mutable.value.session.jobId).job) }
                }
                delay(1800)
            }
        }
    }

    private fun updateSession(change: (VideoLiveSession) -> VideoLiveSession) {
        mutable.update { value -> val session = change(value.session); store.save(session); value.copy(session = session) }
    }
    private fun acceptJob(job: VideoImportJob) {
        updateSession { current -> applyVideoJob(current, job) }
        mutable.update { it.copy(job = job) }
    }
    private suspend fun rememberDocument(document: VideoStudyDocument, opened: Boolean = false) {
        val entries = withContext(Dispatchers.IO) { runCatching { articleStore.remember(document, opened) }.getOrNull() }
        mutable.update { it.copy(history = mergeStudyHistory(it.history, entries ?: listOf(document.historyItem())),
            message = if (entries == null) "文章未能保存到本机，当前仍可阅读，稍后可从云端记录重开。" else it.message) }
    }
    fun refreshHistory() {
        viewModelScope.launch {
            try {
                val remote = api.videoHistory().documents
                val entries = withContext(Dispatchers.IO) { articleStore.merge(remote) }
                mutable.update { it.copy(history = mergeStudyHistory(it.history, entries), historyError = "") }
            } catch (error: CancellationException) { throw error }
            catch (_: Exception) { mutable.update { it.copy(historyError = "暂时无法同步云端记录，仍可打开本机保存的文章。") } }
        }
    }
    fun openArticle(id: String) = runAction {
        val cached = examples.firstOrNull { it.id == id } ?: withContext(Dispatchers.IO) { articleStore.document(id) }
        val document = cached ?: api.videoDocument(id).document
        rememberDocument(document, true)
        updateSession { it.copy(documentId = document.id) }
        mutable.update { it.copy(document = document, candidates = null) }
    }
    private suspend fun attempt(notify: Boolean = true, action: suspend () -> Unit) {
        try { action() } catch (error: CancellationException) { throw error }
        catch (error: Exception) { mutable.update { if (notify) it.copy(message = errorMessage(error)) else it.copy(health = errorMessage(error)) } }
    }
    private fun runAction(action: suspend () -> Unit) {
        if (mutable.value.busy) return
        mutable.update { it.copy(busy = true, message = "") }
        viewModelScope.launch { try { attempt(action = action) } finally { mutable.update { it.copy(busy = false) } } }
    }
    fun search(query: String) = runAction {
        require(query.isNotBlank()) { "请先输入视频标题或链接" }
        val candidates = api.videoSearch(mapOf("query" to query.trim())).candidates
        mutable.update { it.copy(candidates = candidates) }
    }
    fun openVideo(id: String) = openDocument(mapOf("videoId" to id))
    fun uploadSubtitle(title: String, subtitle: String) = openDocument(mapOf("source" to "upload", "title" to title.ifBlank { "导入字幕" }, "subtitle" to subtitle))
    private fun openDocument(body: Map<String, String>) = runAction {
        val document = api.createVideoDocument(body).document
        rememberDocument(document, true)
        updateSession { it.copy(documentId = document.id) }
        mutable.update { it.copy(document = document, candidates = null) }
    }
    fun retryDocument() = runAction {
        mutable.value.document?.let { current -> val document = api.retryVideoDocument(current.id).document; mutable.update { it.copy(document = document) } }
    }
    fun retryImport() = runAction {
        mutable.value.job?.let { acceptJob(api.retryVideoImport(it.id).job) }
    }
    fun setDraft(draft: List<DraftWord>) { if (!mutable.value.running) updateSession { it.copy(draft = draft) } }
    fun importWords(groupId: String) {
        val current = mutable.value
        if (current.running || groupId.isBlank() || current.session.draft.isEmpty()) return
        if (current.session.draft.size > 30) { message("每批最多 30 词，请先减少数量。"); return }
        updateSession { it.copy(pending = PendingVideoImport(UUID.randomUUID().toString(), groupId, it.draft)) }
    }
    fun message(text: String) { mutable.update { it.copy(message = text) } }
    fun dismissCandidates() { mutable.update { it.copy(candidates = null) } }
    private fun errorMessage(error: Exception): String {
        if (error is HttpException) {
            return runCatching { Gson().fromJson(error.response()?.errorBody()?.string(), Map::class.java)["error"] as? String }.getOrNull()
                ?: "服务暂不可用（${error.code()}），请检查服务器是否已更新。"
        }
        return if (error is IllegalArgumentException) error.message ?: "输入内容无效" else "连接中断，草稿和后台任务不会丢失，请检查网络后稍等。"
    }
}
