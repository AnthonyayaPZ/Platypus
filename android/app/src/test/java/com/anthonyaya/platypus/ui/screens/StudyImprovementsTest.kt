package com.anthonyaya.platypus.ui.screens

import android.content.Context
import android.os.Looper
import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.core.app.ApplicationProvider
import com.anthonyaya.platypus.data.model.*
import com.anthonyaya.platypus.data.repository.PlatypusRepository
import com.anthonyaya.platypus.ui.*
import com.anthonyaya.platypus.ui.theme.PlatypusTheme
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w390dp-h844dp")
class StudyImprovementsTest {
    @get:Rule val compose = createComposeRule()
    private val entry = WordEntry(word = "resilient", phonetic = "/test/", part = "adj.", meaning = "有韧性的", summary = "从困难中恢复。",
        example = "A resilient team recovers.", exampleZh = "有韧性的团队能够恢复。", synonyms = listOf("tough"), antonyms = listOf("fragile"),
        relations = listOf(RelationDetail("tough", "synonym", "共同点与差异", "适用场景")))
    private val group = WordGroup(id = "group", name = "默认词库", dueCount = 0)
    private val saved = SavedWord(word = entry.word, groupId = group.id, entry = entry, note = "保留笔记")
    private val state get() = PlatypusUiState(groups = listOf(group), savedWords = listOf(saved), selectedGroupId = group.id)

    @Test fun cardBackShowsRelationsAndPracticeButtonTracksTheCurrentWord() {
        var queued by mutableStateOf(emptyList<String>())
        compose.setContent { PlatypusTheme { CardsScreen(state.copy(priorityWords = queued), {}, { word -> queued = if (word in queued) queued - word else queued + word }) } }
        compose.onNodeWithTag("study-flashcard").performClick()
        compose.onNodeWithText("近义词 · tough").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("反义词 · fragile").performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("card-add-practice").performScrollTo().performClick()
        compose.onNodeWithText("✓ 已加入练习").assertIsDisplayed()
        compose.runOnIdle { assertEquals(listOf(entry.word), queued) }
    }

    @Test fun relationFallbackDoesNotInventComparisonTextOrAntonyms() {
        assertEquals(listOf("tough", "fragile"), entry.displayRelations().map { it.word })
        assertEquals("共同点与差异", entry.displayRelations().first().comparison)
        assertTrue(entry.copy(relations = emptyList(), synonyms = emptyList(), antonyms = emptyList()).displayRelations().isEmpty())
    }

    @Test fun libraryWordOpensDetailsAndKeepsAudioAndRemoveActionsIndependent() {
        var spoken = ""; var removed = ""
        compose.setContent { PlatypusTheme { LibraryScreen(state, {}, {}, {}, {}, { word, _ -> removed = word }, { _, _ -> }, { spoken = it }) } }
        compose.onNodeWithTag("library-word-${entry.word}").performScrollTo().performClick()
        compose.onNodeWithTag("library-word-details").assertIsDisplayed()
        compose.onNodeWithText(entry.example).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("反义词 · OPPOSITE").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("关闭").performScrollTo().performClick()
        compose.onNodeWithText("移出").performScrollTo().performClick()
        compose.onNodeWithTag("library-word-details").assertDoesNotExist()
        compose.runOnIdle { assertEquals(entry.word, removed); assertEquals("", spoken) }
    }

    @Test fun reviewCanStartForAPriorityWordEvenWhenNothingIsDueAndSilentModeIsSelectable() {
        var started = ""; var skip by mutableStateOf(false)
        compose.setContent { PlatypusTheme { ReviewScreen(state.copy(priorityWords = listOf(entry.word), skipAudioThisRound = skip), {}, { started = it }, { _, _ -> }, {}, {}, {}, { skip = it }) } }
        compose.onNodeWithTag("review-skip-audio").performClick()
        compose.onNodeWithTag("review-skip-audio").assertIsOn()
        compose.onNodeWithText("开始复习").performScrollTo().assertIsEnabled().performClick()
        compose.runOnIdle { assertTrue(skip); assertEquals(group.id, started) }
    }

