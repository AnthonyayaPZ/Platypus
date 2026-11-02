package com.anthonyaya.platypus.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp
import com.anthonyaya.platypus.ui.theme.PlatypusColors

@Composable
fun NoteDialog(
    word: String,
    initialNote: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    var note by remember(word, initialNote) { mutableStateOf(initialNote) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = PlatypusColors.Paper,
        shape = RoundedCornerShape(18.dp),
        title = { Text("$word 的学习笔记") },
        text = {
            OutlinedTextField(
                value = note,
                onValueChange = { if (it.length <= 2000) note = it },
                modifier = Modifier.fillMaxWidth(),
                minLines = 4,
                label = { Text("联想、例句或易错点") },
            )
        },
        confirmButton = {
            TextButton(onClick = { onSave(note); onDismiss() }) { Text("保存") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("取消") }
        },
    )
}
