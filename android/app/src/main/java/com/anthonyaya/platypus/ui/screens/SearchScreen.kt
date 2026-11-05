package com.anthonyaya.platypus.ui.screens

import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.anthonyaya.platypus.data.model.RelationDetail
import com.anthonyaya.platypus.data.model.WordEntry
import com.anthonyaya.platypus.ui.PlatypusUiState
import com.anthonyaya.platypus.ui.components.GroupDropdown
import com.anthonyaya.platypus.ui.components.InkButton
import com.anthonyaya.platypus.ui.components.NoteDialog
import com.anthonyaya.platypus.ui.components.PageHeader
import com.anthonyaya.platypus.ui.components.PageHorizontalPadding
import com.anthonyaya.platypus.ui.components.PaperCard
import com.anthonyaya.platypus.ui.components.PlatypusMark
import com.anthonyaya.platypus.ui.components.SectionHeading
import com.anthonyaya.platypus.ui.components.TinyPill
import com.anthonyaya.platypus.ui.theme.PlatypusColors
import kotlin.math.max

private val QuickWords = listOf("resilient", "ephemeral", "pragmatic", "vivid")

@Composable
fun SearchScreen(
    state: PlatypusUiState,
    onQueryChange: (String) -> Unit,
    onSearch: () -> Unit,
    onSelectGroup: (String) -> Unit,
    onSave: (String, String) -> Unit,
    onRemove: (String, String) -> Unit,
    onSaveNote: (String, String) -> Unit,
    onOpenReview: () -> Unit,
    onSpeak: (String) -> Unit,
    onImported: () -> Unit = {},
) {
    var noteWord by remember { mutableStateOf<String?>(null) }
    var searchFocused by remember { mutableStateOf(false) }

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
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        item {
            PageHeader(
                eyebrow = "Explore a word",
                title = "今天想认识哪个词？",
                subtitle = "查清含义，也看看它的近邻与对立面。",
            )
        }

        item {
            SearchBox(
                query = state.query,
                searching = state.searching,
                onQueryChange = onQueryChange,
                onSearch = onSearch,
                onFocusChange = { searchFocused = it },
            )
            SearchWordSuggestions(state.query, enabled = searchFocused && !state.searching && state.query != state.result?.word, onChoose = { onQueryChange(it); onSearch() })
        }

        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("试试：", style = MaterialTheme.typography.bodySmall, color = PlatypusColors.Muted)
                QuickWords.take(1).forEach { word ->
                    Text(
                        word,
                        style = MaterialTheme.typography.bodySmall,
                        color = PlatypusColors.InkSecondary,
                        modifier = Modifier.clickable {
                            onQueryChange(word)
                            onSearch()
                        },
                    )
                }
                Spacer(Modifier.weight(1f))
                SearchImportEntry(state.groups, state.selectedGroupId, onImported)
            }
        }

        val entry = state.result
        if (entry == null) {
            item { SearchEmptyState() }
        } else {
            item {
                WordCard(
                    entry = entry,
                    state = state,
                    onSelectGroup = onSelectGroup,
                    onSave = onSave,
                    onRemove = onRemove,
                    onNote = { noteWord = entry.word },
                    onSpeak = { onSpeak(entry.word) },
                )
            }

            if (entry.displayRelations().isNotEmpty()) {
                item {
                    SectionHeading(
                        eyebrow = "Word relationships",
                        title = "近义与反义辨析",
                    )
                }
                item { WordRelations(entry) }
            }
        }

        item {
            TodayPanel(
                due = state.totalDue,
                saved = state.totalSaved,
                onOpenReview = onOpenReview,
            )
        }
    }
}

