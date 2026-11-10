package com.anthonyaya.platypus.ui.videostudy

import java.io.InputStream
import java.io.ByteArrayOutputStream

const val MAX_SUBTITLE_UPLOAD_BYTES = 4 * 1024 * 1024

fun readSubtitleUpload(stream: InputStream): String {
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    while (true) {
        val count = stream.read(buffer)
        if (count < 0) break
        require(output.size() + count <= MAX_SUBTITLE_UPLOAD_BYTES) { "字幕文件不能超过 4 MiB，支持3小时以内字幕" }
        output.write(buffer, 0, count)
    }
    return output.toString("UTF-8")
}
