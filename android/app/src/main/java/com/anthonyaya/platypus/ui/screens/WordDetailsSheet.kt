package com.anthonyaya.platypus.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.anthonyaya.platypus.data.model.RelationDetail
import com.anthonyaya.platypus.data.model.WordEntry
import com.anthonyaya.platypus.ui.theme.PlatypusColors

fun WordEntry.displayRelations(): List<RelationDetail> {
    val details = relations.filter { it.type == "synonym" || it.type == "antonym" }
    val fallback = synonyms.map { RelationDetail(word = it, type = "synonym") } + antonyms.map { RelationDetail(word = it, type = "antonym") }
    return (details + fallback).filter { it.word.isNotBlank() && it.word != word }.distinctBy { it.type to it.word }
}

@Composable
fun WordRelations(entry: WordEntry, modifier: Modifier = Modifier) {
    val relations = entry.displayRelations()
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        val synonyms = relations.filter { it.type == "synonym" }
        val antonyms = relations.filter { it.type == "antonym" }
        if (synonyms.isNotEmpty()) RelationGroup(true, synonyms)
        if (antonyms.isNotEmpty()) RelationGroup(false, antonyms)
        if (relations.isEmpty()) Text("暂无可靠的近反义词", style = MaterialTheme.typography.bodySmall, color = PlatypusColors.Muted)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WordDetailsSheet(entry: WordEntry, note: String, onDismiss: () -> Unit, onSpeak: () -> Unit, onEditNote: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = PlatypusColors.Cream) {
        LazyColumn(Modifier.fillMaxWidth().fillMaxHeight(.88f).testTag("library-word-details"),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 30.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("单词详情", style = MaterialTheme.typography.titleMedium)
                    TextButton(onClick = onDismiss) { Text("关闭") }
                }
                Row(Modifier.fillMaxWidth()) {
                    Text(entry.word, Modifier.weight(1f), fontFamily = FontFamily.Serif, fontSize = 32.sp, lineHeight = 38.sp)
                    TextButton(onClick = onSpeak) { Text("◖ 发音") }
                }
                if (entry.phonetic.isNotBlank()) Text(entry.phonetic, color = PlatypusColors.Muted)
                if (entry.part.isNotBlank()) Text(entry.part, style = MaterialTheme.typography.labelMedium, color = PlatypusColors.OrangeDark)
            }
            item {
                Text(entry.meaning, style = MaterialTheme.typography.titleLarge)
                if (entry.summary.isNotBlank()) Text(entry.summary, color = PlatypusColors.InkSecondary, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 7.dp))
            }
            if (entry.example.isNotBlank() || entry.exampleZh.isNotBlank()) item {
                Surface(shape = RoundedCornerShape(12.dp), color = PlatypusColors.SoftGreen) {
                    Column(Modifier.fillMaxWidth().padding(15.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                        Text(entry.example, fontFamily = FontFamily.Serif, fontStyle = FontStyle.Italic)
                        Text(entry.exampleZh, style = MaterialTheme.typography.bodySmall, color = PlatypusColors.Muted)
                    }
                }
            }
            item { WordRelations(entry) }
            item {
                if (note.isNotBlank()) Text("笔记 · $note", style = MaterialTheme.typography.bodyMedium)
                TextButton(onClick = onEditNote) { Text("编辑学习笔记") }
            }
        }
    }
}
