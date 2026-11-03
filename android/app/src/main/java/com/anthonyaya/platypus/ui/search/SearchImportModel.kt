package com.anthonyaya.platypus.ui.search

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.anthonyaya.platypus.data.remote.ApiFactory
import com.anthonyaya.platypus.data.remote.PlatypusApi
import com.anthonyaya.platypus.ui.videostudy.*
import com.google.gson.Gson
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import retrofit2.HttpException
import java.util.UUID

data class ParsedSearchWords(val words: List<String>, val error: String = "")
private val separators = Regex("[\\s,，;；、]+")
fun appendSearchWords(current: List<String>, raw: String): ParsedSearchWords {
    if (raw.length > 10000) return ParsedSearchWords(current, "输入过长，请每批添加不超过30个单词")
    val tokens = raw.trim().split(separators).filter { it.isNotBlank() }
    val invalid = tokens.filter { normalizeStudyWord(it) == null }
    if (invalid.isNotEmpty()) return ParsedSearchWords(current, "请检查无效内容：${invalid.take(3).joinToString("、") { it.take(48) }}")
    val words = (current + tokens.mapNotNull(::normalizeStudyWord)).distinct()
    return if (words.size > 30) ParsedSearchWords(current, "每批最多30个单词，请分批添加；当前输入已保留") else ParsedSearchWords(words)
}
fun activeSearchPrefix(raw: String) = raw.split(separators).lastOrNull().orEmpty()
fun completeSearchPrefix(raw: String, word: String) = raw.dropLast(activeSearchPrefix(raw).length) + word

class SearchImportStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("search-import", Context.MODE_PRIVATE)
    private val gson = Gson()
    fun load(): VideoLiveSession = runCatching {
        val session = gson.fromJson(prefs.getString("session-v1", "{}"), VideoLiveSession::class.java) ?: VideoLiveSession()
        require(session.draft.size <= 30 && session.draft.all { normalizeStudyWord(it.word) == it.word })
        session.pending?.let { pending ->
            require(pending.requestId.matches(Regex("^[A-Za-z0-9_-]{16,80}$")) && pending.groupId.isNotBlank()
                && pending.words.size in 1..30 && pending.words.all { normalizeStudyWord(it.word) == it.word })
        }
        session.copy(draft = session.draft.distinctBy { it.word })
    }.getOrDefault(VideoLiveSession())
    fun save(session: VideoLiveSession) { prefs.edit().putString("session-v1", gson.toJson(session)).apply() }
}

data class SearchImportState(val session: VideoLiveSession = VideoLiveSession(), val job: VideoImportJob? = null,
    val busy: Boolean = false, val message: String = "") {
    val running get() = busy || session.pending != null || (session.jobId.isNotEmpty() && (job == null || job.status in listOf("queued", "running")))
}

class SearchImportModel(context: Context, private val api: PlatypusApi = ApiFactory.api) : ViewModel() {
    private val store = SearchImportStore(context)
    private val mutable = MutableStateFlow(SearchImportState(session = store.load()))
    val state = mutable.asStateFlow()
    private fun change(fn: (VideoLiveSession) -> VideoLiveSession) {
        mutable.update { current -> current.copy(session = fn(current.session).also(store::save)) }
    }
    private fun accept(job: VideoImportJob) {
        mutable.update { it.copy(job = job, session = applyVideoJob(it.session, job).also(store::save)) }
    }
    fun message(value: String) { mutable.update { it.copy(message = value) } }
    fun add(raw: String): Boolean {
        if (state.value.running) return false
        val parsed = appendSearchWords(state.value.session.draft.map { it.word }, raw)
        if (parsed.error.isNotBlank()) { message(parsed.error); return false }
        change { it.copy(draft = parsed.words.map { word -> DraftWord(word) }) }; message(""); return true
    }
    fun remove(word: String) { if (!state.value.running) change { it.copy(draft = it.draft.filter { item -> item.word != word }) } }
    fun submit(groupId: String) {
        val current = state.value
        if (current.running || groupId.isBlank() || current.session.draft.isEmpty()) return
        val pending = PendingVideoImport(UUID.randomUUID().toString(), groupId, current.session.draft.map { it.copy(sources = emptyList()) })
        change { it.copy(pending = pending, jobId = "", acknowledged = emptyList()) }
        mutable.update { it.copy(job = null, message = "正在提交，草稿已保存。") }
    }
    fun retry() {
        val current = state.value
        if (current.running || current.job == null || current.job.items.filter { it.status == "failed" }.any { item -> current.session.draft.none { it.word == item.word } }) return
        mutable.update { it.copy(busy = true) }
        viewModelScope.launch {
            try { accept(api.retryVideoImport(current.job.id).job); message("已重新提交失败项。") }
            catch (error: CancellationException) { throw error }
            catch (error: Exception) { message(safeError(error)) }
            finally { mutable.update { it.copy(busy = false) } }
        }
    }
    init {
        viewModelScope.launch {
            while (isActive) {
                val pending = state.value.session.pending
                if (pending != null) {
                    try {
                        val job = api.createVideoImport(pending).job
                        change { it.copy(pending = null, jobId = job.id, acknowledged = emptyList()) }
                        accept(job); message("已提交，关闭面板也会继续处理。")
                    } catch (error: CancellationException) { throw error }
                    catch (error: Exception) {
                        if (error is HttpException && error.code() in 400..499) change { it.copy(pending = null) }
                        message("${safeError(error)}。草稿已保留；网络中断时使用同一批次编号重连。")
                        delay(6000)
                    }
                }
                val current = state.value
                if (current.session.jobId.isNotBlank() && current.session.pending == null
                    && (current.job == null || current.job.status in listOf("queued", "running"))) {
                    try { accept(api.videoImport(current.session.jobId).job) }
                    catch (error: CancellationException) { throw error }
                    catch (_: Exception) { message("暂时无法同步进度，任务仍保留在服务器。"); delay(6000) }
                }
                delay(1800)
            }
        }
    }
    private fun safeError(error: Exception): String = if (error is HttpException) runCatching {
        Gson().fromJson(error.response()?.errorBody()?.string(), Map::class.java)["error"] as? String
    }.getOrNull() ?: "服务器暂不可用（${error.code()}）" else "网络连接失败，请稍后重试"
}
