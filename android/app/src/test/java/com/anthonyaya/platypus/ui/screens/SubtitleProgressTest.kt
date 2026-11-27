package com.anthonyaya.platypus.ui.screens

import android.content.Context
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.core.app.ApplicationProvider
import com.anthonyaya.platypus.data.remote.UploadProgressBody
import com.anthonyaya.platypus.ui.theme.PlatypusTheme
import com.anthonyaya.platypus.ui.videostudy.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okio.Buffer
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w360dp-h800dp")
class SubtitleProgressTest {
    @get:Rule val compose = createComposeRule()
    private val progress = SubtitleProgress("translating", 2000, 640, 620, 20, "now")
    @Test fun cardSeparatesFailedAndSuccessfulCountsOnSmallScreen() {
        compose.setContent { PlatypusTheme { SubtitleProgressCard(progress) } }
        compose.onNodeWithText("32%").assertIsDisplayed()
        compose.onNodeWithText("已处理 640 / 2000 段 · 成功 620 · 失败 20").assertIsDisplayed()
        compose.onNodeWithText("翻译完成").assertDoesNotExist()
    }
    @Test fun uploadCompletionStillWaitsForServerAcknowledgement() {
        compose.setContent { PlatypusTheme { SubtitleProgressCard(progress, 100) } }
        compose.onNodeWithText("上传已发送，等待服务器校验").assertIsDisplayed()
        compose.onNodeWithText("100%").assertIsDisplayed()
        compose.onNodeWithText("翻译完成").assertDoesNotExist()
    }
    @Test fun parsingHasNoInventedPercentageAndPartialCompletionIsNotSuccess() {
        assertNull(progress.copy(stage = "parsing").percent)
        val partial = progress.copy(stage = "partial", processed = 2000, failed = 1380)
        assertEquals(100, partial.percent)
        assertEquals("处理结束，部分翻译未完成", partial.label)
        assertNull(progress.copy(total = 0).percent)
    }
    @Test fun metadataRefreshDoesNotDownloadFullArticlesAtEachTick() {
        val document = VideoStudyDocument(id = "doc", updatedAt = "old")
        val metadata = SubtitleProgressResponse("doc", "translating", progress, updatedAt = "new")
        assertFalse(needsSubtitleSnapshot(document, metadata, "doc", 2000))
        assertTrue(needsSubtitleSnapshot(document, metadata, "doc", 10000))
        assertFalse(needsSubtitleSnapshot(document.copy(updatedAt = "new"), metadata, "doc", 10000))
        assertTrue(needsSubtitleSnapshot(document, metadata.copy(status = "ready"), "doc", 2000))
        assertTrue(needsSubtitleSnapshot(document, null, "doc", 0))
    }
    @Test fun actualUploadBytesAreUnchangedAndProgressCanRestartWhenTheHttpBodyIsReplayed() {
        val text = "英语字幕 ".repeat(20000)
        val values = mutableListOf<Int>()
        val body = UploadProgressBody(text.toRequestBody("application/json".toMediaType())) { values += it }
        val output = Buffer(); body.writeTo(output)
        assertEquals(text, output.readUtf8()); assertEquals(0, values.first()); assertEquals(100, values.last())
        assertTrue(values.zipWithNext().all { (a, b) -> b >= a })
        values.clear(); body.writeTo(Buffer()); assertEquals(0, values.first()); assertEquals(100, values.last())
    }
    @Test fun cachedArticleRestoresCountersWithoutClearingTheReadingBookmark() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val document = VideoStudyDocument(id = "test-progress-cache", title = "Progress", status = "translating", progress = progress)
        val store = VideoStudyHistoryStore(context); store.remember(document)
        val bookmark = VideoReadingPosition(document.id, "sentence-8", 8, 10f, "Reading", "01:00", 20, 1L)
        VideoReadingPositionStore(context).save(bookmark)
        store.remember(document.copy(progress = progress.copy(processed = 660)))
        assertEquals(bookmark, VideoReadingPositionStore(context).load(document.id))
        VideoReadingPositionStore(context).clear(document.id)
        store.remember(document)
        assertEquals(progress, VideoStudyHistoryStore(context).document(document.id)?.progress)
        val old = document.copy(progress = null, sentences = listOf(SubtitleSentence(id = "one", chinese = "译文"), SubtitleSentence(id = "two", translationStatus = "failed")))
        assertEquals(1, old.displayProgress().succeeded); assertEquals(1, old.displayProgress().failed)
    }
}
