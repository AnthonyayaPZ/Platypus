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
class VideoStudyReaderTest {
    @get:Rule val compose = createComposeRule()

    @Test fun readingStaysCompactAndSearchAndDraftExpandOnlyOnTap() {
        val documents = loadDemoVideoDocuments(ApplicationProvider.getApplicationContext())
        compose.setContent { PlatypusTheme { VideoStudyReaderContent(VideoLiveState(document = documents.first(), history = documents.map { it.historyItem() })) } }
        compose.onNodeWithText("真实视频").assertDoesNotExist()
        compose.onNodeWithText("离线演示").assertDoesNotExist()
        compose.onNodeWithText("✦ 交互 Demo").assertDoesNotExist()
        compose.onNodeWithText("YouTube 标题或链接").assertDoesNotExist()
        compose.onNodeWithTag("video-open-search").performClick()
        compose.onNodeWithText("YouTube 标题或链接").assertIsDisplayed()
        compose.onNodeWithText("关闭").performClick()
        compose.onNodeWithTag("video-open-draft").performClick()
        compose.onNodeWithText("手动添加单词").assertIsDisplayed()
    }

    @Test fun historyOpensBuiltInArticlesInTheSameReader() {
        val documents = loadDemoVideoDocuments(ApplicationProvider.getApplicationContext())
        var selected = ""
        compose.setContent {
            var state by remember { mutableStateOf(VideoLiveState(document = documents.first(), history = documents.map { it.historyItem() })) }
            PlatypusTheme { VideoStudyReaderContent(state, actions = VideoReaderActions(openArticle = { id -> selected = id; state = state.copy(document = documents.first { it.id == id }) })) }
        }
        compose.onNodeWithTag("video-open-history").performClick()
        compose.onNodeWithText(documents[1].title).performClick()
        compose.onNodeWithText(documents[1].title).assertIsDisplayed()
        compose.runOnIdle { assertEquals(documents[1].id, selected) }
        compose.onNodeWithTag("video-history-list").assertDoesNotExist()
    }

    @Test fun articleCacheAndHistorySurviveRestartAndKeepOpenOrderOnCloudRefresh() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val article = loadDemoVideoDocuments(context).first().copy(id = "test-history-reader-article", title = "Saved article")
        val store = VideoStudyHistoryStore(context)
        store.remember(article, opened = true)
        val opened = store.entries().first { it.id == article.id }.lastOpenedAt
        store.merge(listOf(article.historyItem()))
        val restored = VideoStudyHistoryStore(context)
        assertEquals(article, restored.document(article.id))
        assertEquals(opened, restored.entries().first { it.id == article.id }.lastOpenedAt)
        assertNull(restored.document("../../outside"))
        assertEquals(1, restored.entries().count { it.id == article.id })
    }
}
