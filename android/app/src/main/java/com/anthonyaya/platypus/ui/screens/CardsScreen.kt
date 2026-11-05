package com.anthonyaya.platypus.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.TextButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.anthonyaya.platypus.data.model.SavedWord
import com.anthonyaya.platypus.ui.PlatypusUiState
import com.anthonyaya.platypus.ui.components.GroupDropdown
import com.anthonyaya.platypus.ui.components.PageHeader
import com.anthonyaya.platypus.ui.components.PageHorizontalPadding
import com.anthonyaya.platypus.ui.components.PaperCard
import com.anthonyaya.platypus.ui.theme.PlatypusColors

@Composable
fun CardsScreen(
    state: PlatypusUiState,
    onSelectGroup: (String) -> Unit,
    onTogglePractice: (String) -> Unit = {},
) {
    val words = state.selectedWords
    var index by remember { mutableIntStateOf(0) }
    var revealed by remember { mutableStateOf(false) }
    var dragDistance by remember { mutableFloatStateOf(0f) }
    val swipeThreshold = with(LocalDensity.current) { 56.dp.toPx() }
    val previousWord by rememberUpdatedState(newValue = {
        index = if (index == 0) words.lastIndex else index - 1
        revealed = false
    })
    val nextWord by rememberUpdatedState(newValue = {
        index = (index + 1) % words.size
        revealed = false
    })

    LaunchedEffect(state.selectedGroupId, words.size) {
        index = 0
        revealed = false
        dragDistance = 0f
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
                eyebrow = "Flashcard study",
                title = "卡片学习",
                subtitle = "先回想，再翻面确认；让记忆多走一步。",
            )
        }
        item {
            GroupDropdown(
                groups = state.groups,
                selectedGroupId = state.selectedGroupId,
                onSelect = onSelectGroup,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        if (words.isEmpty()) {
            item {
                PaperCard(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier.padding(horizontal = 22.dp, vertical = 64.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Text("◇", fontSize = 46.sp, color = PlatypusColors.Orange)
                        Text("当前词库还没有卡片", style = MaterialTheme.typography.headlineSmall)
                        Text("先去搜索并收藏几个真正想记住的词。", color = PlatypusColors.Muted)
                    }
                }
            }
        } else {
            val current = words[index.coerceIn(words.indices)]
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("flashcard-deck")
                        .pointerInput(state.selectedGroupId, words.size, swipeThreshold) {
                            detectHorizontalDragGestures(
                                onDragStart = { dragDistance = 0f },
                                onDragCancel = { dragDistance = 0f },
                                onDragEnd = {
                                    val distance = dragDistance
                                    dragDistance = 0f
                                    when {
                                        distance <= -swipeThreshold -> nextWord()
                                        distance >= swipeThreshold -> previousWord()
                                    }
                                },
                                onHorizontalDrag = { change, amount ->
                                    change.consume()
                                    dragDistance += amount
                                },
                            )
                        },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    ArrowButton("‹", "上一个单词", previousWord)
                    FlashCard(
                        word = current,
                        index = index,
                        total = words.size,
                        revealed = revealed,
                        onClick = { revealed = !revealed },
                        queued = current.word in state.priorityWords,
                        onTogglePractice = { onTogglePractice(current.word) },
                        modifier = Modifier
                            .weight(1f)
                            .testTag("study-flashcard")
                            .graphicsLayer {
                                translationX = dragDistance.coerceIn(-swipeThreshold, swipeThreshold) * .15f
                            },
                    )
                    ArrowButton("›", "下一个单词", nextWord)
                }
            }
            item {
                Text(
                    if (current.word in state.priorityWords) "已加入下一轮优先练习 · 再次点击按钮可取消" else if (revealed) "点击收起释义 · 左右滑动切换单词" else "点击翻面 · 左滑下一个，右滑上一个",
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    style = MaterialTheme.typography.labelSmall,
                    color = PlatypusColors.Muted,
                )
            }
            if (revealed) item { WordRelations(current.entry, Modifier.testTag("card-word-relations")) }
        }
    }
}

@Composable
private fun ArrowButton(symbol: String, label: String, onClick: () -> Unit) {
    Surface(
        color = PlatypusColors.Header,
        shape = CircleShape,
        modifier = Modifier
            .size(36.dp)
            .semantics { contentDescription = label }
            .border(1.dp, Color(0xFFD4D6CE), CircleShape)
            .clickable(onClick = onClick),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(symbol, fontSize = 24.sp, color = PlatypusColors.Ink)
        }
    }
}

