package com.anthonyaya.platypus.data.model

import com.google.gson.annotations.SerializedName

data class RelationDetail(
    val word: String = "",
    val type: String = "synonym",
    val comparison: String = "",
    val usage: String = "",
)

data class WordEntry(
    val word: String = "",
    val phonetic: String = "",
    val part: String = "",
    val meaning: String = "",
    val summary: String = "",
    val example: String = "",
    @SerializedName("exampleZh") val exampleZh: String = "",
    val synonyms: List<String> = emptyList(),
    val antonyms: List<String> = emptyList(),
    val relations: List<RelationDetail> = emptyList(),
)

data class WordMeta(
    val word: String = "",
    val note: String = "",
    @SerializedName("first_saved_at") val firstSavedAt: String = "",
    @SerializedName("updated_at") val updatedAt: String = "",
    val repetitions: Int = 0,
    @SerializedName("next_review") val nextReview: String = "",
    @SerializedName("last_reviewed") val lastReviewed: String? = null,
    @SerializedName("group_ids") val groupIds: List<String> = emptyList(),
)

data class WordGroup(
    val id: String = "",
    val name: String = "",
    val color: String = "#d7a545",
    @SerializedName("is_default") val isDefault: Int = 0,
    @SerializedName("word_count") val wordCount: Int = 0,
    @SerializedName("due_count") val dueCount: Int = 0,
)

data class SavedWord(
    val word: String = "",
    @SerializedName("group_id") val groupId: String = "",
    @SerializedName("added_at") val addedAt: String = "",
    val note: String = "",
    @SerializedName("first_saved_at") val firstSavedAt: String = "",
    val repetitions: Int = 0,
    @SerializedName("next_review") val nextReview: String = "",
    @SerializedName("last_reviewed") val lastReviewed: String? = null,
    val entry: WordEntry = WordEntry(),
)

data class ReviewTask(
    val id: String = "",
    val word: String = "",
    @SerializedName("question_type") val questionType: String = "word-meaning",
    val position: Int = 0,
    val options: List<String> = emptyList(),
    @SerializedName("correct_answer") val correctAnswer: String = "",
    @SerializedName("selected_answer") val selectedAnswer: String? = null,
    @SerializedName("is_correct") val isCorrect: Boolean? = null,
    @SerializedName("answered_at") val answeredAt: String? = null,
    val phonetic: String = "",
    val meaning: String = "",
    val summary: String = "",
)

data class ReviewSession(
    val id: String = "",
    @SerializedName("group_id") val groupId: String = "",
    val status: String = "active",
    @SerializedName("word_count") val wordCount: Int = 0,
    @SerializedName("total_tasks") val totalTasks: Int = 0,
    val tasks: List<ReviewTask> = emptyList(),
)

data class SearchResponse(
    val entry: WordEntry? = null,
    val meta: WordMeta? = null,
    val source: String? = null,
    val error: String? = null,
)

data class StateResponse(
    val groups: List<WordGroup> = emptyList(),
    val savedWords: List<SavedWord> = emptyList(),
    val wordMeta: List<WordMeta> = emptyList(),
    val session: ReviewSession? = null,
    val error: String? = null,
    val reviewFeatures: ReviewFeatures = ReviewFeatures(),
)

data class ReviewFeatures(val version: Int = 0, val priorityWords: Boolean = false, val audioOptional: Boolean = false)

data class StateAction(
    val action: String,
    val name: String? = null,
    val word: String? = null,
    val note: String? = null,
    val groupId: String? = null,
    val sessionId: String? = null,
    val taskId: String? = null,
    val selectedAnswer: String? = null,
    val includeAudio: Boolean? = null,
    val priorityWords: List<String>? = null,
)

data class ApiError(val error: String? = null)

