package com.anthonyaya.platypus.ui.videostudy

import android.content.Context
import android.util.AtomicFile
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.io.File
import java.time.Instant

data class StudyHistoryItem(
    val id: String = "", val title: String = "", val channel: String = "", val duration: String = "",
    val status: String = "ready", val sentenceCount: Int = 0, val isExample: Boolean = false,
    val updatedAt: String? = null, val lastOpenedAt: String? = null,
)
data class VideoHistoryResponse(val documents: List<StudyHistoryItem> = emptyList())

fun VideoStudyDocument.historyItem(openedAt: String? = null) = StudyHistoryItem(
    id, title, channel, duration, status, sentences.size, id.startsWith("demo-"), updatedAt, openedAt,
)

fun mergeStudyHistory(current: List<StudyHistoryItem>, incoming: List<StudyHistoryItem>): List<StudyHistoryItem> {
    val items = current.associateBy { it.id }.toMutableMap()
    incoming.filter { it.id.isNotBlank() && it.title.isNotBlank() }.forEach { item ->
        items[item.id] = item.copy(lastOpenedAt = item.lastOpenedAt ?: items[item.id]?.lastOpenedAt)
    }
    return items.values.sortedWith(compareByDescending<StudyHistoryItem> {
        it.lastOpenedAt ?: if (it.isExample) "" else it.updatedAt.orEmpty()
    }.thenBy { it.title })
}

/** Metadata stays small; full articles are independent atomic files for offline reading. */
class VideoStudyHistoryStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences("video-study-history", Context.MODE_PRIVATE)
    private val directory = File(context.applicationContext.filesDir, "video-study-history")
    private val gson = Gson()
    fun entries(): List<StudyHistoryItem> = runCatching {
        gson.fromJson<List<StudyHistoryItem>>(preferences.getString("items-v1", "[]"), object : TypeToken<List<StudyHistoryItem>>() {}.type)
            .filter { validId(it.id) && it.title.isNotBlank() }.distinctBy { it.id }
    }.getOrDefault(emptyList())

    @Synchronized fun merge(incoming: List<StudyHistoryItem>): List<StudyHistoryItem> {
        val result = mergeStudyHistory(entries(), incoming)
        preferences.edit().putString("items-v1", gson.toJson(result)).apply()
        return result
    }

    @Synchronized fun remember(document: VideoStudyDocument, opened: Boolean = false): List<StudyHistoryItem> {
        require(validId(document.id))
        directory.mkdirs()
        val file = AtomicFile(File(directory, "${document.id}.json"))
        val stream = file.startWrite()
        try { stream.write(gson.toJson(document).toByteArray(Charsets.UTF_8)); file.finishWrite(stream) }
        catch (error: Exception) { file.failWrite(stream); throw error }
        return merge(listOf(document.historyItem(if (opened) Instant.now().toString() else null)))
    }

    @Synchronized fun document(id: String): VideoStudyDocument? {
        if (!validId(id)) return null
        return runCatching { AtomicFile(File(directory, "$id.json")).openRead().bufferedReader().use { gson.fromJson(it, VideoStudyDocument::class.java) } }
            .getOrNull()?.takeIf { it.id == id && it.title.isNotBlank() }
    }

    private fun validId(id: String) = id.matches(Regex("^[A-Za-z0-9_-]{1,100}$"))
}
