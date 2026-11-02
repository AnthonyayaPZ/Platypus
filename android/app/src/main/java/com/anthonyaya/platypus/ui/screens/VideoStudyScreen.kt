package com.anthonyaya.platypus.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.anthonyaya.platypus.data.model.WordGroup
import com.anthonyaya.platypus.ui.components.GroupDropdown
import com.anthonyaya.platypus.ui.components.InkButton
import com.anthonyaya.platypus.ui.components.PageHeader
import com.anthonyaya.platypus.ui.components.PaperCard
import com.anthonyaya.platypus.ui.components.TinyPill
import com.anthonyaya.platypus.ui.theme.PlatypusColors
import com.anthonyaya.platypus.ui.theme.PlatypusTheme
import com.anthonyaya.platypus.ui.videostudy.DraftWord
import com.anthonyaya.platypus.ui.videostudy.ImportItem
import com.anthonyaya.platypus.ui.videostudy.ImportStatus
import com.anthonyaya.platypus.ui.videostudy.SubtitleSentence
import com.anthonyaya.platypus.ui.videostudy.VideoStudyDocument
import com.anthonyaya.platypus.ui.videostudy.VideoStudyDraftStore
import com.anthonyaya.platypus.ui.videostudy.WordSource
import com.anthonyaya.platypus.ui.videostudy.addDraftWord
import com.anthonyaya.platypus.ui.videostudy.loadDemoVideoDocuments
import com.anthonyaya.platypus.ui.videostudy.normalizeStudyWord
import com.anthonyaya.platypus.ui.videostudy.renameDraftWord
import com.anthonyaya.platypus.ui.videostudy.tokenizeSubtitle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val DemoGroups = listOf(
    WordGroup(id = "demo-default", name = "默认收藏（演示）"),
    WordGroup(id = "demo-video", name = "视频生词（演示）"),
)

