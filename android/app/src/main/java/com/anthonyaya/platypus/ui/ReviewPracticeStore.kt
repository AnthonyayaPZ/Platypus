package com.anthonyaya.platypus.ui

import android.content.Context
import androidx.core.content.edit
import com.anthonyaya.platypus.data.model.ReviewSession
import com.anthonyaya.platypus.data.model.SavedWord
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

interface PracticeQueuePersistence { fun load(): List<String>; fun save(words: List<String>) }

class ReviewPracticeStore(context: Context) : PracticeQueuePersistence {
    private val preferences = context.applicationContext.getSharedPreferences("review-priority", Context.MODE_PRIVATE)
    private val gson = Gson()
    override fun load(): List<String> = runCatching {
        val words: List<String> = gson.fromJson(preferences.getString("words-v1", "[]"), object : TypeToken<List<String>>() {}.type)
        words.filter { it.matches(Regex("^[a-z][a-z'-]{0,47}$")) }.distinct().take(200)
    }.getOrDefault(emptyList())
    override fun save(words: List<String>) { preferences.edit { putString("words-v1", gson.toJson(words)) } }
}

fun remainingPracticeWords(queue: List<String>, savedWords: List<SavedWord>, session: ReviewSession?): List<String> {
    val available = savedWords.map { it.word }.toSet()
    val completed = session?.tasks.orEmpty().groupBy { it.word }.filterValues { tasks ->
        tasks.size >= 3 && tasks.all { it.selectedAnswer != null }
    }.keys
    return queue.distinct().filter { it in available && it !in completed }
}
