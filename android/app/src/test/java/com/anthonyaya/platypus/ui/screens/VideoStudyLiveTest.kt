package com.anthonyaya.platypus.ui.screens

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.anthonyaya.platypus.data.remote.PlatypusApi
import com.anthonyaya.platypus.ui.videostudy.*
import com.google.gson.Gson
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class VideoStudyLiveTest {
    @Test fun successfulItemsAreAcknowledgedOnceAndFailedDraftsRemain() {
        val job = VideoImportJob("job-one", "partial", "视频词库", listOf(VideoJobItem("ready", "success"), VideoJobItem("retry", "failed", "超时")))
        val session = VideoLiveSession(draft = listOf(DraftWord("ready"), DraftWord("retry")), jobId = job.id)
        val result = applyVideoJob(session, job)
        assertEquals(listOf("retry"), result.draft.map { it.word })
        val readded = result.copy(draft = result.draft + DraftWord("ready"))
        assertEquals(readded, applyVideoJob(readded, job))
        assertEquals(ImportStatus.Failed, job.items.last().displayItem().status)
        assertEquals("超时", job.items.last().displayItem().error)
        assertEquals(session, applyVideoJob(session, job.copy(id = "unrelated")))
    }

    @Test fun liveSessionAndPendingIdentitySurviveRestartAndStaySeparateFromDemo() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val store = VideoLiveStore(context)
        val draft = listOf(DraftWord("curious"))
        val session = VideoLiveSession(draft, "document-one", "job-one", listOf("ready"), PendingVideoImport("stable-request-id", "group-one", draft))
        store.save(session)
        assertEquals(session, VideoLiveStore(context).load())
        VideoStudyDraftStore(context).save(listOf(DraftWord("demo")))
        assertEquals(session, store.load())
        store.save(VideoLiveSession())
        VideoStudyDraftStore(context).save(emptyList())
    }

    @Test fun retrofitUsesRealPathsAndParsesDocumentAndJobContracts() = runBlocking {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val requests = mutableListOf<Pair<String, String>>()
        server.createContext("/") { exchange ->
            val body = exchange.requestBody.bufferedReader().readText()
            requests += exchange.requestURI.path to body
            val response = when (exchange.requestURI.path) {
                "/api/video-study/status" -> """{"workerReady":true,"captionsConfigured":true,"groups":[]}"""
                "/api/video-study/search" -> """{"candidates":[{"id":"abcdefghijk","title":"English","channel":"Test","duration":"01:00"}]}"""
                "/api/video-study/imports", "/api/video-study/imports/job-one", "/api/video-study/imports/job-one/retry" -> """{"job":{"id":"job-one","status":"partial","groupName":"视频词库","items":[{"word":"curious","status":"failed","error":"超时"}]}}"""
                else -> """{"document":{"id":"doc-one","title":"English","channel":"Test","duration":"01:00","status":"translating","sentences":[{"id":"sentence-1","time":"00:00","english":"Stay curious.","chinese":"","translationStatus":"pending"}]}}"""
            }.toByteArray()
            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.sendResponseHeaders(200, response.size.toLong())
            exchange.responseBody.use { it.write(response) }
        }
        server.start()
        try {
            val api = Retrofit.Builder().baseUrl("http://127.0.0.1:${server.address.port}/").addConverterFactory(GsonConverterFactory.create()).build().create(PlatypusApi::class.java)
            assertTrue(api.videoStatus().workerReady)
            assertEquals("abcdefghijk", api.videoSearch(mapOf("query" to "English")).candidates.single().id)
            assertEquals("translating", api.createVideoDocument(mapOf("videoId" to "abcdefghijk")).document.status)
            assertEquals("pending", api.videoDocument("doc-one").document.sentences.single().translationStatus)
            api.retryVideoDocument("doc-one")
            val pending = PendingVideoImport("stable-request-id", "group-one", listOf(DraftWord("curious")))
            assertEquals("partial", api.createVideoImport(pending).job.status)
            assertEquals("超时", api.videoImport("job-one").job.items.single().error)
            api.retryVideoImport("job-one")
            val payload = requests.first { it.first == "/api/video-study/imports" }.second
            assertEquals(pending, Gson().fromJson(payload, PendingVideoImport::class.java))
            assertTrue(requests.any { it.first == "/api/video-study/documents/doc-one/retry" })
        } finally { server.stop(0) }
    }
}
