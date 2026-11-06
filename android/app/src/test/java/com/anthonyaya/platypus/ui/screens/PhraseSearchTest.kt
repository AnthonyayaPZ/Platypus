package com.anthonyaya.platypus.ui.screens

import android.content.Context
import android.os.Looper
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
@Config(sdk = [35], qualifiers = "w360dp-h800dp")
class PhraseSearchTest {
    @get:Rule val compose = createComposeRule()
    private val groups = listOf(WordGroup(id = "words", name = "默认收藏", isDefault = 1), WordGroup(id = "phrases", name = "短语收藏", kind = "phrases"))
    private val phrase = WordEntry(word = "look forward to", part = "phr. v.", meaning = "期待", summary = "to 后接名词或动名词。", example = "I look forward to seeing you.", exampleZh = "我期待见到你。")

    @Test fun phrasesNormalizeAsAWholeAndOrdinaryWordDefaultsStayIndependent() {
        assertEquals("look forward to", normalizeDictionaryTerm("  Look  Forward\tTo "))
        assertEquals("at one's own pace", normalizeDictionaryTerm("at one’s own pace"))
        listOf("", "hello!", "one,two", "word--word", List(9) { "word" }.joinToString(" "), "a".repeat(49)).forEach { assertNull(normalizeDictionaryTerm(it)) }
        assertEquals("phrases", defaultSearchGroup(groups, phrase.word, "words"))
        assertEquals("words", defaultSearchGroup(groups, "resilient", "phrases"))
    }

    private inner class Repository : PlatypusRepository {
        val queries = mutableListOf<String>()
        val actions = mutableListOf<StateAction>()
        override suspend fun state() = Result.success(StateResponse(groups = groups))
        override suspend fun search(query: String): Result<SearchResponse> {
            queries += query
            return Result.success(SearchResponse(entry = phrase.copy(word = query)))
        }
        override suspend fun act(action: StateAction): Result<StateResponse> { actions += action; return state() }
    }

    @Test fun viewModelSearchesFullPhraseDefaultsItsSaveTargetAndDoesNotSwitchTheLibrary() {
        val repo = Repository(); val model = PlatypusViewModel(repo)
        shadowOf(Looper.getMainLooper()).idle()
        model.updateQuery("  LOOK forward  to "); model.search(); shadowOf(Looper.getMainLooper()).idle()
        assertEquals(listOf(phrase.word), repo.queries)
        assertEquals("phrases", model.uiState.value.searchGroupId)
        assertEquals("words", model.uiState.value.selectedGroupId)
        model.selectSearchGroup("words"); assertEquals("words", model.uiState.value.searchGroupId)
        model.updateQuery("in terms of"); model.search(); shadowOf(Looper.getMainLooper()).idle()
        assertEquals("phrases", model.uiState.value.searchGroupId)
        model.updateQuery("resilient"); model.search(); shadowOf(Looper.getMainLooper()).idle()
        assertEquals("words", model.uiState.value.searchGroupId)
        model.updateQuery("one,two"); model.search(); shadowOf(Looper.getMainLooper()).idle()
        assertEquals(3, repo.queries.size)
    }

    @Test fun searchCardShowsCompletePhraseAndSavesToTheDedicatedFolderOnSmallScreens() {
        var saved: Pair<String, String>? = null
        compose.setContent { PlatypusTheme { SearchScreen(
            state = PlatypusUiState(query = phrase.word, result = phrase, groups = groups, selectedGroupId = "words"),
            onQueryChange = {}, onSearch = {}, onSelectGroup = {}, onSave = { word, group -> saved = word to group },
            onRemove = { _, _ -> }, onSaveNote = { _, _ -> }, onOpenReview = {}, onSpeak = {},
        ) } }
        compose.onNode(hasText(phrase.word) and !hasSetTextAction()).performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("短语收藏").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("收藏").performScrollTo().performClick()
        compose.runOnIdle { assertEquals(phrase.word to "phrases", saved) }
    }

    @Test fun phrasePracticeQueueSurvivesRestartWithoutSplittingIntoWords() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        ReviewPracticeStore(context).save(listOf(phrase.word, "resilient"))
        assertEquals(listOf(phrase.word, "resilient"), ReviewPracticeStore(context).load())
        ReviewPracticeStore(context).save(emptyList())
    }
}
