package com.anthonyaya.platypus.ui.videostudy

data class SubtitleProgress(val stage: String = "queued", val total: Int = 0, val processed: Int = 0,
    val succeeded: Int = 0, val failed: Int = 0, val updatedAt: String = "") {
    val percent: Int? get() = if (stage in listOf("translating", "ready", "partial") && total > 0) (processed.toLong() * 100 / total).toInt().coerceIn(0, 100) else null
    val label: String get() = when (stage) {
        "queued" -> "任务已提交，等待后台处理"
        "fetching" -> "正在获取英文字幕"
        "parsing" -> "正在解析字幕文件"
        "segmenting" -> "正在切分阅读段落"
        "translating" -> "正在翻译字幕"
        "ready" -> "翻译完成"
        "partial" -> "处理结束，部分翻译未完成"
        "failed" -> "字幕处理失败"
        else -> "正在处理字幕"
    }
}

data class SubtitleProgressResponse(val id: String, val status: String, val progress: SubtitleProgress, val error: String = "", val updatedAt: String = "")

fun VideoStudyDocument.displayProgress(): SubtitleProgress {
    progress?.let { return it }
    val succeeded = sentences.count { it.chinese.isNotBlank() }
    val failed = sentences.count { it.chinese.isBlank() && it.translationStatus == "failed" }
    return SubtitleProgress(status, sentences.size, succeeded + failed, succeeded, failed, updatedAt.orEmpty())
}

fun needsSubtitleSnapshot(document: VideoStudyDocument?, metadata: SubtitleProgressResponse?, id: String, elapsedMs: Long, force: Boolean = false): Boolean =
    force || document?.id != id || metadata == null || metadata.updatedAt != document.updatedAt && (metadata.status in listOf("ready", "partial", "failed") || elapsedMs >= 10_000)
