package com.anthonyaya.platypus.ui.screens

import android.content.Context
import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.core.app.ApplicationProvider
import com.anthonyaya.platypus.ui.theme.PlatypusTheme
import com.anthonyaya.platypus.ui.videostudy.*
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class VideoReadingPositionTest {
    @get:Rule val compose = createComposeRule()
    private val context get() = ApplicationProvider.getApplicationContext<Context>()
    private fun article(id: String, count: Int = 24) = VideoStudyDocument(id = id, title = "Reading position test", sentences = (0 until count).map { index ->
        SubtitleSentence("$id-sentence-$index", "00:${index.toString().padStart(2, '0')}",
            "Reading sentence number $index helps us keep our place while studying useful words.", "这是第${index + 1}个用于阅读位置测试的句子。")
    })

    @Test fun positionsSurviveStoreRestartAndAreIsolatedFromOtherArticlesAndDrafts() {
        val a = article("position-store-a"); val b = article("position-store-b")
        val first = readingPosition(a, 8, 31.5f)!!; val second = readingPosition(b, 3, 14f)!!
        val store = VideoReadingPositionStore(context)
        store.save(first); store.save(second)
        VideoLiveStore(context).save(VideoLiveSession(draft = listOf(DraftWord("preserved"))))
        assertEquals(first, VideoReadingPositionStore(context).load(a.id))
        assertEquals(second, VideoReadingPositionStore(context).load(b.id))
        store.clear(a.id)
        assertNull(store.load(a.id)); assertEquals(second, store.load(b.id))
        assertEquals("preserved", VideoLiveStore(context).load().draft.single().word)
        store.clear(b.id); VideoLiveStore(context).save(VideoLiveSession())
    }

    @Test fun stableIdsBeatIndexesAndChangedTextDoesNotReuseAnOldPixelOffset() {
        val original = article("position-resolve")
        val saved = readingPosition(original, 8, 35f)!!
        val reordered = original.copy(sentences = original.sentences.reversed())
        assertEquals(ResolvedReadingPosition(15, 35f), resolveReadingPosition(reordered, saved))
        val changed = original.copy(sentences = original.sentences.mapIndexed { index, sentence -> if (index == 8) sentence.copy(english = "This sentence was shortened.") else sentence })
        assertEquals(ResolvedReadingPosition(8, 0f), resolveReadingPosition(changed, saved))
        assertNull(resolveReadingPosition(original.copy(id = "another"), saved))
        assertNull(resolveReadingPosition(original.copy(sentences = emptyList()), saved))
    }

    @Test fun missingIdsResolveByTextThenTimeAndFinallyClampToAValidSentence() {
        val original = article("position-fallback")
        val saved = readingPosition(original, 8, 24f)!!
        val renamed = original.copy(sentences = original.sentences.map { it.copy(id = "new-${it.id}") })
        assertEquals(ResolvedReadingPosition(8, 0f), resolveReadingPosition(renamed, saved))
        val rewritten = renamed.copy(sentences = renamed.sentences.map { it.copy(english = "Updated subtitle content.") })
        assertEquals(ResolvedReadingPosition(8, 0f, approximate = true), resolveReadingPosition(rewritten, saved))
        val shorter = rewritten.copy(sentences = rewritten.sentences.take(2).map { it.copy(time = "") })
        val result = resolveReadingPosition(shorter, saved)!!
        assertTrue(result.approximate); assertTrue(result.sentenceIndex in 0..1)
        assertEquals(11, readingSentenceItemIndex(original.copy(status = "translating", error = "Retry translation"), 8))
    }

    @Test fun corruptPositionsFailClosedAndTheBeginningDoesNotNeedAResumeCard() {
        val document = article("position-corrupt")
        assertFalse(readingPosition(document, 0, 0f)!!.beyondBeginning)
        assertTrue(readingPosition(document, 0, 40f)!!.beyondBeginning)
        assertNull(readingPosition(document, -1, 0f)); assertNull(readingPosition(document, 0, Float.NaN))
        val prefs = context.getSharedPreferences("video-study-reading-position", Context.MODE_PRIVATE)
        prefs.edit().putString("position:${document.id}", "broken-json").commit()
        assertNull(VideoReadingPositionStore(context).load(document.id))
        prefs.edit().putString("position:${document.id}", "{\"documentId\":\"${document.id}\",\"sentenceId\":null}").commit()
        assertNull(VideoReadingPositionStore(context).load(document.id))
        assertNull(VideoReadingPositionStore(context).load("../../invalid"))
        VideoReadingPositionStore(context).clear(document.id)
    }

    @Test fun openingAnArticleOffersResumeWithoutOverwritingItAndContinueJumpsToTheSentence() {
        val document = article("position-ui-continue")
        val store = VideoReadingPositionStore(context)
        val saved = readingPosition(document, 8, 20f)!!; store.save(saved)
        compose.setContent { PlatypusTheme { VideoStudyReaderContent(VideoLiveState(document = document)) } }
        compose.onNodeWithTag("video-resume-card").assertIsDisplayed()
        compose.onNodeWithText("上次读到第 9 句").assertIsDisplayed()
        compose.runOnIdle { assertEquals(saved, store.load(document.id)) }
        compose.onNodeWithTag("video-resume-reading").performClick()
        compose.onNodeWithTag("video-resume-card").assertDoesNotExist()
        compose.onNodeWithTag("reader-sentence-${document.sentences[8].id}").assertIsDisplayed()
        compose.runOnIdle { assertEquals(document.sentences[8].id, store.load(document.id)?.sentenceId) }
        store.clear(document.id)
    }

    @Test fun scrollingAndLeavingThenReturningOffersTheSavedPositionAndFromStartResetsIt() {
        val document = article("position-ui-reopen")
        val store = VideoReadingPositionStore(context); store.clear(document.id)
        var showReader by mutableStateOf(true)
        compose.setContent { PlatypusTheme { if (showReader) VideoStudyReaderContent(VideoLiveState(document = document)) } }
        compose.onNodeWithTag("video-resume-card").assertDoesNotExist()
        compose.onNodeWithTag("video-reader").performScrollToIndex(readingSentenceItemIndex(document, 6))
        compose.waitForIdle()
        compose.runOnIdle { assertEquals(document.sentences[6].id, store.load(document.id)?.sentenceId); showReader = false }
        compose.waitForIdle()
        compose.runOnIdle { showReader = true }
        compose.onNodeWithText("上次读到第 7 句").assertIsDisplayed()
        compose.onNodeWithTag("video-read-from-start").performClick()
        compose.onNodeWithTag("video-resume-card").assertDoesNotExist()
        compose.runOnIdle { assertTrue(store.load(document.id)?.beyondBeginning != true); showReader = false }
        compose.waitForIdle()
        compose.runOnIdle { showReader = true }
        compose.onNodeWithTag("video-resume-card").assertDoesNotExist()
        store.clear(document.id)
    }

    @Test fun changingArticlesFlushesTheOldPositionWithoutSavingItToTheNewArticle() {
        val a = article("position-ui-a"); val b = article("position-ui-b")
        val store = VideoReadingPositionStore(context); store.clear(a.id); store.clear(b.id)
        var document by mutableStateOf(a)
        compose.setContent { PlatypusTheme { VideoStudyReaderContent(VideoLiveState(document = document)) } }
        compose.onNodeWithTag("video-reader").performScrollToIndex(readingSentenceItemIndex(a, 7))
        compose.runOnIdle { document = b }
        compose.onNodeWithTag("video-resume-card").assertDoesNotExist()
        compose.onNodeWithTag("video-reader").performScrollToIndex(readingSentenceItemIndex(b, 4))
        compose.runOnIdle { document = a }
        compose.onNodeWithText("上次读到第 8 句").assertIsDisplayed()
        compose.runOnIdle { assertEquals(a.sentences[7].id, store.load(a.id)?.sentenceId); assertEquals(b.sentences[4].id, store.load(b.id)?.sentenceId) }
        store.clear(a.id); store.clear(b.id)
    }

    @Test fun returningToTheHeaderDoesNotEraseTheReadingBookmark() {
        val document = article("position-ui-header")
        val store = VideoReadingPositionStore(context); store.clear(document.id)
        compose.setContent { PlatypusTheme { VideoStudyReaderContent(VideoLiveState(document = document)) } }
        compose.onNodeWithTag("video-reader").performScrollToIndex(readingSentenceItemIndex(document, 7))
        compose.waitForIdle()
        compose.onNodeWithTag("video-reader").performScrollToIndex(0)
        compose.runOnIdle { assertEquals(document.sentences[7].id, store.load(document.id)?.sentenceId) }
        store.clear(document.id)
    }

    @Test fun selectedOnlyFilteringDoesNotReplaceTheNormalReadingBookmark() {
        val original = article("position-ui-filter")
        val document = original.copy(sentences = original.sentences.mapIndexed { index, sentence ->
            if (index == 18) sentence.copy(english = sentence.english + " A special example.") else sentence
        })
        val store = VideoReadingPositionStore(context); store.clear(document.id)
        compose.setContent { PlatypusTheme { VideoStudyReaderContent(VideoLiveState(document = document,
            session = VideoLiveSession(draft = listOf(DraftWord("special"))))) } }
        compose.onNodeWithTag("video-reader").performScrollToIndex(readingSentenceItemIndex(document, 6))
        compose.waitForIdle()
        compose.onNodeWithTag("video-reader").performScrollToIndex(0)
        compose.onNodeWithText("只看已选").performClick()
        compose.onNodeWithTag("reader-sentence-${document.sentences[18].id}").assertIsDisplayed()
        compose.runOnIdle { assertEquals(document.sentences[6].id, store.load(document.id)?.sentenceId) }
        compose.onNodeWithText("只看已选").performClick()
        compose.runOnIdle { assertEquals(document.sentences[6].id, store.load(document.id)?.sentenceId) }
        store.clear(document.id)
    }

    @Test fun loadingAndErrorRowsDoNotChangeTheRestoredSentenceWhenTranslationFinishes() {
        val base = article("position-ui-translating")
        var document by mutableStateOf(base.copy(status = "translating", error = "Some translations are still pending"))
        val store = VideoReadingPositionStore(context); store.save(readingPosition(base, 8, 20f)!!)
        compose.setContent { PlatypusTheme { VideoStudyReaderContent(VideoLiveState(document = document)) } }
        compose.onNodeWithTag("video-resume-reading").performClick()
        compose.onNodeWithTag("reader-sentence-${base.sentences[8].id}").assertIsDisplayed()
        compose.runOnIdle { document = base }
        compose.onNodeWithTag("reader-sentence-${base.sentences[8].id}").assertIsDisplayed()
        compose.runOnIdle { assertEquals(base.sentences[8].id, store.load(base.id)?.sentenceId) }
        store.clear(base.id)
    }
}
