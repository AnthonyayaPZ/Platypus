package com.anthonyaya.platypus.ui.screens

import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToKey
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import com.anthonyaya.platypus.ui.theme.PlatypusTheme
import com.anthonyaya.platypus.ui.videostudy.DraftWord
import com.anthonyaya.platypus.ui.videostudy.SubtitleSentence
import com.anthonyaya.platypus.ui.videostudy.VideoStudyDocument
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w390dp-h844dp")
class VideoStudyDemoTest {
    @get:Rule
    val compose = createComposeRule()

    private val documents = listOf(VideoStudyDocument(
        id = "demo", title = "A curious learner", channel = "Demo", duration = "00:30",
        sentences = listOf(
            SubtitleSentence("one", "00:01", "A resilient learner stays curious.", "有韧性的学习者保持好奇。"),
            SubtitleSentence("two", "00:10", "Stay resilient and keep learning.", "保持韧性，持续学习。"),
        ),
    ))

    @Test
    fun selectingRepeatedWordsKeepsHighlightsAndDraftCountInSync() {
        compose.setContent { PlatypusTheme { VideoStudyDemoContent(documents) } }
        compose.onNodeWithTag("video-word-one-resilient").performScrollTo().performClick()
        compose.onNodeWithText("待收藏 1 词").assertExists()
        compose.onNodeWithTag("video-study-list").performScrollToKey("two")
        compose.onNodeWithTag("video-word-two-resilient").performScrollTo().assertIsSelected().performClick()
        compose.onNodeWithText("待收藏 0 词").assertExists()
    }

    @Test
    fun draftCanBeEditedMergedAndImportedWithAFailedItemRetainedForRetry() {
        compose.setContent {
            PlatypusTheme { VideoStudyDemoContent(documents, initialDraft = listOf(DraftWord("running"), DraftWord("run"))) }
        }
        compose.onNodeWithTag("video-open-draft").performClick()
        compose.onNodeWithTag("video-edit-running").performScrollTo().performClick()
        compose.onNodeWithTag("video-edit-word").performTextClearance()
        compose.onNodeWithTag("video-edit-word").performTextInput("run")
        compose.onNodeWithText("保存").performClick()
        compose.onNodeWithText("待收藏区 · 1 词").assertExists()
        // Enable a deliberate demo failure; the draft must not silently disappear.
        compose.onNodeWithText("体验一次失败与重试").performClick()
        compose.onNodeWithTag("video-submit-batch").performClick()
        compose.mainClock.advanceTimeBy(1200)
        compose.waitForIdle()
        compose.onNodeWithText("处理失败（演示）").performScrollTo().assertExists()
        compose.onNodeWithText("待收藏区 · 1 词").assertExists()
        compose.onNodeWithText("仅重试失败项").performScrollTo().performClick()
        compose.mainClock.advanceTimeBy(1200)
        compose.waitForIdle()
        compose.onNodeWithText("已模拟收藏").performScrollTo().assertExists()
        compose.onNodeWithText("待收藏区 · 0 词").assertExists()
    }
}
