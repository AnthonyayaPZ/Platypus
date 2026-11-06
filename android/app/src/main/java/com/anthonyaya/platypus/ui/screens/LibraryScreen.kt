package com.anthonyaya.platypus.ui.screens

import androidx.core.graphics.toColorInt
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.anthonyaya.platypus.data.model.SavedWord
import com.anthonyaya.platypus.data.model.WordGroup
import com.anthonyaya.platypus.ui.PlatypusUiState
import com.anthonyaya.platypus.ui.components.NoteDialog
import com.anthonyaya.platypus.ui.components.PageHeader
import com.anthonyaya.platypus.ui.components.PageHorizontalPadding
import com.anthonyaya.platypus.ui.components.PaperCard
import com.anthonyaya.platypus.ui.components.TinyPill
import com.anthonyaya.platypus.ui.theme.PlatypusColors

@Composable
fun LibraryScreen(
    state: PlatypusUiState,
    onSelectGroup: (String) -> Unit,
    onCreateGroup: (String) -> Unit,
    onSetDefault: (String) -> Unit,
    onDeleteGroup: (String) -> Unit,
    onRemove: (String, String) -> Unit,
    onSaveNote: (String, String) -> Unit,
    onSpeak: (String) -> Unit,
) {
    var showCreateDialog by remember { mutableStateOf(false) }
    var noteWord by remember { mutableStateOf<String?>(null) }
    var detailWord by remember { mutableStateOf<String?>(null) }
    detailWord?.let { word ->
        state.savedWords.firstOrNull { it.word == word }?.let { saved ->
            WordDetailsSheet(saved.entry, state.wordMeta.firstOrNull { it.word == word }?.note ?: saved.note,
                onDismiss = { detailWord = null }, onSpeak = { onSpeak(word) }, onEditNote = { noteWord = word })
        }
    }

    if (showCreateDialog) {
        CreateGroupDialog(
            onDismiss = { showCreateDialog = false },
            onCreate = { name -> onCreateGroup(name); showCreateDialog = false },
        )
    }
    noteWord?.let { word ->
        NoteDialog(
            word = word,
            initialNote = state.wordMeta.firstOrNull { it.word == word }?.note.orEmpty(),
            onDismiss = { noteWord = null },
            onSave = { note -> onSaveNote(word, note) },
        )
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = PageHorizontalPadding,
            end = PageHorizontalPadding,
            top = 28.dp,
            bottom = 34.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(13.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom,
            ) {
                PageHeader(
                    eyebrow = "My vocabulary",
                    title = "我的词库",
                    subtitle = "按主题整理，也按节奏复习。",
                    modifier = Modifier.weight(1f),
                )
                Button(
                    onClick = { showCreateDialog = true },
                    shape = RoundedCornerShape(9.dp),
                    contentPadding = PaddingValues(horizontal = 13.dp, vertical = 9.dp),
                ) { Text("＋ 新建", style = MaterialTheme.typography.labelMedium) }
            }
        }

        items(state.groups, key = { it.id }) { group ->
            LibraryGroupCard(
                group = group,
                selected = group.id == state.selectedGroupId,
                canDelete = state.groups.size > 1,
                actionLoading = state.actionLoading,
                onSelect = { onSelectGroup(group.id) },
                onSetDefault = { onSetDefault(group.id) },
                onDelete = { onDeleteGroup(group.id) },
            )
        }

        item { Spacer(Modifier.height(5.dp)) }
        item {
            WordListHeader(
                groupName = state.groups.firstOrNull { it.id == state.selectedGroupId }?.name ?: "词库",
                count = state.selectedWords.size,
            )
        }

        if (state.selectedWords.isEmpty()) {
            item {
                PaperCard(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier.padding(vertical = 54.dp, horizontal = 20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text("▦", fontSize = 42.sp, color = PlatypusColors.Orange)
                        Text("当前词库还没有收藏", style = MaterialTheme.typography.headlineSmall)
                    }
                }
            }
        } else {
            item {
                PaperCard(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 3.dp)) {
                        state.selectedWords.forEachIndexed { index, saved ->
                            LibraryWordRow(
                                saved = saved,
                                actionLoading = state.actionLoading,
                                onSpeak = { onSpeak(saved.word) },
                                onNote = { noteWord = saved.word },
                                onRemove = { onRemove(saved.word, saved.groupId) },
                                onOpen = { detailWord = saved.word },
                            )
                            if (index < state.selectedWords.lastIndex) HorizontalDivider(color = Color(0xFFECEAE3))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LibraryGroupCard(
    group: WordGroup,
    selected: Boolean,
    canDelete: Boolean,
    actionLoading: Boolean,
    onSelect: () -> Unit,
    onSetDefault: () -> Unit,
    onDelete: () -> Unit,
) {
    val accent = remember(group.color) {
        runCatching { Color(group.color.toColorInt()) }.getOrDefault(PlatypusColors.Orange)
    }
    Surface(
        color = PlatypusColors.Paper,
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier
            .fillMaxWidth()
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = if (selected) PlatypusColors.Ink else PlatypusColors.Line,
                shape = RoundedCornerShape(14.dp),
            ),
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onSelect)
                    .padding(horizontal = 15.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(11.dp),
            ) {
                Box(Modifier.width(9.dp).height(42.dp).background(accent, RoundedCornerShape(5.dp)))
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        Text(group.name, style = MaterialTheme.typography.titleSmall)
                        if (group.isDefault == 1) TinyPill("默认", modifier = Modifier.height(24.dp))
                    }
                    Text(
                        "${group.wordCount} ${if (group.kind == "phrases") "个短语" else "个词条"} · ${group.dueCount} 个待复习",
                        style = MaterialTheme.typography.labelSmall,
                        color = PlatypusColors.Muted,
                    )
                }
                Text(if (selected) "✓" else "›", color = PlatypusColors.InkSecondary)
            }
            if (selected && group.kind == "phrases") {
                Text("短语默认收藏夹", style = MaterialTheme.typography.labelSmall, color = PlatypusColors.Muted,
                    modifier = Modifier.padding(start = 35.dp, bottom = 12.dp))
            }
            if (selected && group.kind != "phrases" && (group.isDefault != 1 || canDelete)) {
                HorizontalDivider(color = Color(0xFFECEAE3))
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
                    horizontalArrangement = Arrangement.End,
                ) {
                    if (group.isDefault != 1) {
                        TextButton(onClick = onSetDefault, enabled = !actionLoading) { Text("设为默认") }
                    }
                    if (canDelete) {
                        TextButton(onClick = onDelete, enabled = !actionLoading) {
                            Text("删除", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun WordListHeader(groupName: String, count: Int) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 2.dp, vertical = 7.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Bottom,
    ) {
        Text(groupName, style = MaterialTheme.typography.headlineSmall)
        Text("$count WORDS", style = MaterialTheme.typography.labelSmall, color = PlatypusColors.Muted)
    }
}

@Composable
private fun LibraryWordRow(
    saved: SavedWord,
    actionLoading: Boolean,
    onSpeak: () -> Unit,
    onNote: () -> Unit,
    onRemove: () -> Unit,
    onOpen: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().testTag("library-word-${saved.word}").clickable(onClick = onOpen).padding(vertical = 13.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Surface(
                color = Color(0xFFEEF1EB),
                shape = CircleShape,
                modifier = Modifier.size(32.dp).clickable(onClick = onSpeak),
            ) { Box(contentAlignment = Alignment.Center) { Text("◖", color = PlatypusColors.Ink) } }
            Column(modifier = Modifier.weight(1f)) {
                Text(saved.word, fontFamily = FontFamily.Serif, fontSize = 19.sp)
                Text(saved.entry.phonetic, style = MaterialTheme.typography.labelSmall, color = PlatypusColors.Muted)
            }
            TinyPill(
                text = if (saved.repetitions >= 3) "已掌握" else "学习中",
                background = if (saved.repetitions >= 3) PlatypusColors.Mint else Color(0xFFF8E6D7),
                foreground = if (saved.repetitions >= 3) Color(0xFF3E7053) else Color(0xFF9D5F36),
            )
        }
        Text(saved.entry.meaning, style = MaterialTheme.typography.bodySmall, color = Color(0xFF536760), modifier = Modifier.padding(start = 42.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = onNote, contentPadding = PaddingValues(horizontal = 8.dp)) { Text("笔记") }
            TextButton(onClick = onRemove, enabled = !actionLoading, contentPadding = PaddingValues(horizontal = 8.dp)) {
                Text("移出", color = PlatypusColors.Muted)
            }
        }
    }
}

@Composable
private fun CreateGroupDialog(onDismiss: () -> Unit, onCreate: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = PlatypusColors.Paper,
        shape = RoundedCornerShape(18.dp),
        title = { Text("新建词库", style = MaterialTheme.typography.headlineSmall) },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { if (it.length <= 24) name = it },
                label = { Text("词库名称") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = { Button(onClick = { onCreate(name) }, enabled = name.isNotBlank()) { Text("创建") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}
