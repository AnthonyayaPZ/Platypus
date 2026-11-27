package com.anthonyaya.platypus.ui.screens

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.anthonyaya.platypus.ui.components.NoteDialog
import com.anthonyaya.platypus.ui.theme.PlatypusTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class WordNotesTest {
    @get:Rule val compose = createComposeRule()

    @Test fun longerVideoNotesRemainEditableAndSaveWithoutTheOldTwoThousandCharacterTruncation() {
        val initial = "视频例句及译文。".repeat(300)
        var saved = ""
        compose.setContent { PlatypusTheme { NoteDialog("curious", initial, {}, { saved = it }) } }
        compose.onNode(hasSetTextAction()).performTextReplacement(initial + "补充手写笔记")
        compose.onNodeWithText("保存").performClick()
        compose.runOnIdle { assertEquals(initial + "补充手写笔记", saved) }
    }
}
