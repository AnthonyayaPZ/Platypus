package com.anthonyaya.platypus.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.anthonyaya.platypus.data.model.ReviewSession
import com.anthonyaya.platypus.data.model.ReviewFeatures
import com.anthonyaya.platypus.data.model.SavedWord
import com.anthonyaya.platypus.data.model.StateAction
import com.anthonyaya.platypus.data.model.StateResponse
import com.anthonyaya.platypus.data.model.WordEntry
import com.anthonyaya.platypus.data.model.WordGroup
import com.anthonyaya.platypus.data.model.WordMeta
import com.anthonyaya.platypus.data.model.normalizeDictionaryTerm
import com.anthonyaya.platypus.data.model.defaultSearchGroup
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
    val searchTargetGroupId: String = "",
    val reviewSession: ReviewSession? = null,
    val reviewFeedbackTaskId: String? = null,
    val initialLoading: Boolean = true,
    val searching: Boolean = false,
    val actionLoading: Boolean = false,
    val message: String? = null,
    val priorityWords: List<String> = emptyList(),
    val skipAudioThisRound: Boolean = false,
    val reviewFeatures: ReviewFeatures = ReviewFeatures(),
) {
    val totalSaved: Int get() = savedWords.distinctBy { it.word }.size
    val totalDue: Int get() = groups.sumOf { it.dueCount }
    val selectedWords: List<SavedWord>
        get() = savedWords.filter { it.groupId == selectedGroupId }
    val searchGroupId: String get() = searchTargetGroupId.takeIf { id -> groups.any { it.id == id } }
        ?: defaultSearchGroup(groups, result?.word.orEmpty(), selectedGroupId)
}

class PlatypusViewModel(
    private val repository: PlatypusRepository,
    private val practiceStore: PracticeQueuePersistence? = null,
) : ViewModel() {
    private val _uiState = MutableStateFlow(PlatypusUiState(priorityWords = practiceStore?.load().orEmpty()))
    val uiState: StateFlow<PlatypusUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun selectTab(tab: MainTab) = _uiState.update { it.copy(tab = tab) }

    fun updateQuery(query: String) = _uiState.update { it.copy(query = query) }

    fun selectGroup(groupId: String) = _uiState.update { it.copy(selectedGroupId = groupId) }
    fun selectSearchGroup(groupId: String) = _uiState.update { it.copy(searchTargetGroupId = groupId) }

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
        val query = normalizeDictionaryTerm(_uiState.value.query)
        if (query == null) {
            _uiState.update { it.copy(message = "请输入英文单词或短语（最多8个词、96个字符）；批量单词请用批量导入") }
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
                                searchTargetGroupId = "",
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

    fun togglePractice(word: String) {
        val current = _uiState.value
        if (current.savedWords.none { it.word == word }) { showMessage("请先将该单词收藏到词库"); return }
        val removing = word in current.priorityWords
        if (!removing && current.priorityWords.size >= 200) { showMessage("优先练习队列已满，请先完成部分练习"); return }
        val words = if (removing) current.priorityWords - word else current.priorityWords + word
        practiceStore?.save(words)
        _uiState.update { it.copy(priorityWords = words, message = if (removing) "已取消优先练习" else "已加入练习，下一轮在所属词库中优先安排") }
    }

    fun setSkipAudio(skip: Boolean) {
        val current = _uiState.value
        if (current.actionLoading || current.reviewFeedbackTaskId != null) return
        if (current.reviewSession?.status == "active") {
            if (!skip) { showMessage("本轮已关闭听力，下一轮可重新选择"); return }
            requestReview(current.reviewSession.groupId.ifBlank { current.selectedGroupId }, true)
        } else _uiState.update { it.copy(skipAudioThisRound = skip) }
    }

    fun beginReview(groupId: String) = requestReview(groupId, _uiState.value.skipAudioThisRound)

    private fun requestReview(groupId: String, skipAudio: Boolean) {
        val current = _uiState.value
        if (current.actionLoading) return
        val groupWords = current.savedWords.filter { it.groupId == groupId }.map { it.word }.toSet()
        val priority = current.priorityWords.filter { it in groupWords }
        if ((skipAudio || priority.isNotEmpty()) && (current.reviewFeatures.version < 1 ||
            skipAudio && !current.reviewFeatures.audioOptional || priority.isNotEmpty() && !current.reviewFeatures.priorityWords)) {
            showMessage("服务器尚未支持新的练习选项，请先更新服务端；本次不会启动听力练习")
            return
        }
        _uiState.update { it.copy(actionLoading = true, reviewFeedbackTaskId = null) }
        viewModelScope.launch {
            repository.act(StateAction(action = "beginReview", groupId = groupId, includeAudio = !skipAudio, priorityWords = priority))
                .onSuccess { response ->
                    if (skipAudio && response.session?.tasks?.any { it.questionType == "audio-word" && it.selectedAnswer == null } == true) {
                        showMessage("服务器没有应用无听力选项，请更新服务端后重试")
                    } else {
                        applyState(response)
                        _uiState.update { it.copy(skipAudioThisRound = skipAudio,
                            message = if (response.session == null) "当前词库没有待复习或优先练习的单词" else it.message) }
                    }
                }.onFailure(::showError)
            _uiState.update { it.copy(actionLoading = false) }
        }
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
            afterSuccess = { _uiState.update { it.copy(skipAudioThisRound = false) } },
        )
    }

    private fun act(action: StateAction, successMessage: String? = null, afterSuccess: () -> Unit = {}) {
        if (_uiState.value.actionLoading) return
        viewModelScope.launch {
            _uiState.update { it.copy(actionLoading = true) }
            repository.act(action)
                .onSuccess { response ->
                    applyState(response)
                    afterSuccess()
                    if (successMessage != null) {
                        _uiState.update { it.copy(message = successMessage) }
                    }
                }
                .onFailure(::showError)
            _uiState.update { it.copy(actionLoading = false) }
        }
    }

    private fun applyState(response: StateResponse) {
        val remaining = remainingPracticeWords(_uiState.value.priorityWords, response.savedWords, response.session)
        practiceStore?.save(remaining)
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
                reviewFeatures = response.reviewFeatures,
                priorityWords = remaining,
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
        fun factory(repository: PlatypusRepository, practiceStore: PracticeQueuePersistence? = null): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return PlatypusViewModel(repository, practiceStore) as T
                }
            }
    }
}
