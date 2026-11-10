package com.anthonyaya.platypus.ui.screens

import com.anthonyaya.platypus.ui.videostudy.MAX_SUBTITLE_UPLOAD_BYTES
import com.anthonyaya.platypus.ui.videostudy.readSubtitleUpload
import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream

class SubtitleUploadTest {
    @Test fun largeSubtitleAboveTheOldLimitIsReadInFull() {
        val text = "WEBVTT\n\n02:59:58.000 --> 03:00:00.000\n" + "English subtitle. ".repeat(40000)
        assertTrue(text.length > 500000)
        assertEquals(text, readSubtitleUpload(ByteArrayInputStream(text.toByteArray())))
    }
    @Test fun exactByteLimitIsAcceptedAndOversizeIsRejected() {
        assertEquals(MAX_SUBTITLE_UPLOAD_BYTES, readSubtitleUpload(ByteArrayInputStream(ByteArray(MAX_SUBTITLE_UPLOAD_BYTES) { 65 })).length)
        try { readSubtitleUpload(ByteArrayInputStream(ByteArray(MAX_SUBTITLE_UPLOAD_BYTES + 1) { 65 })); fail("Expected oversize rejection") }
        catch (error: IllegalArgumentException) { assertTrue(error.message!!.contains("4 MiB")) }
    }
}
