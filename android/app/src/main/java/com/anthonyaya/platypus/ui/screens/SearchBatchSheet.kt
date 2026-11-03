package com.anthonyaya.platypus.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.anthonyaya.platypus.data.model.WordGroup
import com.anthonyaya.platypus.ui.components.GroupDropdown
import com.anthonyaya.platypus.ui.search.*
import com.anthonyaya.platypus.ui.theme.PlatypusColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

@Composable
fun SearchWordSuggestions(input: String, enabled: Boolean = true, onChoose: (String) -> Unit) {
    val context = LocalContext.current
    var suggestions by remember { mutableStateOf<List<String>>(emptyList()) }
    LaunchedEffect(input, enabled) {
        suggestions = emptyList()
        if (!enabled || !input.matches(Regex("^[a-zA-Z]{1,48}$"))) return@LaunchedEffect
        delay(120)
        suggestions = try {
            val words = WordSuggestions.load(context)
            withContext(Dispatchers.Default) { WordSuggestions.suggest(words, input) }
        } catch (error: CancellationException) { throw error }
        catch (_: Exception) { emptyList() }
    }
    if (enabled && suggestions.isNotEmpty()) Surface(
        shape = RoundedCornerShape(12.dp), color = PlatypusColors.Paper,
        modifier = Modifier.fillMaxWidth().testTag("word-suggestions"),
    ) {
        Column(Modifier.padding(4.dp)) {
            suggestions.forEach { word -> TextButton(onClick = { onChoose(word) }, modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(word, fontFamily = FontFamily.Serif, color = PlatypusColors.Ink)
                    Text(if (word.startsWith(input.lowercase())) "自动补全" else "拼写建议", style = MaterialTheme.typography.labelSmall, color = PlatypusColors.Muted)
                }
            } }
        }
    }
}

