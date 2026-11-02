package com.anthonyaya.platypus.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.anthonyaya.platypus.data.model.WordGroup
import com.anthonyaya.platypus.ui.components.*
import com.anthonyaya.platypus.ui.theme.PlatypusColors
import com.anthonyaya.platypus.ui.theme.PlatypusTheme
import com.anthonyaya.platypus.ui.videostudy.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class VideoReaderActions(
    val search: (String) -> Unit = {}, val openVideo: (String) -> Unit = {},
    val upload: (String, String) -> Unit = { _, _ -> }, val openArticle: (String) -> Unit = {},
    val refreshHistory: () -> Unit = {}, val retryDocument: () -> Unit = {},
    val setDraft: (List<DraftWord>) -> Unit = {}, val importWords: (String) -> Unit = {},
    val retryImport: () -> Unit = {}, val message: (String) -> Unit = {},
)

@Composable
fun VideoStudyLiveScreen(initialGroups: List<WordGroup>, onImported: () -> Unit = {}) {
    val context = LocalContext.current
    val model: VideoStudyLiveModel = viewModel(key = "video-study-live", factory = remember(context) {
        object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = VideoStudyLiveModel(context.applicationContext) as T
        }
    })
    val state by model.state.collectAsStateWithLifecycle()
    var notifiedJob by rememberSaveable { mutableStateOf("") }
    val imported by rememberUpdatedState(onImported)
    LaunchedEffect(state.job) {
        state.job?.let { job ->
            val signature = "${job.id}:${job.items.count { it.status == "success" }}:${job.status}"
            if (job.status !in listOf("queued", "running") && job.items.any { it.status == "success" } && signature != notifiedJob) {
                notifiedJob = signature; imported()
            }
        }
    }
    VideoStudyReaderContent(state, initialGroups, VideoReaderActions(
        model::search, model::openVideo, model::uploadSubtitle, model::openArticle, model::refreshHistory,
        model::retryDocument, model::setDraft, model::importWords, model::retryImport, model::message,
    ))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VideoStudyReaderContent(state: VideoLiveState, initialGroups: List<WordGroup> = emptyList(), actions: VideoReaderActions = VideoReaderActions()) {
    val context = LocalContext.current
    var query by rememberSaveable { mutableStateOf("") }
    var panel by rememberSaveable { mutableStateOf("") }
    var showTranslation by rememberSaveable { mutableStateOf(true) }
    var selectedOnly by rememberSaveable { mutableStateOf(false) }
    var groupId by rememberSaveable { mutableStateOf("") }
    var upload by rememberSaveable { mutableStateOf(false) }
    var uploadTitle by rememberSaveable { mutableStateOf("") }
    var subtitle by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    val readingList = rememberLazyListState()
    val groups = state.groups.ifEmpty { initialGroups }
    val target = groups.firstOrNull { it.id == groupId } ?: groups.firstOrNull()
    val draft = state.session.draft
    val selected = draft.map { it.word }.toSet()
    val document = state.document
    LaunchedEffect(document?.id) { selectedOnly = false; readingList.scrollToItem(0) }
    LaunchedEffect(state.message) {
        if (state.message.isNotBlank()) { snackbar.showSnackbar(state.message, actionLabel = "关闭"); actions.message("") }
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            val text = withContext(Dispatchers.IO) {
                runCatching { context.contentResolver.openInputStream(uri)?.use { stream ->
                    val output = java.io.ByteArrayOutputStream()
                    val buffer = ByteArray(8192)
                    while (output.size() <= 500_000) { val n = stream.read(buffer); if (n < 0) break; output.write(buffer, 0, n) }
                    require(output.size() <= 500_000) { "字幕文件不能超过 500 KB" }
                    output.toString("UTF-8")
                } }.getOrElse { actions.message(it.message ?: "无法读取字幕文件"); null }
            }
            if (text != null) { subtitle = text; upload = true }
        }
    }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize().testTag("video-reader"), state = readingList,
            contentPadding = PaddingValues(start = 17.dp, end = 17.dp, top = 12.dp, bottom = 150.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text(document?.title ?: "视频学词", fontFamily = FontFamily.Serif, fontSize = 28.sp, lineHeight = 35.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                        if (!document?.duration.isNullOrBlank()) Text(document?.duration.orEmpty(), color = PlatypusColors.Muted, style = MaterialTheme.typography.labelSmall)
                    }
                    TextButton(onClick = { panel = "history"; actions.refreshHistory() }, contentPadding = PaddingValues(horizontal = 4.dp), modifier = Modifier.testTag("video-open-history")) { Text("↶ 学习记录", fontSize = 12.sp) }
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("${document?.sentences?.size ?: 0} 句", Modifier.weight(1f), color = PlatypusColors.Muted, style = MaterialTheme.typography.labelSmall)
                    ToggleLabel("中文", showTranslation) { showTranslation = it }
                    ToggleLabel("只看已选", selectedOnly) { selectedOnly = it }
                }
                if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            }
            if (document?.status in listOf("queued", "fetching", "translating")) item {
                Text(if (document?.status == "translating") "翻译中 ${document.sentences.count { it.chinese.isNotBlank() }}/${document.sentences.size} 句" else "正在获取字幕…", color = PlatypusColors.Muted, style = MaterialTheme.typography.bodySmall)
            }
            if (!document?.error.isNullOrBlank()) item {
                Text(document?.error.orEmpty(), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                if (document?.status in listOf("partial", "failed")) TextButton(onClick = actions.retryDocument, enabled = !state.busy) { Text("重试未完成部分") }
            }
            val visible = document?.sentences.orEmpty().filter { !selectedOnly || tokenizeSubtitle(it.english).any { token -> token.word in selected } }
            items(visible, key = { it.id }) { sentence ->
                SubtitleSentenceCard(sentence, selected, showTranslation, !state.running) { word ->
                    actions.setDraft(if (word in selected) draft.filter { it.word != word } else addDraftWord(draft, word, WordSource(document!!.id, document.title, sentence.id, sentence.time, sentence.english)))
                }
            }
            if (visible.isEmpty()) item { Text(if (selectedOnly) "没有已选单词的句子。" else "点击右下角查找文章，或从学习记录中打开。", color = PlatypusColors.Muted, style = MaterialTheme.typography.bodySmall) }
        }
        Column(Modifier.align(Alignment.BottomEnd).padding(end = 15.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ReaderCircle("search", "查找文章", Modifier.testTag("video-open-search")) { panel = "search" }
            ReaderCircle("draft", "缓存区，${draft.size} 个单词", Modifier.testTag("video-open-draft"), draft.size) { panel = "draft" }
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).padding(start = 12.dp, end = 12.dp, bottom = 140.dp))
    }

    if (panel.isNotEmpty()) ModalBottomSheet(onDismissRequest = { panel = "" }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = PlatypusColors.Paper) {
        when (panel) {
            "search" -> LazyColumn(Modifier.fillMaxWidth().heightIn(max = 650.dp), contentPadding = PaddingValues(start = 18.dp, end = 18.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item { SheetTitle("查找文章") { panel = "" } }
                item {
                    OutlinedTextField(query, { if (it.length <= 200) query = it }, Modifier.fillMaxWidth(), label = { Text("YouTube 标题或链接") }, singleLine = true,
                        trailingIcon = { TextButton(onClick = { actions.search(query) }, enabled = !state.busy && query.isNotBlank()) { Text("查找") } })
                    TextButton(onClick = { upload = !upload }) { Text("导入 SRT / VTT 字幕") }
                }
                if (upload) item {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedTextField(uploadTitle, { if (it.length <= 200) uploadTitle = it }, Modifier.fillMaxWidth(), label = { Text("字幕标题") })
                        TextButton(onClick = { picker.launch(arrayOf("*/*")) }) { Text("选择字幕文件") }
                        OutlinedTextField(subtitle, { if (it.length <= 500_000) subtitle = it }, Modifier.fillMaxWidth().heightIn(max = 180.dp), label = { Text("或粘贴字幕内容") }, minLines = 3)
                        InkButton("打开并翻译", { actions.upload(uploadTitle, subtitle); panel = ""; upload = false }, enabled = !state.busy && subtitle.isNotBlank(), modifier = Modifier.fillMaxWidth())
                    }
                }
                if (state.busy) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
                if (!state.health.startsWith("后台服务已连接")) item { Text(state.health, color = PlatypusColors.Muted, style = MaterialTheme.typography.bodySmall) }
                state.candidates?.let { candidates ->
                    if (candidates.isEmpty()) item { Text("没有找到结果，请尝试视频链接。") }
                    items(candidates, key = { it.id }) { candidate ->
                        Column(Modifier.fillMaxWidth().clickable(enabled = !state.busy) { actions.openVideo(candidate.id); panel = "" }.padding(vertical = 13.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            Text(candidate.title, fontFamily = FontFamily.Serif, fontSize = 19.sp)
                            Text("${candidate.channel} · ${candidate.duration}", color = PlatypusColors.Muted, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
            "history" -> LazyColumn(Modifier.fillMaxWidth().heightIn(max = 650.dp).testTag("video-history-list"), contentPadding = PaddingValues(start = 18.dp, end = 18.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                item { SheetTitle("学习记录") { panel = "" } }
                if (state.historyError.isNotBlank()) item { Text(state.historyError, color = PlatypusColors.Muted, style = MaterialTheme.typography.bodySmall) }
                items(state.history, key = { it.id }) { article ->
                    Surface(Modifier.fillMaxWidth().clickable(enabled = !state.busy) { actions.openArticle(article.id); panel = "" }, color = if (article.id == document?.id) PlatypusColors.SoftGreen else Color.Transparent, shape = MaterialTheme.shapes.medium) {
                        Column(Modifier.padding(13.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(article.title, fontFamily = FontFamily.Serif, fontSize = 21.sp, lineHeight = 27.sp)
                            Text("${if (article.isExample) "内置 · " else ""}${article.sentenceCount} 句${article.duration.takeIf { it.isNotBlank() }?.let { " · $it" }.orEmpty()}", color = PlatypusColors.Muted, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
            "draft" -> {
                if (!state.job?.error.isNullOrBlank()) Text(state.job?.error.orEmpty(), Modifier.padding(horizontal = 18.dp), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                VideoDraftPanel(draft, groups, target?.id.orEmpty(), state.running, false,
                    state.job?.items?.map { it.displayItem() }.orEmpty(), state.job?.groupName.orEmpty(),
                    actions.setDraft, { if (!state.running) groupId = it }, {},
                    { target?.let { actions.importWords(it.id) } }, actions.retryImport, { panel = "" },
                    live = true, canRetry = state.job?.status in listOf("partial", "failed"))
            }
        }
    }
}

@Composable
private fun SheetTitle(title: String, close: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(title, Modifier.weight(1f), style = MaterialTheme.typography.headlineSmall)
        TextButton(onClick = close) { Text("关闭") }
    }
}

@Composable
private fun ReaderCircle(kind: String, description: String, modifier: Modifier = Modifier, count: Int = 0, onClick: () -> Unit) {
    val dark = kind == "draft"
    Box {
        Surface(modifier.size(52.dp).semantics { contentDescription = description }.clickable(role = Role.Button, onClick = onClick), shape = CircleShape,
            color = if (dark) PlatypusColors.Ink else PlatypusColors.Paper, shadowElevation = 5.dp, border = androidx.compose.foundation.BorderStroke(1.dp, PlatypusColors.Line)) {
            Box(contentAlignment = Alignment.Center) {
                Canvas(Modifier.size(24.dp)) {
                    val ink = if (dark) Color.White else PlatypusColors.Ink
                    val stroke = Stroke(1.7.dp.toPx())
                    if (!dark) {
                        drawCircle(ink, 6.5.dp.toPx(), Offset(10.dp.toPx(), 10.dp.toPx()), style = stroke)
                        drawLine(ink, Offset(15.dp.toPx(), 15.dp.toPx()), Offset(21.dp.toPx(), 21.dp.toPx()), strokeWidth = 1.7.dp.toPx())
                    } else {
                        drawRoundRect(ink, Offset(6.dp.toPx(), 5.dp.toPx()), Size(15.dp.toPx(), 16.dp.toPx()), androidx.compose.ui.geometry.CornerRadius(2.dp.toPx()), style = stroke)
                        drawLine(ink, Offset(2.dp.toPx(), 17.dp.toPx()), Offset(2.dp.toPx(), 2.dp.toPx()), strokeWidth = 1.7.dp.toPx())
                        drawLine(ink, Offset(2.dp.toPx(), 2.dp.toPx()), Offset(16.dp.toPx(), 2.dp.toPx()), strokeWidth = 1.7.dp.toPx())
                    }
                }
            }
        }
        if (count > 0) Badge(Modifier.align(Alignment.TopEnd).offset(x = 4.dp, y = (-4).dp), containerColor = PlatypusColors.OrangeDark) { Text(if (count > 99) "99+" else "$count") }
    }
}

@Preview(name = "阅读优先 · 手机", widthDp = 390, heightDp = 844, showBackground = true)
@Composable
private fun ReaderPreview() {
    val examples = loadDemoVideoDocuments(LocalContext.current).map { it.copy(channel = "内置文章") }
    PlatypusTheme { Surface(color = PlatypusColors.Paper) { VideoStudyReaderContent(VideoLiveState(document = examples.first(), history = examples.map { it.historyItem() })) } }
}
