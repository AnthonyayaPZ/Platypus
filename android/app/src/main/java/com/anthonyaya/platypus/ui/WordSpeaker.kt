package com.anthonyaya.platypus.ui

import android.content.Context
import android.speech.tts.TextToSpeech
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import java.util.Locale

class WordSpeaker(
    context: Context,
    private val onError: (String) -> Unit,
) {
    private var engine: TextToSpeech? = null
    private var ready = false
    private var failed = false
    private var pendingWord: String? = null

    init {
        engine = TextToSpeech(context.applicationContext) { status ->
            if (status != TextToSpeech.SUCCESS) {
                failed = true
                onError("语音服务初始化失败，请检查系统的文字转语音设置")
                return@TextToSpeech
            }

            val languageResult = engine?.setLanguage(Locale.US) ?: TextToSpeech.LANG_NOT_SUPPORTED
            if (languageResult == TextToSpeech.LANG_MISSING_DATA ||
                languageResult == TextToSpeech.LANG_NOT_SUPPORTED
            ) {
                failed = true
                onError("设备缺少英文语音数据，请在系统文字转语音设置中安装")
                return@TextToSpeech
            }

            engine?.setSpeechRate(0.82f)
            ready = true
            pendingWord?.let(::speakNow)
            pendingWord = null
        }
    }

    fun speak(word: String) {
        val cleanWord = word.trim()
        if (cleanWord.isEmpty()) return

        when {
            failed -> onError("当前设备没有可用的英文语音服务")
            ready -> speakNow(cleanWord)
            else -> pendingWord = cleanWord
        }
    }

    fun shutdown() {
        pendingWord = null
        engine?.stop()
        engine?.shutdown()
        engine = null
        ready = false
    }

    private fun speakNow(word: String) {
        val result = engine?.speak(word, TextToSpeech.QUEUE_FLUSH, null, "word-$word")
        if (result == TextToSpeech.ERROR) {
            onError("单词发音播放失败，请检查系统语音设置")
        }
    }
}

@Composable
fun rememberWordSpeaker(onError: (String) -> Unit): WordSpeaker {
    val context = LocalContext.current
    val latestOnError = rememberUpdatedState(onError)
    val speaker = remember(context) {
        WordSpeaker(context) { message -> latestOnError.value(message) }
    }
    DisposableEffect(speaker) {
        onDispose(speaker::shutdown)
    }
    return speaker
}
