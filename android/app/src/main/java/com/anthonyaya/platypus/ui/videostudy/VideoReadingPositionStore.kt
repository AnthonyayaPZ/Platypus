package com.anthonyaya.platypus.ui.videostudy

import android.content.Context
import androidx.core.content.edit
import com.google.gson.Gson
import kotlin.math.abs
import kotlin.math.roundToInt

data class VideoReadingPosition(
    val documentId: String = "",
    val sentenceId: String = "",
    val sentenceIndex: Int = 0,
    val offsetDp: Float = 0f,
    val englishPrefix: String = "",
    val time: String = "",
    val sentenceCount: Int = 0,
    val savedAt: Long = 0L,
) {
    val beyondBeginning: Boolean get() = sentenceIndex > 0 || offsetDp >= 24f
}

data class ResolvedReadingPosition(val sentenceIndex: Int, val offsetDp: Float, val approximate: Boolean = false)

private fun readingText(text: String) = text.trim().replace(Regex("\\s+"), " ").take(160)

fun readingPosition(document: VideoStudyDocument, sentenceIndex: Int, offsetDp: Float): VideoReadingPosition? {
    val sentence = document.sentences.getOrNull(sentenceIndex) ?: return null
    if (document.id.isBlank() || sentence.id.isBlank() || !offsetDp.isFinite()) return null
    return VideoReadingPosition(document.id, sentence.id, sentenceIndex, offsetDp.coerceIn(0f, 5000f),
        readingText(sentence.english), sentence.time, document.sentences.size, System.currentTimeMillis())
}

/** Prefer stable IDs. Text/time fallbacks keep old positions useful after subtitles are re-segmented. */
fun resolveReadingPosition(document: VideoStudyDocument, saved: VideoReadingPosition): ResolvedReadingPosition? {
    if (document.id != saved.documentId || document.sentences.isEmpty()) return null
    val sentences = document.sentences
    val exact = sentences.indexOfFirst { it.id == saved.sentenceId }
    if (exact >= 0) return ResolvedReadingPosition(exact,
        if (readingText(sentences[exact].english) == saved.englishPrefix) saved.offsetDp.coerceIn(0f, 5000f) else 0f)
    val text = sentences.indexOfFirst {
        val candidate = readingText(it.english)
        saved.englishPrefix.isNotBlank() && (candidate == saved.englishPrefix ||
            minOf(candidate.length, saved.englishPrefix.length) >= 32 &&
            (candidate.startsWith(saved.englishPrefix) || saved.englishPrefix.startsWith(candidate)))
    }
    if (text >= 0) return ResolvedReadingPosition(text, 0f)
    val proportionalIndex = if (saved.sentenceCount > 1)
        (saved.sentenceIndex.toDouble() / (saved.sentenceCount - 1) * (sentences.size - 1)).roundToInt().coerceIn(sentences.indices)
        else saved.sentenceIndex.coerceIn(sentences.indices)
    val sameTime = sentences.indices.filter { saved.time.isNotBlank() && sentences[it].time == saved.time }
    return ResolvedReadingPosition(sameTime.minByOrNull { abs(it - proportionalIndex) } ?: proportionalIndex, 0f, approximate = true)
}

/** Header, optional loading/error rows, then the stable sentence rows. */
fun readingSentenceItemIndex(document: VideoStudyDocument, sentenceIndex: Int): Int = 1 +
    (if (document.status in listOf("queued", "fetching", "translating")) 1 else 0) +
    (if (!document.error.isNullOrBlank()) 1 else 0) + sentenceIndex

/** Separate from drafts/history so remembering a viewport cannot erase learning data. */
class VideoReadingPositionStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences("video-study-reading-position", Context.MODE_PRIVATE)
    private val gson = Gson()
    fun load(documentId: String): VideoReadingPosition? {
        if (!validId(documentId)) return null
        return runCatching {
            gson.fromJson(preferences.getString("position:$documentId", null), VideoReadingPosition::class.java)
                ?.takeIf { it.documentId == documentId && it.sentenceId.isNotBlank() && it.sentenceId.length <= 150 &&
                    it.sentenceIndex in 0..10000 && it.offsetDp.isFinite() && it.offsetDp in 0f..5000f &&
                    it.sentenceCount in 1..10000 && it.englishPrefix.length <= 160 && it.time.length <= 100 }
        }.getOrNull()
    }
    fun save(position: VideoReadingPosition) {
        if (!validId(position.documentId) || position.sentenceId.isBlank() || !position.offsetDp.isFinite()) return
        preferences.edit { putString("position:${position.documentId}", gson.toJson(position)) }
    }
    fun clear(documentId: String) { if (validId(documentId)) preferences.edit { remove("position:$documentId") } }
    private fun validId(id: String) = id.matches(Regex("^[A-Za-z0-9_-]{1,100}$"))
}
