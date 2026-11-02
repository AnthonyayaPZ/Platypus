package com.anthonyaya.platypus.data.remote

import com.anthonyaya.platypus.data.model.SearchResponse
import com.anthonyaya.platypus.data.model.StateAction
import com.anthonyaya.platypus.data.model.StateResponse
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query
import retrofit2.http.Path
import com.anthonyaya.platypus.ui.videostudy.*

interface PlatypusApi {
    @GET("api/video-study/history")
    suspend fun videoHistory(): VideoHistoryResponse

    @GET("api/video-study/status")
    suspend fun videoStatus(): VideoServiceStatus

    @POST("api/video-study/search")
    suspend fun videoSearch(@Body request: Map<String, String>): VideoCandidatesResponse

    @POST("api/video-study/documents")
    suspend fun createVideoDocument(@Body request: Map<String, String>): VideoDocumentResponse

    @GET("api/video-study/documents/{id}")
    suspend fun videoDocument(@Path("id") id: String): VideoDocumentResponse

    @POST("api/video-study/documents/{id}/retry")
    suspend fun retryVideoDocument(@Path("id") id: String): VideoDocumentResponse

    @POST("api/video-study/imports")
    suspend fun createVideoImport(@Body request: PendingVideoImport): VideoJobResponse

    @GET("api/video-study/imports/{id}")
    suspend fun videoImport(@Path("id") id: String): VideoJobResponse

    @POST("api/video-study/imports/{id}/retry")
    suspend fun retryVideoImport(@Path("id") id: String): VideoJobResponse

    @GET("api/search")
    suspend fun search(@Query("q") query: String): SearchResponse

    @GET("api/state")
    suspend fun getState(): StateResponse

    @POST("api/state")
    suspend fun postAction(@Body action: StateAction): StateResponse
}

