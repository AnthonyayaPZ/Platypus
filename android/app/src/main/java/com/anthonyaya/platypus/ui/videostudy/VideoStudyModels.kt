package com.anthonyaya.platypus.ui.videostudy

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.util.Locale

data class DemoVideoLibrary(val documents: List<VideoStudyDocument> = emptyList())

data class VideoStudyDocument(
    val id: String = "",
    val title: String = "",
    val channel: String = "",
    val duration: String = "",
    val sentences: List<SubtitleSentence> = emptyList(),
    val status: String = "ready",
    val error: String? = null,
    val url: String? = null,
    val updatedAt: String? = null,
)

data class SubtitleSentence(
    val id: String = "",
    val time: String = "",
    val english: String = "",
    val chinese: String = "",
    val translationStatus: String? = null,
)

data class WordSource(
    val documentId: String = "",
    val title: String = "",
    val sentenceId: String = "",
    val time: String = "",
    val english: String = "",
)

data class DraftWord(val word: String = "", val sources: List<WordSource> = emptyList())
data class SubtitleToken(val text: String, val word: String? = null)
enum class ImportStatus(val label: String) {
    Waiting("等待中"), Processing("生成词条中…"), Success("已模拟收藏"), Failed("处理失败（演示）"),
}
data class ImportItem(val word: String, val status: ImportStatus = ImportStatus.Waiting, val error: String? = null)

fun normalizeStudyWord(value: String): String? {
    val word = value.trim().replace('’', '\'').replace('‘', '\'').lowercase(Locale.ROOT)
    return word.takeIf { it.matches(Regex("^[a-z][a-z'-]{0,47}$")) }
}

fun tokenizeSubtitle(text: String): List<SubtitleToken> {
    val pattern = Regex("[a-zA-Z]+(?:['’‘-][a-zA-Z]+)*")
    val tokens = mutableListOf<SubtitleToken>()
    var position = 0
    pattern.findAll(text).forEach { match ->
        if (match.range.first > position) tokens += SubtitleToken(text.substring(position, match.range.first))
        tokens += SubtitleToken(match.value, normalizeStudyWord(match.value))
        position = match.range.last + 1
    }
    if (position < text.length) tokens += SubtitleToken(text.substring(position))
    return tokens
}

fun addDraftWord(draft: List<DraftWord>, value: String, source: WordSource? = null): List<DraftWord> {
    val word = normalizeStudyWord(value) ?: return draft
    val existing = draft.firstOrNull { it.word == word }
    if (existing == null) return draft + DraftWord(word, listOfNotNull(source))
    if (source == null || existing.sources.any { it.documentId == source.documentId && it.sentenceId == source.sentenceId }) return draft
    return draft.map { if (it.word == word) it.copy(sources = it.sources + source) else it }
}

fun renameDraftWord(draft: List<DraftWord>, previous: String, value: String): List<DraftWord> {
    val word = normalizeStudyWord(value) ?: return draft
    val existing = draft.firstOrNull { it.word == previous } ?: return draft
    if (word == previous) return draft
    var result = addDraftWord(draft.filter { it.word != previous }, word)
    existing.sources.forEach { result = addDraftWord(result, word, it) }
    return result
}

class VideoStudyDraftStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences("video-study-demo", Context.MODE_PRIVATE)
    private val gson = Gson()

    fun load(): List<DraftWord> = runCatching {
        val type = object : TypeToken<List<DraftWord>>() {}.type
        val draft: List<DraftWord> = gson.fromJson(preferences.getString("draft-v1", "[]"), type)
        draft.take(300).filter { normalizeStudyWord(it.word) != null }.distinctBy { it.word }
    }.getOrDefault(emptyList())

    fun save(draft: List<DraftWord>) {
        preferences.edit().putString("draft-v1", gson.toJson(draft)).apply()
    }
}

fun loadDemoVideoDocuments(context: Context): List<VideoStudyDocument> =
    context.assets.open("video-study-demo.json").bufferedReader().use {
        Gson().fromJson(it, DemoVideoLibrary::class.java).documents
    }
