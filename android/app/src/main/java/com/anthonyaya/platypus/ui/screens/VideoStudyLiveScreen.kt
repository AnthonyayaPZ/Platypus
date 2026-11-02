package com.anthonyaya.platypus.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.anthonyaya.platypus.data.model.WordGroup
import com.anthonyaya.platypus.ui.components.*
import com.anthonyaya.platypus.ui.theme.PlatypusColors
import com.anthonyaya.platypus.ui.videostudy.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
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
    var query by rememberSaveable { mutableStateOf("") }
    var showDraft by rememberSaveable { mutableStateOf(false) }
    var showTranslation by rememberSaveable { mutableStateOf(true) }
    var selectedOnly by rememberSaveable { mutableStateOf(false) }
    var groupId by rememberSaveable { mutableStateOf("") }
    var upload by rememberSaveable { mutableStateOf(false) }
    var uploadTitle by rememberSaveable { mutableStateOf("") }
    var subtitle by remember { mutableStateOf("") }
    var notifiedJob by rememberSaveable { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val groups = state.groups.ifEmpty { initialGroups }
    val target = groups.firstOrNull { it.id == groupId } ?: groups.firstOrNull()
    val draft = state.session.draft
    val selected = draft.map { it.word }.toSet()
    val document = state.document
    val importCallback by rememberUpdatedState(onImported)

    LaunchedEffect(state.job) {
        state.job?.let { job ->
            val signature = "${job.id}:${job.items.count { it.status == "success" }}:${job.status}"
            if (job.status !in listOf("queued", "running") && job.items.any { it.status == "success" } && signature != notifiedJob) {
                notifiedJob = signature; importCallback()
            }
        }
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            val text = withContext(Dispatchers.IO) {
                runCatching { context.contentResolver.openInputStream(uri)?.use { stream ->
                    val bytes = stream.readBytesLimited(500_001)
                    require(bytes.size <= 500_000) { "字幕文件不能超过 500 KB" }
                    bytes.toString(Charsets.UTF_8)
                } }.getOrElse { model.message(it.message ?: "无法读取字幕文件"); null }
            }
            if (text != null) { subtitle = text; upload = true }
        }
    }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize().padding(bottom = 88.dp), contentPadding = PaddingValues(17.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item { PageHeader("Learn from every sentence", "视频学词", "读一段字幕，捡起值得记住的单词。") }
            item {
                Surface(color = Color(0xFFFAF0DE), shape = RoundedCornerShape(10.dp)) {
                    Text(state.health, Modifier.padding(13.dp), style = MaterialTheme.typography.bodySmall, color = Color(0xFF8A6C3E))
                }
            }
            item {
                OutlinedTextField(query, { if (it.length <= 200) query = it }, Modifier.fillMaxWidth(), label = { Text("YouTube 标题或链接") }, singleLine = true,
                    trailingIcon = { TextButton(onClick = { model.search(query) }, enabled = !state.busy && query.isNotBlank()) { Text("查找") } }, shape = RoundedCornerShape(12.dp))
                TextButton(onClick = { upload = !upload }) { Text("已有字幕？导入 SRT / VTT →") }
            }
            if (upload) item {
                PaperCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedTextField(uploadTitle, { if (it.length <= 200) uploadTitle = it }, Modifier.fillMaxWidth(), label = { Text("字幕标题") })
                        TextButton(onClick = { picker.launch(arrayOf("*/*")) }) { Text("选择字幕文件（最多 500 KB）") }
                        OutlinedTextField(subtitle, { if (it.length <= 500_000) subtitle = it }, Modifier.fillMaxWidth().heightIn(max = 180.dp), label = { Text("或粘贴 SRT / VTT 内容") }, minLines = 3)
                        InkButton("整理字幕并翻译", { model.uploadSubtitle(uploadTitle, subtitle); upload = false }, enabled = !state.busy && subtitle.isNotBlank(), modifier = Modifier.fillMaxWidth())
                    }
                }
            }
            if (state.busy) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
            state.candidates?.let { candidates ->
                item { Text("确认你想学习的视频", style = MaterialTheme.typography.titleMedium) }
                if (candidates.isEmpty()) item { Text("没有找到结果，请尝试视频链接。") }
                items(candidates, key = { "candidate-${it.id}" }) { candidate ->
                    PaperCard(Modifier.fillMaxWidth().clickable(enabled = !state.busy) { model.openVideo(candidate.id) }) {
                        Row(Modifier.padding(15.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text("▶", color = PlatypusColors.OrangeDark)
                            Column(Modifier.weight(1f)) { Text(candidate.title, fontFamily = FontFamily.Serif, fontSize = 19.sp); Text("${candidate.channel} · ${candidate.duration}", style = MaterialTheme.typography.labelSmall, color = PlatypusColors.Muted) }
                            Text("→")
                        }
                    }
                }
            }
            if (state.message.isNotBlank()) item { Text(state.message, color = PlatypusColors.OrangeDark, style = MaterialTheme.typography.bodySmall) }
            item {
                TinyPill("YOUR TRANSCRIPT")
                Text(document?.title ?: "从一个感兴趣的视频开始", fontFamily = FontFamily.Serif, fontSize = 28.sp, lineHeight = 35.sp)
                Text(document?.let { "${it.channel} · ${it.duration}" } ?: "搜索标题、粘贴链接，或导入英文字幕。", style = MaterialTheme.typography.bodySmall, color = PlatypusColors.Muted)
            }
            if (document?.status in listOf("queued", "fetching", "translating")) item {
                Text(if (document?.status == "translating") "英文已就绪，正在翻译 ${document.sentences.count { it.translationStatus == "ready" }}/${document.sentences.size} 句… 现在就可以选词。" else "正在排队或获取英文字幕…", color = PlatypusColors.Muted, style = MaterialTheme.typography.bodySmall)
            }
            if (!document?.error.isNullOrBlank()) item {
                Text(document?.error.orEmpty(), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                if (document?.status in listOf("partial", "failed")) TextButton(onClick = model::retryDocument, enabled = !state.busy) { Text("重试未完成部分") }
            }
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("${document?.sentences?.size ?: 0} 句字幕", Modifier.weight(1f), style = MaterialTheme.typography.labelSmall)
                    ToggleLabel("中文", showTranslation) { showTranslation = it }
                    ToggleLabel("只看已选", selectedOnly) { selectedOnly = it }
                }
            }
            val visible = document?.sentences.orEmpty().filter { !selectedOnly || tokenizeSubtitle(it.english).any { token -> token.word in selected } }
            items(visible, key = { "sentence-${it.id}" }) { sentence ->
                SubtitleSentenceCard(sentence, selected, showTranslation, !state.running) { word ->
                    model.setDraft(if (word in selected) draft.filter { it.word != word } else addDraftWord(draft, word, WordSource(document!!.id, document.title, sentence.id, sentence.time, sentence.english)))
                }
            }
            if (visible.isEmpty()) item { Text(if (selectedOnly) "没有已选单词的句子，关闭‘只看已选’试试。" else "字幕将在这里逐句显示。点词加入草稿，确认后再批量收藏。", color = PlatypusColors.Muted, style = MaterialTheme.typography.bodyMedium) }
            item { Text("跨视频保留本机草稿 · 只有手动提交后才生成并收藏", color = PlatypusColors.Muted, style = MaterialTheme.typography.bodySmall) }
        }
        Surface(Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(12.dp).clickable { showDraft = true }, color = PlatypusColors.Ink, shape = RoundedCornerShape(15.dp), shadowElevation = 8.dp) {
            Row(Modifier.padding(17.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("▧", color = Color(0xFFF2AA80), fontSize = 28.sp)
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) { Text("待收藏 ${draft.size} 词", color = Color.White, style = MaterialTheme.typography.titleSmall); Text(if (state.running) "后台处理中，点此查看" else "查看、编辑与批量提交", color = Color(0xFFB0C1B4), style = MaterialTheme.typography.labelSmall) }
                Text("展开 ↑", color = Color(0xFFE8B18B))
            }
        }
    }
    if (showDraft) ModalBottomSheet(onDismissRequest = { showDraft = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = PlatypusColors.Paper) {
        if (state.message.isNotBlank()) Text(state.message, Modifier.padding(horizontal = 17.dp), color = PlatypusColors.OrangeDark, style = MaterialTheme.typography.bodySmall)
        if (!state.job?.error.isNullOrBlank()) Text(state.job?.error.orEmpty(), Modifier.padding(horizontal = 17.dp), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        VideoDraftPanel(draft = draft, groups = groups, groupId = target?.id.orEmpty(), running = state.running, simulateFailure = false,
            batch = state.job?.items?.map { it.displayItem() }.orEmpty(), batchGroup = state.job?.groupName.orEmpty(),
            onDraftChange = model::setDraft, onSelectGroup = { if (!state.running) groupId = it }, onSimulateFailure = {},
            onImport = { target?.let { model.importWords(it.id) } }, onRetry = model::retryImport, onClose = { showDraft = false }, live = true,
            canRetry = state.job?.status in listOf("partial", "failed"))
    }
}

private fun java.io.InputStream.readBytesLimited(limit: Int): ByteArray {
    val output = java.io.ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    while (output.size() < limit) {
        val count = read(buffer, 0, minOf(buffer.size, limit - output.size()))
        if (count < 0) break
        output.write(buffer, 0, count)
    }
    return output.toByteArray()
}
