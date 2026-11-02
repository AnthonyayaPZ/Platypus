package com.anthonyaya.platypus.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.anthonyaya.platypus.data.model.ReviewSession
import com.anthonyaya.platypus.data.model.SavedWord
import com.anthonyaya.platypus.data.model.StateAction
import com.anthonyaya.platypus.data.model.StateResponse
import com.anthonyaya.platypus.data.model.WordEntry
import com.anthonyaya.platypus.data.model.WordGroup
import com.anthonyaya.platypus.data.model.WordMeta
import com.anthonyaya.platypus.data.repository.PlatypusRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class MainTab(val label: String, val symbol: String) {
    Search("查单词", "⌕"),
    Review("今日背诵", "◎"),
    Cards("卡片学习", "◇"),
    Video("视频学词", "▶"),
    Library("我的词库", "▦"),
}

data class PlatypusUiState(
    val tab: MainTab = MainTab.Search,
    val query: String = "",
    val result: WordEntry? = null,
    val resultMeta: WordMeta? = null,
    val groups: List<WordGroup> = emptyList(),
    val savedWords: List<SavedWord> = emptyList(),
    val wordMeta: List<WordMeta> = emptyList(),
    val selectedGroupId: String = "",
    val reviewSession: ReviewSession? = null,
    val reviewFeedbackTaskId: String? = null,
    val initialLoading: Boolean = true,
    val searching: Boolean = false,
    val actionLoading: Boolean = false,
    val message: String? = null,
) {
    val totalSaved: Int get() = savedWords.distinctBy { it.word }.size
    val totalDue: Int get() = groups.sumOf { it.dueCount }
    val selectedWords: List<SavedWord>
        get() = savedWords.filter { it.groupId == selectedGroupId }
}

class PlatypusViewModel(
    private val repository: PlatypusRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(PlatypusUiState())
    val uiState: StateFlow<PlatypusUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun selectTab(tab: MainTab) = _uiState.update { it.copy(tab = tab) }

    fun updateQuery(query: String) = _uiState.update { it.copy(query = query) }

    fun selectGroup(groupId: String) = _uiState.update { it.copy(selectedGroupId = groupId) }

    fun consumeMessage() = _uiState.update { it.copy(message = null) }

    fun showMessage(message: String) = _uiState.update { it.copy(message = message) }

    fun refresh() {
        viewModelScope.launch {
            repository.state()
                .onSuccess(::applyState)
                .onFailure { showError(it) }
            _uiState.update { it.copy(initialLoading = false) }
        }
    }

    fun search() {
        val query = _uiState.value.query.trim().lowercase()
        if (!query.matches(Regex("^[a-z][a-z'-]{0,47}$"))) {
            _uiState.update { it.copy(message = "请输入单个英文单词") }
            return
        }
        if (_uiState.value.searching) return

        viewModelScope.launch {
            _uiState.update { it.copy(searching = true, query = query) }
            repository.search(query)
                .onSuccess { response ->
                    val entry = response.entry
                    if (entry == null) {
                        _uiState.update { it.copy(message = response.error ?: "没有找到这个单词") }
                    } else {
                        _uiState.update {
                            it.copy(
                                query = entry.word,
                                result = entry,
                                resultMeta = response.meta,
                            )
                        }
                    }
                }
                .onFailure(::showError)
            _uiState.update { it.copy(searching = false) }
        }
    }

    fun saveWord(word: String, groupId: String) = act(
        StateAction(action = "saveWord", word = word, groupId = groupId),
        successMessage = "已收藏到词库",
    )

    fun removeWord(word: String, groupId: String) = act(
        StateAction(action = "removeWord", word = word, groupId = groupId),
        successMessage = "已从词库移除",
    )

    fun updateNote(word: String, note: String) = act(
        StateAction(action = "updateNote", word = word, note = note),
        successMessage = "笔记已保存",
    )

    fun createGroup(name: String) {
        val cleanName = name.trim()
        if (cleanName.isEmpty()) {
            _uiState.update { it.copy(message = "请输入词库名称") }
            return
        }
        act(StateAction(action = "createGroup", name = cleanName), "词库已创建")
    }

    fun setDefaultGroup(groupId: String) = act(
        StateAction(action = "setDefaultGroup", groupId = groupId),
        successMessage = "已设为默认词库",
    )

    fun deleteGroup(groupId: String) = act(
        StateAction(action = "deleteGroup", groupId = groupId),
        successMessage = "词库已删除",
    )

    fun beginReview(groupId: String) {
        _uiState.update { it.copy(reviewFeedbackTaskId = null) }
        act(StateAction(action = "beginReview", groupId = groupId))
    }

    fun answerTask(taskId: String, answer: String) {
        val sessionId = _uiState.value.reviewSession?.id ?: return
        if (_uiState.value.actionLoading || _uiState.value.reviewFeedbackTaskId != null) return

        viewModelScope.launch {
            _uiState.update { it.copy(actionLoading = true) }
            repository.act(
                StateAction(
                    action = "answerTask",
                    sessionId = sessionId,
                    taskId = taskId,
                    selectedAnswer = answer,
                ),
            ).onSuccess { response ->
                applyState(response)
                _uiState.update { current ->
                    current.copy(
                        reviewFeedbackTaskId = taskId.takeIf { id ->
                            response.session?.tasks?.any { it.id == id } == true
                        },
                    )
                }
            }.onFailure(::showError)
            _uiState.update { it.copy(actionLoading = false) }
        }
    }

    fun continueReview() = _uiState.update { it.copy(reviewFeedbackTaskId = null) }

    fun cancelReview() {
        val sessionId = _uiState.value.reviewSession?.id ?: return
        act(
            StateAction(action = "cancelReview", sessionId = sessionId),
            successMessage = "本次复习已结束",
        )
    }

    private fun act(action: StateAction, successMessage: String? = null) {
        if (_uiState.value.actionLoading) return
        viewModelScope.launch {
            _uiState.update { it.copy(actionLoading = true) }
            repository.act(action)
                .onSuccess { response ->
                    applyState(response)
                    if (successMessage != null) {
                        _uiState.update { it.copy(message = successMessage) }
                    }
                }
                .onFailure(::showError)
            _uiState.update { it.copy(actionLoading = false) }
        }
    }

    private fun applyState(response: StateResponse) {
        _uiState.update { current ->
            val selectedGroup = current.selectedGroupId
                .takeIf { id -> response.groups.any { it.id == id } }
                ?: response.groups.firstOrNull { it.isDefault == 1 }?.id
                ?: response.groups.firstOrNull()?.id
                .orEmpty()
            current.copy(
                groups = response.groups,
                savedWords = response.savedWords,
                wordMeta = response.wordMeta,
                selectedGroupId = selectedGroup,
                reviewSession = response.session,
                reviewFeedbackTaskId = current.reviewFeedbackTaskId?.takeIf { id ->
                    response.session?.tasks?.any { it.id == id } == true
                },
            )
        }
    }

    private fun showError(error: Throwable) {
        _uiState.update { it.copy(message = error.message ?: "操作失败，请稍后重试") }
    }

    companion object {
        fun factory(repository: PlatypusRepository): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return PlatypusViewModel(repository) as T
                }
            }
    }
}
