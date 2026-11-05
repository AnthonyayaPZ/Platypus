package com.anthonyaya.platypus.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.anthonyaya.platypus.ui.theme.PlatypusColors
import com.anthonyaya.platypus.ui.videostudy.*
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch

/** Key this composable by document ID: disposed readers always save to their own article. */
@Composable
fun VideoReadingList(
    document: VideoStudyDocument?, selectedOnly: Boolean, selected: Set<String>,
    onSelectedOnlyChange: (Boolean) -> Unit, busy: Boolean,
    header: @Composable () -> Unit, translationToggle: @Composable () -> Unit,
    loading: @Composable () -> Unit, error: @Composable () -> Unit,
    sentence: @Composable (SubtitleSentence) -> Unit,
) {
    val context = LocalContext.current
    val store = remember(context) { VideoReadingPositionStore(context.applicationContext) }
    val density = LocalDensity.current.density
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    // A new reading visit offers a choice, rather than silently restoring a saved LazyListState.
    val list = remember { LazyListState() }
    val scope = rememberCoroutineScope()
    var offered by remember { mutableStateOf(document?.id?.let(store::load)?.takeIf { it.beyondBeginning }) }
    var adjusting by remember { mutableStateOf(false) }
    var initialized by remember { mutableStateOf(false) }
    var beforeFilter by remember { mutableStateOf<VideoReadingPosition?>(null) }
    var filterWasAtTop by remember { mutableStateOf(false) }
    var wasFiltered by remember { mutableStateOf(selectedOnly) }
    val currentDocument by rememberUpdatedState(document)
    val currentFilter by rememberUpdatedState(selectedOnly)
    val visible = document?.sentences.orEmpty().filter { !selectedOnly || tokenizeSubtitle(it.english).any { token -> token.word in selected } }
    val destination = document?.let { article -> offered?.let { resolveReadingPosition(article, it) } }

    fun viewport(): Pair<Int, Float>? {
        val article = currentDocument ?: return null
        // visibleItemsInfo also includes the previous card's tail inside content
        // padding. Use LazyListState's authoritative first content item instead.
        val item = list.layoutInfo.visibleItemsInfo.firstOrNull { it.index >= list.firstVisibleItemIndex &&
            (it.key as? String)?.startsWith("sentence:") == true } ?: return null
        val id = (item.key as String).removePrefix("sentence:")
        val index = article.sentences.indexOfFirst { it.id == id }
        val offset = if (item.index == list.firstVisibleItemIndex) list.firstVisibleItemScrollOffset / density else 0f
        return if (index >= 0) index to offset else null
    }
    fun saveNow() {
        if (!initialized || adjusting || currentFilter || offered != null || list.firstVisibleItemIndex == 0) return
        val article = currentDocument ?: return
        val anchor = viewport() ?: return
        readingPosition(article, anchor.first, anchor.second)?.let(store::save)
    }
    val saveCurrent by rememberUpdatedState(::saveNow)
    LaunchedEffect(Unit) { list.scrollToItem(0); initialized = true }
    LaunchedEffect(Unit) {
        snapshotFlow { if (initialized && !adjusting && !currentFilter && !list.isScrollInProgress && list.firstVisibleItemIndex > 0) viewport() else null }
            .distinctUntilChanged().collect { anchor ->
                if (anchor != null) {
                    // The initial top-of-page layout must not erase a previous bookmark.
                    // Deliberately scrolling into later sentences counts as starting a new visit.
                    if (offered != null && anchor.first == 0) return@collect
                    if (offered != null) offered = null
                    val article = currentDocument ?: return@collect
                    readingPosition(article, anchor.first, anchor.second)?.let(store::save)
                }
            }
    }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_PAUSE || event == Lifecycle.Event.ON_STOP) saveCurrent() }
        lifecycle.addObserver(observer)
        onDispose { saveCurrent(); lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(selectedOnly) {
        if (wasFiltered && !selectedOnly) {
            adjusting = true
            try {
                withFrameNanos { }
                val target = document?.let { article -> beforeFilter?.let { resolveReadingPosition(article, it) } }
                if (filterWasAtTop || target == null) list.scrollToItem(0)
                else list.scrollToItem(readingSentenceItemIndex(document, target.sentenceIndex), (target.offsetDp * density).toInt())
                withFrameNanos { }
            } finally { adjusting = false }
        }
        wasFiltered = selectedOnly
    }
    LazyColumn(Modifier.fillMaxSize().testTag("video-reader"), state = list,
        contentPadding = PaddingValues(start = 17.dp, end = 17.dp, top = 12.dp, bottom = 150.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item(key = "reader-header") {
            header()
            // Keep the existing toggle in the header, but save before entering the filtered view.
            Row(Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text("${document?.sentences?.size ?: 0} 句", Modifier.weight(1f), color = PlatypusColors.Muted, style = MaterialTheme.typography.labelSmall)
                translationToggle()
                ToggleLabel("只看已选", selectedOnly) { next ->
                    if (next) {
                        filterWasAtTop = list.firstVisibleItemIndex == 0
                        beforeFilter = document?.let { article -> viewport()?.let { readingPosition(article, it.first, it.second) } }
                        saveNow()
                    }
                    onSelectedOnlyChange(next)
                }
            }
            if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            if (offered != null && destination != null && !selectedOnly) ReadingResumeCard(destination, offered!!.time,
                onStart = {
                    adjusting = true
                    offered = null
                    store.clear(document.id)
                    scope.launch { try { list.scrollToItem(0) } finally { adjusting = false; saveNow() } }
                },
                onContinue = {
                    if (!adjusting) {
                        adjusting = true
                        scope.launch {
                            try {
                                val article = currentDocument ?: return@launch
                                val target = offered?.let { resolveReadingPosition(article, it) } ?: return@launch
                                offered = null
                                list.scrollToItem(readingSentenceItemIndex(article, target.sentenceIndex), (target.offsetDp * density).toInt())
                                withFrameNanos { }
                            } finally { adjusting = false; saveNow() }
                        }
                    }
                })
        }
        if (document?.status in listOf("queued", "fetching", "translating")) item(key = "reader-progress") { loading() }
        if (!document?.error.isNullOrBlank()) item(key = "reader-error") { error() }
        items(visible, key = { "sentence:${it.id}" }, contentType = { "sentence" }) { item ->
            Box(Modifier.testTag("reader-sentence-${item.id}")) { sentence(item) }
        }
        if (visible.isEmpty()) item(key = "reader-empty") { Text(if (selectedOnly) "没有已选单词的句子。" else "点击右下角查找文章，或从学习记录中打开。", color = PlatypusColors.Muted, style = MaterialTheme.typography.bodySmall) }
    }
}

@Composable
private fun ReadingResumeCard(position: ResolvedReadingPosition, time: String, onStart: () -> Unit, onContinue: () -> Unit) {
    Surface(Modifier.fillMaxWidth().padding(top = 8.dp).testTag("video-resume-card"), shape = MaterialTheme.shapes.medium,
        color = PlatypusColors.SoftGreen, border = BorderStroke(1.dp, PlatypusColors.Line)) {
        Row(Modifier.padding(start = 12.dp, end = 4.dp, top = 5.dp, bottom = 5.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("上次读到${if (position.approximate) "约" else ""}第 ${position.sentenceIndex + 1} 句", style = MaterialTheme.typography.titleSmall)
                if (time.isNotBlank()) Text(time, style = MaterialTheme.typography.labelSmall, color = PlatypusColors.Muted)
            }
            TextButton(onClick = onStart, contentPadding = PaddingValues(horizontal = 7.dp), modifier = Modifier.testTag("video-read-from-start")) { Text("从头读", style = MaterialTheme.typography.labelMedium, color = PlatypusColors.Muted) }
            TextButton(onClick = onContinue, contentPadding = PaddingValues(horizontal = 9.dp), modifier = Modifier.testTag("video-resume-reading")) { Text("继续", style = MaterialTheme.typography.labelLarge) }
        }
    }
}

@Preview(name = "继续上次阅读 · 小卡片", widthDp = 390, heightDp = 100, showBackground = true)
@Composable
private fun ReadingResumePreview() {
    com.anthonyaya.platypus.ui.theme.PlatypusTheme {
        Box(Modifier.padding(17.dp)) { ReadingResumeCard(ResolvedReadingPosition(22, 0f), "03:12", {}, {}) }
    }
}