@Composable
fun VideoStudyScreen(groups: List<WordGroup>, onImported: () -> Unit = {}) {
    VideoStudyLiveScreen(groups, onImported)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VideoStudyDemoContent(
    documents: List<VideoStudyDocument>,
    groups: List<WordGroup> = DemoGroups,
    initialDraft: List<DraftWord> = emptyList(),
    onDraftChange: (List<DraftWord>) -> Unit = {},
) {
    val targets = groups.ifEmpty { DemoGroups }
    var document by remember { mutableStateOf(documents.first()) }
    var query by remember { mutableStateOf("") }
    var candidates by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var draft by remember { mutableStateOf(initialDraft) }
    var showDraft by remember { mutableStateOf(false) }
    var showTranslation by remember { mutableStateOf(true) }
    var selectedOnly by remember { mutableStateOf(false) }
    var groupId by remember { mutableStateOf("") }
    var batchGroup by remember { mutableStateOf("") }
    var batch by remember { mutableStateOf<List<ImportItem>>(emptyList()) }
    var running by remember { mutableStateOf(false) }
    var simulateFailure by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val selectedWords = draft.map { it.word }.toSet()
    val targetGroup = targets.firstOrNull { it.id == groupId } ?: targets.first()

    LaunchedEffect(draft) { onDraftChange(draft) }

    fun importWords(retry: Boolean) {
        if (running) return
        val words = if (retry) batch.filter { it.status == ImportStatus.Failed }.map { it.word } else draft.map { it.word }
        if (words.isEmpty()) return
        if (words.size > 30) { message = "演示批次最多处理 30 个词。"; return }
        running = true
        showDraft = true
        if (!retry) batchGroup = targetGroup.name
        batch = if (retry) batch.map { if (it.status == ImportStatus.Failed) it.copy(status = ImportStatus.Waiting) else it }
            else words.map { ImportItem(it) }
        scope.launch {
            try {
                words.forEachIndexed { index, word ->
                    batch = batch.map { if (it.word == word) it.copy(status = ImportStatus.Processing) else it }
                    delay(550)
                    val failed = !retry && simulateFailure && index == 0
                    batch = batch.map { if (it.word == word) it.copy(status = if (failed) ImportStatus.Failed else ImportStatus.Success) else it }
                    if (!failed) draft = draft.filter { it.word != word }
                }
                message = "演示批次已结束，没有写入真实词库。"
            } finally {
                running = false
            }
        }
    }

    Box(Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(bottom = 90.dp).testTag("video-study-list"),
            contentPadding = PaddingValues(start = 17.dp, end = 17.dp, top = 26.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                PageHeader("Learn from every sentence", "视频学词", "读一段字幕，捡起值得记住的单词。")
            }
            item {
                Surface(color = Color(0xFFFAF0DE), shape = RoundedCornerShape(10.dp)) {
                    Column(Modifier.padding(13.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("✦ 交互 Demo", color = Color(0xFF8A6C3E), style = MaterialTheme.typography.labelMedium)
                        Text("使用自编示例字幕。搜索、翻译和收藏均为演示，不访问 YouTube / LLM，不写入真实词库。", color = Color(0xFF8A6C3E), style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            item {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { Text("YouTube 视频标题或链接") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    trailingIcon = { TextButton(onClick = { candidates = true }) { Text("查找") } },
                )
            }
            if (candidates) {
                item {
                    PaperCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(15.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("选择示例视频", style = MaterialTheme.typography.titleMedium)
                            Text("当前为演示候选，使用内置素材体验加载字幕流程。", style = MaterialTheme.typography.bodySmall, color = PlatypusColors.Muted)
                            documents.forEach { candidate ->
                                Surface(
                                    modifier = Modifier.fillMaxWidth().clickable(enabled = !loading) {
                                        candidates = false
                                        loading = true
                                        scope.launch {
                                            delay(500)
                                            document = candidate
                                            selectedOnly = false
                                            loading = false
                                        }
                                    },
                                    shape = RoundedCornerShape(9.dp), color = PlatypusColors.SoftGreen,
                                ) {
                                    Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Text("▶", color = PlatypusColors.OrangeDark)
                                        Column(Modifier.weight(1f)) {
                                            Text(candidate.title, fontFamily = FontFamily.Serif, fontSize = 18.sp)
                                            Text(candidate.channel, style = MaterialTheme.typography.labelSmall, color = PlatypusColors.Muted)
                                        }
                                        Text(candidate.duration, style = MaterialTheme.typography.labelSmall)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    TinyPill("DEMO TRANSCRIPT")
                    Text(document.title, fontFamily = FontFamily.Serif, fontSize = 29.sp, lineHeight = 35.sp)
                    Text("${document.channel} · ${document.duration}", style = MaterialTheme.typography.bodySmall, color = PlatypusColors.Muted)
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text("${document.sentences.size} 句字幕", style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f))
                        ToggleLabel("中文", showTranslation) { showTranslation = it }
                        ToggleLabel("只看已选", selectedOnly) { selectedOnly = it }
                    }
                }
            }
            if (loading) item { Text("正在整理演示字幕…", modifier = Modifier.padding(30.dp), color = PlatypusColors.Muted) }
            else {
                val visible = document.sentences.filter { sentence ->
                    !selectedOnly || tokenizeSubtitle(sentence.english).any { it.word in selectedWords }
                }
                items(visible, key = { it.id }) { sentence ->
                    SubtitleSentenceCard(sentence, selectedWords, showTranslation, !running) { word ->
                        draft = if (word in selectedWords) draft.filter { it.word != word }
                        else addDraftWord(draft, word, WordSource(document.id, document.title, sentence.id, sentence.time, sentence.english))
                    }
                }
                if (visible.isEmpty()) item { Text("还没有选词。关闭“只看已选”，点击一个词试试。", style = MaterialTheme.typography.bodyMedium, color = PlatypusColors.Muted) }
            }
            item { Text("点一下加入待收藏区，再点一下取消。相同单词会同步高亮。", style = MaterialTheme.typography.bodySmall, color = PlatypusColors.Muted) }
            if (message.isNotBlank()) item { Text(message, color = PlatypusColors.OrangeDark, style = MaterialTheme.typography.bodySmall) }
        }
        Surface(
            modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(12.dp).testTag("video-open-draft").clickable { showDraft = true },
            color = PlatypusColors.Ink, shape = RoundedCornerShape(15.dp), shadowElevation = 8.dp,
        ) {
            Row(Modifier.padding(horizontal = 18.dp, vertical = 15.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("▧", fontSize = 29.sp, color = Color(0xFFF2AA80))
                Column(Modifier.weight(1f)) {
                    Text("待收藏 ${draft.size} 词", color = Color.White, style = MaterialTheme.typography.titleSmall)
                    Text(if (running) "批次处理中，点此查看" else "查看、编辑与批量提交", color = Color(0xFFB0C1B4), style = MaterialTheme.typography.labelSmall)
                }
                Text("展开 ↑", color = Color(0xFFE8B18B), style = MaterialTheme.typography.labelSmall)
            }
        }
    }

    if (showDraft) {
        ModalBottomSheet(
            onDismissRequest = { showDraft = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = PlatypusColors.Paper,
        ) {
            VideoDraftPanel(
                draft = draft, groups = targets, groupId = targetGroup.id,
                running = running, simulateFailure = simulateFailure,
                batch = batch, batchGroup = batchGroup,
                onDraftChange = { draft = it },
                onSelectGroup = { if (!running) groupId = it },
                onSimulateFailure = { simulateFailure = it },
                onImport = { importWords(false) }, onRetry = { importWords(true) },
                onClose = { showDraft = false },
            )
        }
    }
}

@Composable
internal fun ToggleLabel(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.toggleable(value = checked, role = Role.Checkbox, onValueChange = onChange), verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = checked, onCheckedChange = null)
        Text(label, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
internal fun SubtitleSentenceCard(
    sentence: SubtitleSentence,
    selectedWords: Set<String>,
    showTranslation: Boolean,
    enabled: Boolean,
    onWordClick: (String) -> Unit,
) {
    PaperCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
            TinyPill(sentence.time, background = PlatypusColors.SoftGreen)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                tokenizeSubtitle(sentence.english).forEach { token ->
                    val word = token.word
                    if (word != null) {
                        val isSelected = word in selectedWords
                        Surface(
                            modifier = Modifier
                                .testTag("video-word-${sentence.id}-$word")
                                .semantics { contentDescription = "选择单词 ${token.text}"; selected = isSelected }
                                .heightIn(min = 44.dp)
                                .border(1.dp, if (isSelected) Color(0xFF6E9C7C) else Color(0xFFDDDCD1), RoundedCornerShape(6.dp))
                                .clickable(enabled = enabled) { onWordClick(word) },
                            color = if (isSelected) PlatypusColors.Mint else Color(0xFFFBFAF5),
                            shape = RoundedCornerShape(6.dp),
                        ) {
                            Row(Modifier.padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(token.text, fontFamily = FontFamily.Serif, fontSize = 17.sp, lineHeight = 23.sp)
                                if (isSelected) Text("✓", fontSize = 10.sp, color = Color(0xFF4F7A59))
                            }
                        }
                    } else if (token.text.isNotBlank()) {
                        Text(token.text.trim(), modifier = Modifier.padding(top = 10.dp), fontFamily = FontFamily.Serif, fontSize = 17.sp, lineHeight = 23.sp)
                    }
                }
            }
            if (showTranslation) Text(sentence.chinese.ifBlank { if (sentence.translationStatus == "failed") "本句翻译失败，可在上方重试。" else "中文翻译等待中…" }, color = Color(0xFF728278), style = MaterialTheme.typography.bodyMedium, fontSize = 15.sp, lineHeight = 24.sp)
        }
    }
}

@Composable
fun VideoDraftPanel(
    draft: List<DraftWord>,
    groups: List<WordGroup>,
    groupId: String,
    running: Boolean,
    simulateFailure: Boolean,
    batch: List<ImportItem>,
    batchGroup: String,
    onDraftChange: (List<DraftWord>) -> Unit,
    onSelectGroup: (String) -> Unit,
    onSimulateFailure: (Boolean) -> Unit,
    onImport: () -> Unit,
    onRetry: () -> Unit,
    onClose: () -> Unit,
    live: Boolean = false,
    canRetry: Boolean = false,
) {
    var manualWord by remember { mutableStateOf("") }
    var editing by remember { mutableStateOf("") }
    var editValue by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var expandedSource by remember { mutableStateOf("") }
    var confirmClear by remember { mutableStateOf(false) }

    fun saveEdit() {
        if (normalizeStudyWord(editValue) == null) { error = "请输入有效的单个英文单词。"; return }
        onDraftChange(renameDraftWord(draft, editing, editValue))
        editing = ""
        error = ""
    }

    Column(Modifier.fillMaxWidth().heightIn(max = 720.dp).padding(horizontal = 20.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("${if (live) "缓存区" else "待收藏区"} · ${draft.size} 词", style = MaterialTheme.typography.headlineSmall)
            TextButton(onClick = onClose) { Text("关闭") }
        }
        if (!live) Text("草稿保存在当前设备，模拟结果不写入真实词库。", color = PlatypusColors.Muted, style = MaterialTheme.typography.bodySmall)
        LazyColumn(
            modifier = Modifier.fillMaxWidth().weight(1f, fill = false).testTag("video-draft-list"),
            contentPadding = PaddingValues(vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (draft.isEmpty()) item {
                Text("还没有待收藏的词。点选字幕或手动添加一个试试。", style = MaterialTheme.typography.bodyMedium, color = PlatypusColors.Muted, modifier = Modifier.padding(vertical = 12.dp))
            }
            items(draft, key = { it.word }) { item ->
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (editing == item.word) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(value = editValue, onValueChange = { editValue = it }, modifier = Modifier.weight(1f).testTag("video-edit-word"), singleLine = true, label = { Text("修改单词") })
                            TextButton(onClick = ::saveEdit) { Text("保存") }
                            TextButton(onClick = { editing = "" }) { Text("取消") }
                        }
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(item.word, fontFamily = FontFamily.Serif, fontSize = 22.sp)
                                Text(item.sources.firstOrNull()?.let { "${it.time} · ${it.title}" } ?: "手动添加", style = MaterialTheme.typography.labelSmall, color = PlatypusColors.Muted)
                            }
                            TextButton(onClick = { editing = item.word; editValue = item.word }, enabled = !running, modifier = Modifier.testTag("video-edit-${item.word}")) { Text("编辑") }
                            TextButton(onClick = { onDraftChange(draft.filter { it.word != item.word }) }, enabled = !running, modifier = Modifier.testTag("video-remove-${item.word}")) { Text("移除") }
                        }
                    }
                    if (item.sources.isNotEmpty()) {
                        Text(
                            if (expandedSource == item.word) item.sources.first().english else "查看来源句 ⌄",
                            modifier = Modifier.fillMaxWidth().clickable { expandedSource = if (expandedSource == item.word) "" else item.word },
                            color = PlatypusColors.Muted, style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = manualWord, onValueChange = { manualWord = it },
                        modifier = Modifier.weight(1f).testTag("video-manual-word"), singleLine = true,
                        label = { Text("手动添加单词") }, enabled = !running,
                    )
                    TextButton(enabled = !running, onClick = {
                        if (normalizeStudyWord(manualWord) == null) error = "请输入一个英文单词，最多 48 个字符。"
                        else { onDraftChange(addDraftWord(draft, manualWord)); manualWord = ""; error = "" }
                    }) { Text("添加") }
                }
            }
            if (error.isNotBlank()) item { Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            if (draft.isNotEmpty()) item {
                TextButton(onClick = { confirmClear = true }, enabled = !running) { Text("清空待收藏区", color = Color(0xFFA5755D)) }
            }
            if (batch.isNotEmpty()) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                        Text("${if (live) "收藏批次" else "演示批次"} · $batchGroup", style = MaterialTheme.typography.titleSmall)
                        LinearProgressIndicator(
                            progress = { batch.count { it.status == ImportStatus.Success || it.status == ImportStatus.Failed }.toFloat() / batch.size },
                            modifier = Modifier.fillMaxWidth(), color = Color(0xFF52876B),
                        )
                    }
                }
                items(batch, key = { "batch-${it.word}" }) { item ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text(item.word, fontFamily = FontFamily.Serif, fontSize = 19.sp, modifier = Modifier.weight(1f))
                        Text(item.error?.takeIf { it.isNotBlank() } ?: if (live && item.status == ImportStatus.Success) "已收藏" else if (live && item.status == ImportStatus.Failed) "处理失败" else item.status.label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = when (item.status) {
                            ImportStatus.Success -> Color(0xFF5B8866)
                            ImportStatus.Failed -> Color(0xFFB66E50)
                            ImportStatus.Processing -> PlatypusColors.OrangeDark
                            else -> PlatypusColors.Muted
                        })
                    }
                }
                if (!running && (canRetry || batch.any { it.status == ImportStatus.Failed })) item {
                    TextButton(onClick = onRetry) { Text("仅重试失败项") }
                }
                item { Text(if (live) "成功词已移除，失败词保留。不会覆盖已有笔记与复习进度。" else "这是模拟结果，真实词库没有变化。", color = PlatypusColors.Muted, style = MaterialTheme.typography.bodySmall) }
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("收藏到", style = MaterialTheme.typography.labelMedium)
            GroupDropdown(groups, groupId, onSelectGroup, Modifier.weight(1f))
        }
        if (!live) Row(Modifier.toggleable(value = simulateFailure, enabled = !running, role = Role.Checkbox, onValueChange = onSimulateFailure), verticalAlignment = Alignment.CenterVertically) {
            Checkbox(checked = simulateFailure, onCheckedChange = null, enabled = !running)
            Text("体验一次失败与重试", style = MaterialTheme.typography.bodySmall, color = PlatypusColors.Muted)
        }
        InkButton(
            text = if (live) { if (running) "后台处理中…" else "生成并收藏 ${draft.size} 词" } else if (running) "模拟处理中…" else "模拟生成并收藏 ${draft.size} 词",
            onClick = { editing = ""; onImport() },
            modifier = Modifier.fillMaxWidth().testTag("video-submit-batch"), enabled = !running && draft.isNotEmpty() && groups.isNotEmpty(), trailing = "→",
        )
        Text("只在点击提交后处理 · 单次最多 30 词", modifier = Modifier.padding(vertical = 12.dp).align(Alignment.CenterHorizontally), style = MaterialTheme.typography.labelSmall, color = PlatypusColors.Muted)
    }

    if (confirmClear) AlertDialog(
        onDismissRequest = { confirmClear = false },
        title = { Text("清空待收藏区？") }, text = { Text("当前设备的草稿会被清空。") },
        confirmButton = { TextButton(onClick = { onDraftChange(emptyList()); confirmClear = false }) { Text("清空") } },
        dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("取消") } },
    )
}

@Composable
private fun VideoStudyReadingPreview() {
    val documents = loadDemoVideoDocuments(LocalContext.current)
    PlatypusTheme { VideoStudyDemoContent(documents, initialDraft = listOf(DraftWord("resilient"), DraftWord("remarkable"))) }
}

@Composable
private fun VideoStudyDraftPreview() {
    PlatypusTheme {
        Surface(color = PlatypusColors.Paper) {
            VideoDraftPanel(
                draft = listOf(DraftWord("remarkable"), DraftWord("resilient"), DraftWord("sustainable")),
                groups = DemoGroups, groupId = DemoGroups.first().id, running = false, simulateFailure = true,
                batch = listOf(ImportItem("vivid", ImportStatus.Success), ImportItem("curiosity", ImportStatus.Failed)),
                batchGroup = "视频生词", onDraftChange = {}, onSelectGroup = {}, onSimulateFailure = {},
                onImport = {}, onRetry = {}, onClose = {},
            )
        }
    }
}
