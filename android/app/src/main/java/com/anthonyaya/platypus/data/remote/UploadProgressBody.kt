package com.anthonyaya.platypus.data.remote

import okhttp3.RequestBody
import okhttp3.MediaType
import okio.BufferedSink
import okio.ForwardingSink
import okio.buffer

class UploadProgressBody(private val body: RequestBody, private val onProgress: (Int) -> Unit) : RequestBody() {
    override fun contentType(): MediaType? = body.contentType()
    override fun contentLength() = body.contentLength()
    override fun writeTo(sink: BufferedSink) {
        val total = contentLength()
        var sent = 0L
        onProgress(0)
        val counting = object : ForwardingSink(sink) {
            override fun write(source: okio.Buffer, byteCount: Long) {
                super.write(source, byteCount)
                sent += byteCount
                if (total > 0) onProgress((sent * 100 / total).toInt().coerceIn(0, 100))
            }
        }.buffer()
        body.writeTo(counting)
        counting.flush()
    }
}