@Composable
fun SearchImportEntry(groups: List<WordGroup>, selectedGroupId: String, onImported: () -> Unit) {
    val context = LocalContext.current
    val model: SearchImportModel = viewModel(key = "search-import", factory = remember(context) {
        object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = SearchImportModel(context.applicationContext) as T
        }
    })
    val state by model.state.collectAsStateWithLifecycle()
    var open by rememberSaveable { mutableStateOf(false) }
    var notified by rememberSaveable { mutableStateOf("") }
    val imported by rememberUpdatedState(onImported)
    LaunchedEffect(state.job) {
        state.job?.let { job ->
            val signature = "${job.id}:${job.status}:${job.items.count { it.status == "success" }}"
            if (job.status !in listOf("queued", "running") && job.items.any { it.status == "success" } && notified != signature) {
                notified = signature; imported()
            }
        }
    }
    TextButton(onClick = { open = true }, modifier = Modifier.testTag("search-open-batch"), colors = ButtonDefaults.textButtonColors(contentColor = PlatypusColors.InkSecondary)) {
        Text("＋ 批量收藏${if (state.session.draft.isNotEmpty()) " · ${state.session.draft.size}" else ""}${if (state.running) " · 处理中" else ""}", style = MaterialTheme.typography.labelMedium)
    }
    if (open) SearchBatchSheet(state, groups, selectedGroupId, onDismiss = { open = false }, onAdd = model::add, onRemove = model::remove, onSubmit = model::submit, onRetry = model::retry)
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun SearchBatchSheet(state: SearchImportState, groups: List<WordGroup>, selectedGroupId: String,
    onDismiss: () -> Unit, onAdd: (String) -> Boolean, onRemove: (String) -> Unit, onSubmit: (String) -> Unit, onRetry: () -> Unit) {
    var input by rememberSaveable { mutableStateOf("") }
    var groupId by rememberSaveable { mutableStateOf(selectedGroupId) }
    val target = groups.firstOrNull { it.id == groupId } ?: groups.firstOrNull()
    val add: (String) -> Unit = { raw -> if (onAdd(raw)) input = "" }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = PlatypusColors.Cream) {
        LazyColumn(Modifier.fillMaxWidth().fillMaxHeight(.88f).imePadding().testTag("search-batch-sheet"), contentPadding = PaddingValues(start = 22.dp, end = 22.dp, bottom = 30.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("批量收藏", style = MaterialTheme.typography.titleLarge)
                    TextButton(onClick = onDismiss) { Text("关闭") }
                }
                Text("一次整理几个词，准备好后再上传。", style = MaterialTheme.typography.bodySmall, color = PlatypusColors.Muted)
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(input, { if (it.length <= 10000) input = it }, Modifier.weight(1f).testTag("search-batch-input"), enabled = !state.running,
                        label = { Text("输入或粘贴单词") }, placeholder = { Text("用逗号、空格或换行分隔") }, minLines = 2, maxLines = 4,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { add(input) }), shape = RoundedCornerShape(12.dp))
                    TextButton(onClick = { add(input) }, enabled = !state.running && input.isNotBlank()) { Text("添加") }
                }
                SearchWordSuggestions(activeSearchPrefix(input), enabled = !state.running, onChoose = { add(completeSearchPrefix(input, it)) })
            }
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("待上传 ${state.session.draft.size} / 30", style = MaterialTheme.typography.labelMedium)
                    Text("自动去重 · 本机保存", style = MaterialTheme.typography.labelSmall, color = PlatypusColors.Muted)
                }
                FlowRow(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    state.session.draft.forEach { item -> InputChip(selected = false, onClick = { onRemove(item.word) }, enabled = !state.running,
                        label = { Text(item.word, fontFamily = FontFamily.Serif) }, trailingIcon = { Text("×") }, modifier = Modifier.testTag("batch-word-${item.word}")) }
                }
                if (state.session.draft.isEmpty()) Text("还没有待上传的单词", color = PlatypusColors.Muted, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 16.dp))
            }
            item {
                Text("收藏到", style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(bottom = 8.dp))
                if (state.running) Text(state.job?.groupName ?: target?.name.orEmpty())
                else GroupDropdown(groups, target?.id.orEmpty(), { groupId = it })
            }
            if (state.message.isNotBlank()) item { Text(state.message, style = MaterialTheme.typography.bodySmall, color = PlatypusColors.InkSecondary) }
            item {
                if (input.isNotBlank()) Text("先点击“添加”确认词表，再批量上传。", style = MaterialTheme.typography.labelSmall, color = PlatypusColors.Muted, modifier = Modifier.padding(bottom = 8.dp))
                Button(onClick = { target?.let { onSubmit(it.id) } }, enabled = !state.running && state.session.draft.isNotEmpty() && input.isBlank() && target != null,
                    modifier = Modifier.fillMaxWidth().testTag("search-batch-submit"), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = PlatypusColors.Ink), contentPadding = PaddingValues(14.dp)) {
                    Text(if (state.running) "后台处理中…" else "上传并收藏 ${state.session.draft.size} 个词")
                }
            }
            state.job?.let { job ->
                item {
                    HorizontalDivider(color = PlatypusColors.Line)
                    Text("${job.groupName} · ${job.items.count { it.status == "success" }}/${job.items.size} 已收藏", style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(vertical = 12.dp))
                    LinearProgressIndicator(progress = { job.items.count { it.status in listOf("success", "failed") }.toFloat() / job.items.size.coerceAtLeast(1) }, modifier = Modifier.fillMaxWidth(), color = PlatypusColors.Ink)
                }
                items(job.items, key = { "status-${it.word}" }) { item ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                        Text(item.word, fontFamily = FontFamily.Serif, modifier = Modifier.weight(1f))
                        Text(item.error?.takeIf { it.isNotBlank() } ?: when (item.status) { "success" -> "已收藏"; "failed" -> "处理失败"; "processing" -> "生成中…"; else -> "等待中" },
                            style = MaterialTheme.typography.bodySmall, color = if (item.status == "failed") PlatypusColors.Orange else PlatypusColors.Muted, modifier = Modifier.weight(1.4f))
                    }
                }
                if (!state.running && job.items.any { it.status == "failed" }) item {
                    if (job.items.filter { it.status == "failed" }.all { item -> state.session.draft.any { it.word == item.word } }) {
                        OutlinedButton(onClick = onRetry, modifier = Modifier.fillMaxWidth()) { Text("仅重试失败项") }
                    } else Text("失败词表已修改，请按当前待上传列表重新提交。", style = MaterialTheme.typography.bodySmall, color = PlatypusColors.Muted)
                }
            }
        }
    }
}
