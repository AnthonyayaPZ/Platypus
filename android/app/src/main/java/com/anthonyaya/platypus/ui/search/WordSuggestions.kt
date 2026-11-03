package com.anthonyaya.platypus.ui.search

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Locale
import kotlin.math.min

object WordSuggestions {
    @Volatile private var cached: List<String>? = null
    suspend fun load(context: Context): List<String> = cached ?: withContext(Dispatchers.IO) {
        cached ?: context.applicationContext.assets.open("common-english.txt").bufferedReader().use { reader ->
            reader.lineSequence().map { it.trim().lowercase(Locale.ROOT) }.filter { it.matches(Regex("^[a-z]+$")) }.distinct().toList()
        }.also { cached = it }
    }
    fun suggest(words: List<String>, raw: String, limit: Int = 5): List<String> {
        val query = raw.trim().lowercase(Locale.ROOT)
        if (!query.matches(Regex("^[a-z]{1,48}$"))) return emptyList()
        val prefix = words.asSequence().filter { it.startsWith(query) }.take(limit).toList()
        if (prefix.isNotEmpty() || query.length < 3) return prefix
        val maximum = if (query.length >= 6) 2 else 1
        return words.mapIndexedNotNull { rank, word ->
            if (word.length < query.length - maximum) return@mapIndexedNotNull null
            val distance = distance(query, word.take(query.length + maximum), maximum)
            if (distance in 1..maximum) Triple(word, distance, rank) else null
        }.sortedWith(compareBy<Triple<String, Int, Int>> { it.second }.thenBy { it.third }).take(limit).map { it.first }
    }
    private fun distance(query: String, word: String, maximum: Int): Int {
        val matrix = Array(query.length + 1) { IntArray(word.length + 1) }
        for (r in 0..query.length) matrix[r][0] = r
        for (c in 0..word.length) matrix[0][c] = c
        for (r in 1..query.length) for (c in 1..word.length) {
            matrix[r][c] = minOf(matrix[r - 1][c] + 1, matrix[r][c - 1] + 1, matrix[r - 1][c - 1] + if (query[r - 1] == word[c - 1]) 0 else 1)
            if (r > 1 && c > 1 && query[r - 1] == word[c - 2] && query[r - 2] == word[c - 1]) matrix[r][c] = min(matrix[r][c], matrix[r - 2][c - 2] + 1)
        }
        return (maxOf(1, query.length - maximum)..word.length).minOfOrNull { matrix[query.length][it] } ?: Int.MAX_VALUE
    }
}
