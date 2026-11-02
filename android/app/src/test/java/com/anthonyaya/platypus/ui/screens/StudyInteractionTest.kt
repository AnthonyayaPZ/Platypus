package com.anthonyaya.platypus.ui.screens

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import androidx.compose.ui.test.swipeRight
import androidx.compose.ui.test.swipeUp
import com.anthonyaya.platypus.data.model.ReviewSession
import com.anthonyaya.platypus.data.model.ReviewTask
import com.anthonyaya.platypus.data.model.SavedWord
import com.anthonyaya.platypus.data.model.WordEntry
import com.anthonyaya.platypus.data.model.WordGroup
import com.anthonyaya.platypus.ui.PlatypusUiState
import com.anthonyaya.platypus.ui.theme.PlatypusTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w390dp-h844dp")
class StudyInteractionTest {
    @get:Rule
    val compose = createComposeRule()

    private val entry = WordEntry(
        word = "resilient",
        phonetic = "/rɪˈzɪliənt/",
        part = "adj.",
        meaning = "有韧性的",
        summary = "能够从困难中恢复。",
        example = "A resilient team recovers.",
        exampleZh = "有韧性的团队能够恢复。",
        synonyms = listOf("tough", "adaptable"),
        antonyms = listOf("fragile", "vulnerable"),
    )
    private val group = WordGroup(id = "default", name = "默认词库")
    private val savedWord = SavedWord(
        word = entry.word,
        groupId = group.id,
        entry = entry,
        note = "遇到困难后能恢复",
    )

    @Test
    fun swipeChangesWordsInBothDirectionsAndResetsTheRevealedSide() {
        val state = PlatypusUiState(
            selectedGroupId = group.id,
            groups = listOf(group),
            savedWords = listOf(
                savedWord,
                savedWord.copy(word = "vivid", entry = entry.copy(word = "vivid", meaning = "生动的")),
                savedWord.copy(word = "pragmatic", entry = entry.copy(word = "pragmatic", meaning = "务实的")),
            ),
        )
        compose.setContent { PlatypusTheme { CardsScreen(state, onSelectGroup = {}) } }

        compose.onNodeWithTag("study-flashcard").performClick()
        compose.onNodeWithText("有韧性的").assertIsDisplayed()
        compose.onNodeWithTag("study-flashcard").performTouchInput { swipeLeft() }
        compose.onNodeWithText("vivid").assertIsDisplayed()
        compose.onNodeWithText("生动的").assertDoesNotExist()
        compose.onNodeWithTag("study-flashcard").performTouchInput { swipeRight() }
        compose.onNodeWithText("resilient").assertIsDisplayed()
        compose.onNodeWithTag("study-flashcard").performTouchInput { swipeRight() }
        compose.onNodeWithText("pragmatic").assertIsDisplayed()
        compose.onNodeWithTag("study-flashcard").performTouchInput { swipeLeft() }
        compose.onNodeWithText("resilient").assertIsDisplayed()
        compose.onNodeWithContentDescription("下一个单词").performClick()
        compose.onNodeWithText("vivid").assertIsDisplayed()
    }

    @Test
    fun shortOrVerticalGesturesDoNotChangeWords() {
        compose.setContent {
            PlatypusTheme {
                CardsScreen(
                    PlatypusUiState(
                        selectedGroupId = group.id,
                        groups = listOf(group),
                        savedWords = listOf(savedWord, savedWord.copy(word = "vivid", entry = entry.copy(word = "vivid"))),
                    ),
                    onSelectGroup = {},
                )
            }
        }
        compose.onNodeWithTag("study-flashcard").performTouchInput {
            down(center)
            moveBy(Offset(-20f, 0f))
            up()
        }
        compose.onNodeWithText("resilient").assertIsDisplayed()
        compose.onNodeWithTag("study-flashcard").performTouchInput { swipeUp() }
        compose.onNodeWithText("1 / 2").assertExists()
        compose.onNodeWithText("vivid").assertDoesNotExist()
    }

    @Test
    fun lastCorrectAnswerShowsWordDetailsBeforeShowingTheRoundResult() {
        val task = ReviewTask(
            id = "task-one",
            word = entry.word,
            questionType = "audio-word",
            options = listOf("resilient", "vivid", "pragmatic", "fragile"),
            correctAnswer = entry.word,
            phonetic = entry.phonetic,
            meaning = entry.meaning,
            summary = entry.summary,
        )
        val state = mutableStateOf(
            PlatypusUiState(
                selectedGroupId = group.id,
                groups = listOf(group),
                savedWords = listOf(savedWord),
                reviewSession = ReviewSession(id = "session", tasks = listOf(task), totalTasks = 1),
            ),
        )
        compose.setContent {
            PlatypusTheme {
                ReviewScreen(
                    state = state.value,
                    onSelectGroup = {},
                    onStart = {},
                    onAnswer = { _, _ -> },
                    onContinue = { state.value = state.value.copy(reviewFeedbackTaskId = null) },
                    onCancel = {},
                    onSpeak = {},
                )
            }
        }
        compose.onNodeWithTag("review-word-details").assertDoesNotExist()
        compose.runOnIdle {
            state.value = state.value.copy(
                reviewSession = state.value.reviewSession?.copy(
                    status = "completed",
                    tasks = listOf(task.copy(selectedAnswer = entry.word, isCorrect = true)),
                ),
                reviewFeedbackTaskId = task.id,
            )
        }
        compose.onNodeWithText("✓ 回答正确").assertIsDisplayed()
        compose.onNodeWithText(entry.example).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText(entry.exampleZh).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("笔记 · ${savedWord.note}").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("本轮复习完成").assertDoesNotExist()
        compose.onNodeWithText("查看本轮结果").performScrollTo().performClick()
        compose.onNodeWithText("本轮复习完成").assertIsDisplayed()
    }
}