@Composable
private fun SearchBox(
    query: String,
    searching: Boolean,
    onQueryChange: (String) -> Unit,
    onSearch: () -> Unit,
    onFocusChange: (Boolean) -> Unit,
) {
    Surface(
        color = PlatypusColors.Paper,
        shape = RoundedCornerShape(14.dp),
        shadowElevation = 5.dp,
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, Color(0xFFD8D8CD), RoundedCornerShape(14.dp)),
    ) {
        Row(
            modifier = Modifier.padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(9.dp),
        ) {
            Text("⌕", fontSize = 25.sp, color = PlatypusColors.Muted, modifier = Modifier.padding(start = 5.dp))
            BasicTextField(
                value = query,
                onValueChange = onQueryChange,
                modifier = Modifier.weight(1f).onFocusChanged { onFocusChange(it.isFocused) },
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = PlatypusColors.Ink),
                cursorBrush = SolidColor(PlatypusColors.Orange),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { onSearch() }),
                decorationBox = { field ->
                    Box(contentAlignment = Alignment.CenterStart) {
                        if (query.isEmpty()) {
                            Text("输入一个英文单词", color = Color(0xFFA1AAA6))
                        }
                        field()
                    }
                },
            )
            Button(
                onClick = onSearch,
                enabled = !searching,
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(containerColor = PlatypusColors.Ink),
                contentPadding = PaddingValues(horizontal = 15.dp, vertical = 11.dp),
            ) {
                Text(if (searching) "查询中" else "查一查", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun SearchEmptyState() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .height(310.dp)
            .drawBehind {
                drawRoundRect(
                    color = Color(0xFFD4D5CC),
                    cornerRadius = CornerRadius(18.dp.toPx()),
                    style = Stroke(
                        width = 1.dp.toPx(),
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(8.dp.toPx(), 7.dp.toPx())),
                    ),
                )
            }
            .background(PlatypusColors.Paper.copy(alpha = .45f), RoundedCornerShape(18.dp)),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        PlatypusMark(Modifier.size(width = 57.dp, height = 44.dp))
        Spacer(Modifier.height(14.dp))
        Text("搜索一个真正想记住的词", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(5.dp))
        Text(
            "这里会展示释义、例句、近反义词和你的个人笔记。",
            style = MaterialTheme.typography.bodySmall,
            color = PlatypusColors.Muted,
        )
    }
}

@Composable
private fun WordCard(
    entry: WordEntry,
    state: PlatypusUiState,
    onSelectGroup: (String) -> Unit,
    onSave: (String, String) -> Unit,
    onRemove: (String, String) -> Unit,
    onNote: () -> Unit,
    onSpeak: () -> Unit,
) {
    val savedInSelected = state.savedWords.any {
        it.word == entry.word && it.groupId == state.selectedGroupId
    }

    PaperCard(modifier = Modifier.fillMaxWidth()) {
        Column {
            Column(
                modifier = Modifier.padding(horizontal = 18.dp, vertical = 21.dp),
                verticalArrangement = Arrangement.spacedBy(13.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(entry.word, style = MaterialTheme.typography.displayMedium)
                            Spacer(Modifier.size(9.dp))
                            Surface(
                                color = Color(0xFFEFF3EF),
                                shape = CircleShape,
                                modifier = Modifier
                                    .size(36.dp)
                                    .border(1.dp, Color(0xFFD1D7D4), CircleShape)
                                    .clickable(onClick = onSpeak),
                            ) {
                                Box(contentAlignment = Alignment.Center) { Text("◖", color = PlatypusColors.Ink) }
                            }
                        }
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(7.dp),
                        ) {
                            Text(
                                entry.phonetic,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 13.sp,
                                color = Color(0xFF597069),
                            )
                            TinyPill(
                                text = entry.part,
                                background = PlatypusColors.Ink,
                                foreground = Color.White,
                            )
                        }
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    GroupDropdown(
                        groups = state.groups,
                        selectedGroupId = state.selectedGroupId,
                        onSelect = onSelectGroup,
                        modifier = Modifier.weight(1f),
                    )
                    Button(
                        onClick = {
                            if (savedInSelected) onRemove(entry.word, state.selectedGroupId)
                            else onSave(entry.word, state.selectedGroupId)
                        },
                        enabled = state.selectedGroupId.isNotEmpty() && !state.actionLoading,
                        shape = RoundedCornerShape(9.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (savedInSelected) PlatypusColors.InkSecondary else PlatypusColors.Orange,
                        ),
                    ) {
                        Text(if (savedInSelected) "移出" else "收藏", fontWeight = FontWeight.Bold)
                    }
                }
            }

            HorizontalDivider(color = Color(0xFFE8E6DF))
            Column(
                modifier = Modifier.padding(horizontal = 18.dp, vertical = 19.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    "中文释义",
                    style = MaterialTheme.typography.labelSmall,
                    color = PlatypusColors.OrangeDark,
                    fontWeight = FontWeight.ExtraBold,
                )
                Text(entry.meaning, style = MaterialTheme.typography.titleLarge)
                Text(entry.summary, style = MaterialTheme.typography.bodyMedium, color = Color(0xFF64756F))
                TextButton(
                    onClick = onNote,
                    enabled = state.savedWords.any { it.word == entry.word },
                    contentPadding = PaddingValues(0.dp),
                ) { Text("✎ 编辑学习笔记", color = PlatypusColors.InkSecondary) }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(PlatypusColors.SoftGreen)
                    .padding(horizontal = 18.dp, vertical = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Text("“", fontFamily = FontFamily.Serif, fontSize = 34.sp, color = PlatypusColors.Orange)
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(entry.example, fontFamily = FontFamily.Serif, fontStyle = FontStyle.Italic)
                    Text(entry.exampleZh, style = MaterialTheme.typography.bodySmall, color = PlatypusColors.Muted)
                }
            }
        }
    }
}