    @Test fun priorityQueuePersistsAndIncompleteOrCancelledPracticeDoesNotConsumeIt() {
        val store = ReviewPracticeStore(ApplicationProvider.getApplicationContext<Context>())
        store.save(listOf(entry.word))
        assertEquals(listOf(entry.word), ReviewPracticeStore(ApplicationProvider.getApplicationContext()).load())
        val tasks = (0..2).map { ReviewTask(id = "task-$it", word = entry.word, selectedAnswer = if (it < 2) "answer" else null) }
        assertEquals(listOf(entry.word), remainingPracticeWords(listOf(entry.word), listOf(saved), ReviewSession(tasks = tasks)))
        assertTrue(remainingPracticeWords(listOf(entry.word), listOf(saved), ReviewSession(tasks = tasks.map { it.copy(selectedAnswer = "answer") })).isEmpty())
        assertTrue(remainingPracticeWords(listOf(entry.word), emptyList(), null).isEmpty())
        store.save(emptyList())
    }

    private class MemoryQueue(var words: List<String> = emptyList()) : PracticeQueuePersistence {
        override fun load() = words
        override fun save(words: List<String>) { this.words = words }
    }
    private inner class FakeRepository(private val features: ReviewFeatures = ReviewFeatures(1, true, true)) : PlatypusRepository {
        val actions = mutableListOf<StateAction>()
        var session: ReviewSession? = null
        override suspend fun search(query: String) = Result.success(SearchResponse(entry = entry))
        private fun response() = StateResponse(groups = listOf(group), savedWords = listOf(saved), session = session, reviewFeatures = features)
        override suspend fun state() = Result.success(response())
        override suspend fun act(action: StateAction): Result<StateResponse> {
            actions += action
            when (action.action) {
                "beginReview" -> session = ReviewSession(id = "session", groupId = group.id, totalTasks = 3, tasks = (0..2).map { ReviewTask(id = "task-$it", word = entry.word) })
                "answerTask" -> session = session?.copy(tasks = session!!.tasks.map { if (it.id == action.taskId) it.copy(selectedAnswer = action.selectedAnswer, isCorrect = true) else it })
                "cancelReview" -> session = null
            }
            return Result.success(response())
        }
    }

    @Test fun viewModelSendsPriorityAndAudioOptionsAndOnlyConsumesAWordAfterThreeAnswers() {
        val repository = FakeRepository(); val queue = MemoryQueue(listOf(entry.word)); val model = PlatypusViewModel(repository, queue)
        shadowOf(Looper.getMainLooper()).idle()
        model.setSkipAudio(true); model.beginReview(group.id); shadowOf(Looper.getMainLooper()).idle()
        assertEquals(false, repository.actions.first().includeAudio)
        assertEquals(listOf(entry.word), repository.actions.first().priorityWords)
        for (i in 0..2) { model.answerTask("task-$i", "answer"); shadowOf(Looper.getMainLooper()).idle(); model.continueReview(); if (i < 2) assertEquals(listOf(entry.word), queue.words) }
        assertTrue(queue.words.isEmpty())
        model.cancelReview(); shadowOf(Looper.getMainLooper()).idle(); assertFalse(model.uiState.value.skipAudioThisRound)
    }

    @Test fun anOldServerCannotSilentlyStartAudioWhenTheUserRequestedSilentPractice() {
        val repository = FakeRepository(ReviewFeatures()); val model = PlatypusViewModel(repository)
        shadowOf(Looper.getMainLooper()).idle()
        model.setSkipAudio(true); model.beginReview(group.id); shadowOf(Looper.getMainLooper()).idle()
        assertTrue(repository.actions.isEmpty()); assertTrue(model.uiState.value.message.orEmpty().contains("更新服务端"))
    }
}
