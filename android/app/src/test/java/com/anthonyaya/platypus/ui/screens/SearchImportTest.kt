package com.anthonyaya.platypus.ui.screens

import android.content.Context
import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.core.app.ApplicationProvider
import com.anthonyaya.platypus.data.model.WordGroup
import com.anthonyaya.platypus.ui.search.*
import com.anthonyaya.platypus.ui.theme.PlatypusTheme
import com.anthonyaya.platypus.ui.videostudy.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class SearchImportTest {
    @get:Rule val compose = createComposeRule()
    @Test fun pastedListsNormalizeDeduplicateAndKeepInvalidInputForCorrection() {
        assertEquals(listOf("bright", "can't", "well-known"), appendSearchWords(emptyList(), "Bright，bright; can’t\nwell-known").words)
        assertEquals(listOf("keep"), appendSearchWords(listOf("keep"), "valid 123").words)
        assertTrue(appendSearchWords(listOf("keep"), "valid 123").error.contains("无效"))
        val words = (0..29).map { "word${('a'.code + it / 26).toChar()}${('a'.code + it % 26).toChar()}" }
        assertEquals(words, appendSearchWords(words, "extra").words)
        assertTrue(appendSearchWords(words, "extra").error.contains("30"))
        assertEquals("res", activeSearchPrefix("novel, res"))
        assertEquals("novel, resilient", completeSearchPrefix("novel, res", "resilient"))
    }
    @Test fun completionIndexWorksOfflineAndToleratesTypos() = runBlocking {
        val words = WordSuggestions.load(ApplicationProvider.getApplicationContext())
        assertEquals(40000, words.size)
        assertTrue(WordSuggestions.suggest(words, "res").all { it.startsWith("res") })
        val small = listOf("result", "research", "resilient", "ephemeral")
        assertEquals("resilient", WordSuggestions.suggest(small, "resiliant").first())
        assertEquals("resilient", WordSuggestions.suggest(small, "reislient").first())
    }
    @Test fun searchDraftAndPendingIdentityAreSeparateFromVideoDraftsAndSurviveRestart() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val draft = listOf(DraftWord("retry"))
        val session = VideoLiveSession(draft = draft, jobId = "job-one", pending = PendingVideoImport("stable-request-id-123", "group-one", draft))
        SearchImportStore(context).save(session)
        VideoLiveStore(context).save(VideoLiveSession(draft = listOf(DraftWord("video"))))
        assertEquals(session, SearchImportStore(context).load())
        assertEquals("video", VideoLiveStore(context).load().draft.single().word)
        SearchImportStore(context).save(VideoLiveSession()); VideoLiveStore(context).save(VideoLiveSession())
    }
    @Test fun sheetConfirmsPastedWordsBeforeUploadAndAllowsRemovalWithoutCallingSearch() {
        var submitted = ""
        var dismissed = false
        compose.setContent {
            var state by remember { mutableStateOf(SearchImportState()) }
            PlatypusTheme { SearchBatchSheet(state, listOf(WordGroup(id = "default", name = "默认收藏")), "default",
                onDismiss = { dismissed = true }, onAdd = { raw ->
                    val parsed = appendSearchWords(state.session.draft.map { it.word }, raw)
                    state = state.copy(session = state.session.copy(draft = parsed.words.map { DraftWord(it) }), message = parsed.error)
                    parsed.error.isBlank()
                }, onRemove = { word -> state = state.copy(session = state.session.copy(draft = state.session.draft.filter { it.word != word })) },
                onSubmit = { submitted = it }, onRetry = {}) }
        }
        compose.onNodeWithTag("search-batch-sheet").performScrollToNode(hasTestTag("search-batch-submit"))
        compose.onNodeWithTag("search-batch-submit").assertIsNotEnabled()
        compose.onNodeWithTag("search-batch-sheet").performScrollToNode(hasTestTag("search-batch-input"))
        compose.onNodeWithTag("search-batch-input").performTextInput("bright, bright\npsychology")
        compose.onNodeWithText("添加").performClick()
        compose.onNodeWithTag("batch-word-bright").assertExists()
        compose.onNodeWithTag("batch-word-psychology").assertExists()
        compose.onNodeWithText("待上传 2 / 30").assertExists()
        compose.onNodeWithTag("batch-word-bright").performClick()
        compose.onNodeWithTag("batch-word-bright").assertDoesNotExist()
        compose.onNodeWithTag("search-batch-sheet").performScrollToNode(hasTestTag("search-batch-submit"))
        compose.onNodeWithTag("search-batch-submit").performClick()
        compose.runOnIdle { assertEquals("default", submitted) }
        compose.onNodeWithTag("search-batch-sheet").performScrollToNode(hasText("关闭"))
        compose.onNodeWithText("关闭").performClick()
        compose.runOnIdle { assertTrue(dismissed) }
    }
}
