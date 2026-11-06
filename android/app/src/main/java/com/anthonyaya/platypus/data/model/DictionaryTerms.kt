package com.anthonyaya.platypus.data.model

import java.util.Locale

fun normalizeDictionaryTerm(value: String): String? {
    if (value.length > 512) return null
    val term = value.trim().lowercase(Locale.ROOT).replace('’', '\'').replace('‘', '\'').replace(Regex("\\s+"), " ")
    val words = term.split(" ")
    if (term.isEmpty() || words.size > 8 || term.length > (if (words.size == 1) 48 else 96)
        || words.any { !it.matches(Regex("^[a-z]+(?:['-][a-z]+)*$")) }) return null
    return term
}

fun defaultSearchGroup(groups: List<WordGroup>, term: String, current: String): String =
    if (' ' in term) groups.firstOrNull { it.kind == "phrases" }?.id.orEmpty()
    else groups.firstOrNull { it.id == current && it.kind != "phrases" }?.id
        ?: groups.firstOrNull { it.isDefault == 1 && it.kind != "phrases" }?.id
        ?: groups.firstOrNull { it.kind != "phrases" }?.id.orEmpty()
