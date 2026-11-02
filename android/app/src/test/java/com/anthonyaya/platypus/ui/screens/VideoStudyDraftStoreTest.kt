package com.anthonyaya.platypus.ui.screens

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.anthonyaya.platypus.ui.videostudy.VideoStudyDraftStore
import com.anthonyaya.platypus.ui.videostudy.WordSource
import com.anthonyaya.platypus.ui.videostudy.addDraftWord
import com.anthonyaya.platypus.ui.videostudy.loadDemoVideoDocuments
import com.anthonyaya.platypus.ui.videostudy.renameDraftWord
import com.anthonyaya.platypus.ui.videostudy.tokenizeSubtitle
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class VideoStudyDraftStoreTest {
    @Test
    fun renamingAndRestoringDraftsPreservesAllSourcesAndDeduplicatesWords() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val store = VideoStudyDraftStore(context)
        val source = WordSource("one", "Demo", "sentence", "00:01", "Keep running.")
        var draft = addDraftWord(emptyList(), "Running", source)
        draft = addDraftWord(draft, "RUNNING", source)
        draft = addDraftWord(draft, "run", source.copy(documentId = "two"))
        draft = renameDraftWord(draft, "running", "run")
        assertEquals(1, draft.size)
        assertEquals(2, draft.single().sources.size)
        store.save(draft)
        assertEquals(draft, VideoStudyDraftStore(context).load())
        store.save(emptyList())
    }

    @Test
    fun sharedSubtitleAssetsKeepPunctuationAndContractionsIntact() {
        val documents = loadDemoVideoDocuments(ApplicationProvider.getApplicationContext())
        assertEquals(2, documents.size)
        documents.flatMap { it.sentences }.forEach { sentence ->
            assertEquals(sentence.english, tokenizeSubtitle(sentence.english).joinToString("") { it.text })
            assertTrue(sentence.chinese.isNotBlank())
        }
        val tokens = tokenizeSubtitle("You don’t need a long-term plan!")
        assertTrue(tokens.any { it.word == "don't" })
        assertTrue(tokens.any { it.word == "long-term" })
    }
}
