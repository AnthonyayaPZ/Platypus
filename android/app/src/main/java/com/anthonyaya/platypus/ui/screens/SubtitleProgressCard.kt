package com.anthonyaya.platypus.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.anthonyaya.platypus.ui.theme.PlatypusColors
import com.anthonyaya.platypus.ui.videostudy.SubtitleProgress

@Composable
fun SubtitleProgressCard(progress: SubtitleProgress, uploadPercent: Int? = null) {
    val percent = uploadPercent ?: progress.percent
    val uploading = uploadPercent != null
    val label = if (uploading) { if (uploadPercent == 100) "上传已发送，等待服务器校验" else "正在上传字幕文件" } else progress.label
    Surface(color = PlatypusColors.SoftGreen, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().testTag("subtitle-progress")) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(label, Modifier.weight(1f), style = MaterialTheme.typography.labelLarge)
                if (percent != null) Text("$percent%", style = MaterialTheme.typography.labelLarge)
            }
            if (uploading || progress.stage != "failed") {
                if (percent == null) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                else LinearProgressIndicator(progress = { percent / 100f }, modifier = Modifier.fillMaxWidth())
            }
            if (!uploading && progress.stage in listOf("translating", "ready", "partial")) Text(
                "已处理 ${progress.processed} / ${progress.total} 段 · 成功 ${progress.succeeded} · 失败 ${progress.failed}", style = MaterialTheme.typography.bodySmall)
            if (!uploading && progress.stage !in listOf("ready", "partial", "failed")) Text("可以先阅读；离开页面后后台仍会继续处理。", style = MaterialTheme.typography.bodySmall, color = PlatypusColors.Muted)
            if (!uploading && progress.stage == "partial") Text("英文已保留，可重试未完成的翻译。", style = MaterialTheme.typography.bodySmall)
        }
    }
}
