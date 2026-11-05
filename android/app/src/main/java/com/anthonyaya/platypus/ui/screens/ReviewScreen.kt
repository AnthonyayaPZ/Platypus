package com.anthonyaya.platypus.ui.screens

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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Checkbox
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.semantics.Role
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.anthonyaya.platypus.data.model.ReviewTask
import com.anthonyaya.platypus.data.model.WordEntry
import com.anthonyaya.platypus.ui.PlatypusUiState
import com.anthonyaya.platypus.ui.components.GroupDropdown
import com.anthonyaya.platypus.ui.components.InkButton
import com.anthonyaya.platypus.ui.components.PageHeader
import com.anthonyaya.platypus.ui.components.PageHorizontalPadding
import com.anthonyaya.platypus.ui.components.PaperCard
import com.anthonyaya.platypus.ui.components.TinyPill
import com.anthonyaya.platypus.ui.theme.PlatypusColors

@Composable
fun ReviewScreen(
    state: PlatypusUiState,
    onSelectGroup: (String) -> Unit,
    onStart: (String) -> Unit,
    onAnswer: (String, String) -> Unit,
    onContinue: () -> Unit,
    onCancel: () -> Unit,
    onSpeak: (String) -> Unit,
    onSkipAudioChange: (Boolean) -> Unit = {},
) {
    val session = state.reviewSession
    val feedbackTask = session?.tasks?.firstOrNull { it.id == state.reviewFeedbackTaskId }
    val currentTask = feedbackTask ?: session?.tasks?.firstOrNull { it.selectedAnswer == null }
    val showingFeedback = feedbackTask != null
    val answered = session?.tasks?.count { it.selectedAnswer != null } ?: 0
    val listState = rememberLazyListState()

    LaunchedEffect(currentTask?.id, showingFeedback) {
        if (currentTask != null) {
            listState.animateScrollToItem(
                if (showingFeedback) 4 + currentTask.options.size else 3,
            )
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        state = listState,
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
                eyebrow = "Focused review",
                title = "今日背诵",
                subtitle = "把容易遗忘的词，安排在最合适的时候再见一次。",
            )
        }

        item {
            GroupDropdown(
                groups = state.groups,
                selectedGroupId = state.selectedGroupId,
                onSelect = onSelectGroup,
                modifier = Modifier.fillMaxWidth(),
            )
            if (session == null || session.status == "active") {
                Row(Modifier.fillMaxWidth().testTag("review-skip-audio").toggleable(value = state.skipAudioThisRound,
                    enabled = !state.actionLoading && !showingFeedback && (session == null || !state.skipAudioThisRound),
                    role = Role.Checkbox, onValueChange = onSkipAudioChange), verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(state.skipAudioThisRound, onCheckedChange = null)
                    Text("本轮不练习听力题", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        if (session == null) {
            item {
                val group = state.groups.firstOrNull { it.id == state.selectedGroupId }
                ReviewStartCard(
                    groupName = group?.name ?: "请选择词库",
                    due = group?.dueCount ?: 0,
                    priority = state.selectedWords.count { it.word in state.priorityWords },
                    skipAudio = state.skipAudioThisRound,
                    loading = state.actionLoading,
                    onStart = { onStart(state.selectedGroupId) },
                )
            }
        } else {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("学习进度", style = MaterialTheme.typography.labelMedium, color = PlatypusColors.Muted)
                        Text(
                            "$answered / ${session.totalTasks}",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    LinearProgressIndicator(
                        progress = { if (session.totalTasks == 0) 0f else answered.toFloat() / session.totalTasks },
                        modifier = Modifier.fillMaxWidth().height(6.dp),
                        color = PlatypusColors.Orange,
                        trackColor = PlatypusColors.Line,
                    )
                }
            }

            if (currentTask == null) {
                item {
                    CompleteCard(
                        correct = session.tasks.count { it.isCorrect == true },
                        total = session.totalTasks,
                        onDone = onCancel,
                    )
                }
            } else {
                item {
                    QuizCard(
                        task = currentTask,
                        onSpeak = { onSpeak(currentTask.word) },
                    )
                }
                itemsIndexed(currentTask.options, key = { _, option -> option }) { index, option ->
                    QuizOption(
                        index = index,
                        option = option,
                        enabled = !state.actionLoading && !showingFeedback,
                        correct = showingFeedback && option == currentTask.correctAnswer,
                        selectedWrong = showingFeedback &&
                            option == currentTask.selectedAnswer &&
                            currentTask.isCorrect == false,
                        onClick = { onAnswer(currentTask.id, option) },
                    )
                }
                if (showingFeedback) {
                    item {
                        val savedWord = state.savedWords.firstOrNull { it.word == currentTask.word }
                        val entry = savedWord?.entry ?: WordEntry(
                            word = currentTask.word,
                            phonetic = currentTask.phonetic,
                            meaning = currentTask.meaning,
                            summary = currentTask.summary,
                        )
                        val note = state.wordMeta.firstOrNull { it.word == currentTask.word }?.note
                            ?: savedWord?.note.orEmpty()
                        AnswerFeedbackCard(
                            correct = currentTask.isCorrect == true,
                            correctAnswer = currentTask.correctAnswer,
                            entry = entry,
                            note = note,
                            hasNext = session.tasks.any { it.selectedAnswer == null },
                            onContinue = onContinue,
                            onSpeak = { onSpeak(currentTask.word) },
                        )
                    }
                } else {
                    item {
                        OutlinedButton(
                            onClick = onCancel,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                        ) { Text("结束本次复习", color = PlatypusColors.Muted) }
                    }
                }
            }
        }
    }
}

@Composable
private fun ReviewStartCard(
    groupName: String,
    due: Int,
    priority: Int,
    skipAudio: Boolean,
    loading: Boolean,
    onStart: () -> Unit,
) {
    PaperCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(horizontal = 22.dp, vertical = 36.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(13.dp),
        ) {
            Text("◎", fontFamily = FontFamily.Serif, fontSize = 62.sp, color = PlatypusColors.OrangeDark)
            TinyPill("$groupName · $due 词待复习")
            if (priority > 0) TinyPill("$priority 个词已加入优先练习", background = PlatypusColors.Mint)
            Text("准备好重新认识它们了吗？", style = MaterialTheme.typography.headlineMedium)
            Text(
                if (skipAudio) "本轮仅练习单词选义与词义选词，每个词仍练习三次，不出听力题。" else "听音、词义和拼写三种题型会交替出现，完成后自动安排下一次复习。",
                style = MaterialTheme.typography.bodyMedium,
                color = PlatypusColors.Muted,
            )
            Spacer(Modifier.height(4.dp))
            InkButton(
                text = if (loading) "正在准备…" else "开始复习",
                onClick = onStart,
                enabled = (due > 0 || priority > 0) && !loading,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun QuizCard(task: ReviewTask, onSpeak: () -> Unit) {
    PaperCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(horizontal = 17.dp, vertical = 21.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TinyPill(
                    text = when (task.questionType) {
                        "audio-word" -> "听音辨词"
                        "meaning-word" -> "词义选词"
                        else -> "单词选义"
                    },
                    background = Color(0xFFEDF1EB),
                )
                Text("选择正确答案", style = MaterialTheme.typography.labelSmall, color = PlatypusColors.Muted)
            }

            when (task.questionType) {
                "audio-word" -> {
                    Text("听发音，选择正确的单词", style = MaterialTheme.typography.headlineSmall)
                    Column(
                        modifier = Modifier
                            .size(112.dp)
                            .background(PlatypusColors.Orange, CircleShape)
                            .border(9.dp, Color(0xFFF5E5D7), CircleShape)
                            .clickable(onClick = onSpeak),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Text("◖", color = Color.White, fontSize = 29.sp)
                        Text("点击播放", style = MaterialTheme.typography.labelSmall, color = Color.White)
                    }
                }
                "meaning-word" -> {
                    Text("选择与释义对应的单词", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        task.meaning,
                        style = MaterialTheme.typography.headlineMedium,
                        modifier = Modifier.padding(vertical = 18.dp),
                    )
                }
                else -> {
                    Text("选择正确的中文释义", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        task.word,
                        fontFamily = FontFamily.Serif,
                        fontSize = 38.sp,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                    Text(task.phonetic, color = PlatypusColors.Muted)
                }
            }
        }
    }
}

@Composable
private fun QuizOption(
    index: Int,
    option: String,
    enabled: Boolean,
    correct: Boolean,
    selectedWrong: Boolean,
    onClick: () -> Unit,
) {
    val background = when {
        correct -> Color(0xFFE3F1E7)
        selectedWrong -> Color(0xFFFAE6DE)
        else -> PlatypusColors.Paper
    }
    val border = when {
        correct -> Color(0xFF8EB69B)
        selectedWrong -> Color(0xFFD99980)
        else -> Color(0xFFD8D9D2)
    }
    val badge = when {
        correct -> Color(0xFFBFDCC8)
        selectedWrong -> Color(0xFFF1C3B2)
        else -> Color(0xFFF0F1EC)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(background, RoundedCornerShape(11.dp))
            .border(if (correct || selectedWrong) 2.dp else 1.dp, border, RoundedCornerShape(11.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(11.dp),
    ) {
        Box(
            modifier = Modifier
                .size(27.dp)
                .background(badge, RoundedCornerShape(7.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Text(('A'.code + index).toChar().toString(), style = MaterialTheme.typography.labelSmall)
        }
        Text(option, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        if (correct || selectedWrong) {
            Text(
                if (correct) "✓" else "×",
                color = if (correct) Color(0xFF3F7653) else Color(0xFFA8523D),
                fontWeight = FontWeight.Bold,
                fontSize = 19.sp,
            )
        }
    }
}

@Composable
private fun AnswerFeedbackCard(
    correct: Boolean,
    correctAnswer: String,
    entry: WordEntry,
    note: String,
    hasNext: Boolean,
    onContinue: () -> Unit,
    onSpeak: () -> Unit,
) {
    val background = if (correct) Color(0xFFE3F1E7) else Color(0xFFFAE6DE)
    val border = if (correct) Color(0xFF9BC1A7) else Color(0xFFDDA087)
    val foreground = if (correct) Color(0xFF3F7653) else Color(0xFFA8523D)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("review-answer-feedback")
            .background(background, RoundedCornerShape(14.dp))
            .border(1.dp, border, RoundedCornerShape(14.dp))
            .padding(17.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            if (correct) "✓ 回答正确" else "× 再记一下",
            style = MaterialTheme.typography.titleMedium,
            color = foreground,
            fontWeight = FontWeight.Bold,
        )
        Text(
            if (correct) "答得很好，继续保持这个节奏。" else "正确答案：$correctAnswer",
            style = MaterialTheme.typography.bodyMedium,
            color = PlatypusColors.InkSecondary,
        )
        ReviewWordDetails(entry = entry, note = note, onSpeak = onSpeak)
        InkButton(
            text = if (hasNext) "下一题" else "查看本轮结果",
            onClick = onContinue,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun ReviewWordDetails(entry: WordEntry, note: String, onSpeak: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("review-word-details")
            .background(PlatypusColors.Paper, RoundedCornerShape(11.dp))
            .padding(15.dp),
        verticalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Text("单词回顾", style = MaterialTheme.typography.labelSmall, color = PlatypusColors.OrangeDark)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                entry.word,
                modifier = Modifier.weight(1f),
                fontFamily = FontFamily.Serif,
                fontSize = 28.sp,
                lineHeight = 34.sp,
            )
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(PlatypusColors.SoftGreen, CircleShape)
                    .clickable(onClick = onSpeak),
                contentAlignment = Alignment.Center,
            ) { Text("◖", color = PlatypusColors.Ink, fontSize = 20.sp) }
        }
        if (entry.phonetic.isNotBlank()) Text(entry.phonetic, color = PlatypusColors.Muted)
        if (entry.part.isNotBlank()) TinyPill(entry.part)
        Text(entry.meaning, style = MaterialTheme.typography.titleMedium)
        if (entry.summary.isNotBlank()) {
            Text(entry.summary, style = MaterialTheme.typography.bodyMedium, color = PlatypusColors.InkSecondary)
        }
        if (entry.example.isNotBlank() || entry.exampleZh.isNotBlank()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(PlatypusColors.SoftGreen, RoundedCornerShape(8.dp))
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                if (entry.example.isNotBlank()) Text(entry.example, fontFamily = FontFamily.Serif, fontStyle = FontStyle.Italic)
                if (entry.exampleZh.isNotBlank()) {
                    Text(entry.exampleZh, style = MaterialTheme.typography.bodySmall, color = PlatypusColors.Muted)
                }
            }
        }
        if (entry.synonyms.isNotEmpty()) {
            Text("近义词 · ${entry.synonyms.joinToString(" · ")}", style = MaterialTheme.typography.bodySmall)
        }
        if (entry.antonyms.isNotEmpty()) {
            Text("反义词 · ${entry.antonyms.joinToString(" · ")}", style = MaterialTheme.typography.bodySmall)
        }
        if (note.isNotBlank()) {
            Text("笔记 · $note", style = MaterialTheme.typography.bodySmall, color = PlatypusColors.InkSecondary)
        }
    }
}

@Composable
private fun CompleteCard(correct: Int, total: Int, onDone: () -> Unit) {
    PaperCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 44.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(13.dp),
        ) {
            Box(
                modifier = Modifier.size(62.dp).background(PlatypusColors.Orange, CircleShape),
                contentAlignment = Alignment.Center,
            ) { Text("✓", color = Color.White, fontSize = 28.sp) }
            Text("本轮复习完成", style = MaterialTheme.typography.headlineLarge)
            Text("答对 $correct / $total 题，新的复习日期已经安排好了。", color = PlatypusColors.Muted)
            InkButton("返回今日任务", onDone, Modifier.fillMaxWidth())
        }
    }
}
