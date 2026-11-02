package com.anthonyaya.platypus.data.repository

import com.anthonyaya.platypus.data.model.ApiError
import com.anthonyaya.platypus.data.model.SearchResponse
import com.anthonyaya.platypus.data.model.StateAction
import com.anthonyaya.platypus.data.model.StateResponse
import com.anthonyaya.platypus.data.remote.PlatypusApi
import com.google.gson.Gson
import retrofit2.HttpException
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

interface PlatypusRepository {
    suspend fun search(query: String): Result<SearchResponse>
    suspend fun state(): Result<StateResponse>
    suspend fun act(action: StateAction): Result<StateResponse>
}

class NetworkPlatypusRepository(
    private val api: PlatypusApi,
    private val gson: Gson = Gson(),
) : PlatypusRepository {
    override suspend fun search(query: String) = call { api.search(query) }

    override suspend fun state() = call { api.getState() }

    override suspend fun act(action: StateAction) = call { api.postAction(action) }

    private suspend fun <T> call(request: suspend () -> T): Result<T> = try {
        Result.success(request())
    } catch (error: HttpException) {
        val message = runCatching {
            gson.fromJson(error.response()?.errorBody()?.string(), ApiError::class.java).error
        }.getOrNull()
        Result.failure(ApiException(message ?: "服务器返回了错误（${error.code()}）", error))
    } catch (error: SocketTimeoutException) {
        Result.failure(ApiException("服务器响应超时，生成新词条可能需要较长时间，请稍后重试", error))
    } catch (error: ConnectException) {
        Result.failure(ApiException("无法连接服务器，请检查当前网络后重试", error))
    } catch (error: UnknownHostException) {
        Result.failure(ApiException("无法解析服务器地址，请检查当前网络后重试", error))
    } catch (error: IOException) {
        Result.failure(ApiException("网络请求失败，请检查网络连接后重试", error))
    } catch (error: Exception) {
        Result.failure(ApiException(error.message ?: "请求失败，请稍后重试", error))
    }
}

class ApiException(message: String, cause: Throwable? = null) : Exception(message, cause)