@Composable
private fun FlashCard(
    word: SavedWord,
    index: Int,
    total: Int,
    revealed: Boolean,
    onClick: () -> Unit,
    queued: Boolean,
    onTogglePractice: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .heightIn(min = 430.dp)
            .background(PlatypusColors.Paper, RoundedCornerShape(22.dp))
            .border(1.dp, Color(0xFFD8D6CC), RoundedCornerShape(22.dp))
            .drawBehind {
                drawCircle(
                    color = Color(0xFFEBE8DE),
                    radius = 130.dp.toPx(),
                    center = Offset(size.width + 65.dp.toPx(), -20.dp.toPx()),
                    style = Stroke(1.dp.toPx()),
                )
                drawCircle(
                    color = Color(0xFFEBE8DE),
                    radius = 85.dp.toPx(),
                    center = Offset(size.width + 15.dp.toPx(), -10.dp.toPx()),
                    style = Stroke(1.dp.toPx()),
                )
            }
            .clickable(onClick = onClick)
            .padding(horizontal = 22.dp, vertical = 23.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            "${index + 1} / $total",
            modifier = Modifier.weight(1f),
            fontFamily = FontFamily.Monospace,
            style = MaterialTheme.typography.labelSmall,
            color = PlatypusColors.Muted,
        )
        TextButton(onClick = onTogglePractice, modifier = Modifier.testTag("card-add-practice").semantics {
            contentDescription = if (queued) "取消优先练习 ${word.word}" else "加入练习 ${word.word}"
        }, contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp)) {
            Text(if (queued) "✓ 已加入练习" else "＋ 加入练习", style = MaterialTheme.typography.labelMedium)
        }
        }

        if (!revealed) {
            Spacer(Modifier.weight(1f))
            AdaptiveWordTitle(word.word)
            Text(word.entry.phonetic, color = PlatypusColors.Muted)
            Spacer(Modifier.weight(1f))
            Text("点击查看释义", style = MaterialTheme.typography.labelSmall, color = Color(0xFFA0A9A5))
        } else {
            AdaptiveWordTitle(
                word = word.word,
                revealed = true,
                modifier = Modifier.padding(top = 22.dp),
            )
            Text(word.entry.phonetic, color = PlatypusColors.Muted)
            HorizontalDivider(Modifier.padding(top = 18.dp), color = Color(0xFFE5E3DA))
            Column(
                modifier = Modifier.fillMaxWidth().padding(vertical = 17.dp),
                verticalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                Text("中文释义", style = MaterialTheme.typography.labelSmall, color = PlatypusColors.OrangeDark)
                Text(word.entry.meaning, style = MaterialTheme.typography.titleLarge)
                Text(word.entry.summary, style = MaterialTheme.typography.bodyMedium, color = PlatypusColors.Muted)
                val relations = word.entry.displayRelations()
                val synonyms = relations.filter { it.type == "synonym" }.map { it.word }
                val antonyms = relations.filter { it.type == "antonym" }.map { it.word }
                if (synonyms.isNotEmpty()) Text("近义词 · ${synonyms.joinToString(" · ")}", style = MaterialTheme.typography.bodySmall, color = PlatypusColors.InkSecondary)
                if (antonyms.isNotEmpty()) Text("反义词 · ${antonyms.joinToString(" · ")}", style = MaterialTheme.typography.bodySmall, color = PlatypusColors.InkSecondary)
                if (relations.isEmpty()) Text("暂无可靠的近反义词", style = MaterialTheme.typography.bodySmall, color = PlatypusColors.Muted)
            }
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(PlatypusColors.SoftGreen, RoundedCornerShape(10.dp))
                    .padding(15.dp),
                verticalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Text(word.entry.example, fontFamily = FontFamily.Serif, fontStyle = FontStyle.Italic)
                Text(word.entry.exampleZh, style = MaterialTheme.typography.bodySmall, color = PlatypusColors.Muted)
            }
            if (word.note.isNotBlank()) {
                Text(
                    "笔记 · ${word.note}",
                    modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = PlatypusColors.InkSecondary,
                )
            }
        }
    }
}

@Composable
private fun AdaptiveWordTitle(
    word: String,
    revealed: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val fontSize = when {
        word.length > 34 -> 18.sp
        word.length > 26 -> 21.sp
        word.length > 20 -> 24.sp
        word.length > 15 -> 28.sp
        word.length > 11 -> 34.sp
        revealed -> 38.sp
        else -> 48.sp
    }

    Text(
        text = word,
        modifier = modifier.fillMaxWidth(),
        fontFamily = FontFamily.Serif,
        fontSize = fontSize,
        lineHeight = (fontSize.value * 1.12f).sp,
        letterSpacing = 0.sp,
        maxLines = 2,
        softWrap = true,
        overflow = TextOverflow.Ellipsis,
        textAlign = TextAlign.Center,
    )
}