@Composable
internal fun RelationGroup(synonym: Boolean, relations: List<RelationDetail>) {
    val background = if (synonym) PlatypusColors.Mint else PlatypusColors.Peach
    val border = if (synonym) Color(0xFFCADDd1) else Color(0xFFECCDBB)
    val label = if (synonym) "近义词 · SIMILAR" else "反义词 · OPPOSITE"
    val icon = if (synonym) "≈" else "↔"

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(background, RoundedCornerShape(15.dp))
            .border(1.dp, border, RoundedCornerShape(15.dp))
            .padding(15.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Surface(color = Color.White.copy(alpha = .65f), shape = CircleShape, modifier = Modifier.size(34.dp)) {
                Box(contentAlignment = Alignment.Center) { Text(icon, fontSize = 20.sp) }
            }
            Text(label, style = MaterialTheme.typography.labelMedium, color = Color(0xFF526A62))
        }
        relations.forEach { relation ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White.copy(alpha = .6f), RoundedCornerShape(10.dp))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Text(relation.word, fontFamily = FontFamily.Serif, fontSize = 18.sp)
                if (relation.comparison.isNotBlank()) Text(relation.comparison, style = MaterialTheme.typography.bodySmall, color = Color(0xFF425C54))
                if (relation.usage.isNotBlank()) Text(relation.usage, style = MaterialTheme.typography.labelSmall, color = Color(0xFF657871))
            }
        }
    }
}

@Composable
private fun TodayPanel(due: Int, saved: Int, onOpenReview: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(PlatypusColors.Ink, RoundedCornerShape(18.dp))
            .drawBehind {
                drawCircle(
                    color = Color.White.copy(alpha = .07f),
                    radius = 78.dp.toPx(),
                    center = Offset(size.width + 20.dp.toPx(), size.height * .42f),
                    style = Stroke(1.dp.toPx()),
                )
            }
            .padding(21.dp),
        verticalArrangement = Arrangement.spacedBy(17.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("今日计划", style = MaterialTheme.typography.headlineSmall, color = Color.White)
            Text("按学习节奏安排", style = MaterialTheme.typography.labelSmall, color = Color(0xFFAFC1BB))
        }
        Box(modifier = Modifier.align(Alignment.CenterHorizontally), contentAlignment = Alignment.Center) {
            Canvas(Modifier.size(118.dp)) {
                drawCircle(Color.White.copy(alpha = .12f), style = Stroke(8.dp.toPx()))
                val progress = if (due == 0) .08f else (due.toFloat() / max(due + 10, 1)).coerceIn(.08f, 1f)
                drawArc(
                    color = PlatypusColors.Orange,
                    startAngle = -90f,
                    sweepAngle = progress * 360f,
                    useCenter = false,
                    style = Stroke(8.dp.toPx()),
                )
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("$due", fontFamily = FontFamily.Serif, fontSize = 34.sp, color = Color.White)
                Text("待复习", style = MaterialTheme.typography.labelSmall, color = Color(0xFFADBFBA))
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
            Text("每次专注练习 10 个词", style = MaterialTheme.typography.titleMedium, color = Color.White)
            Text(
                "完成这一组后，如果还有内容，可以继续下一组。",
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFFAFC1BB),
            )
        }
        InkButton(
            text = "查看今日任务",
            trailing = "→",
            orange = true,
            onClick = onOpenReview,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("$saved", style = MaterialTheme.typography.titleLarge, color = Color.White)
                Text("已收藏", style = MaterialTheme.typography.labelSmall, color = Color(0xFF9EB1AA))
            }
            Box(Modifier.size(width = 1.dp, height = 28.dp).background(Color.White.copy(alpha = .15f)))
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("10", style = MaterialTheme.typography.titleLarge, color = Color.White)
                Text("下一组", style = MaterialTheme.typography.labelSmall, color = Color(0xFF9EB1AA))
            }
        }
    }
}
