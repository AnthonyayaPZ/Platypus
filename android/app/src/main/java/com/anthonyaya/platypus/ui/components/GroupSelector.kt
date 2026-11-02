package com.anthonyaya.platypus.ui.components

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.anthonyaya.platypus.data.model.WordGroup
import com.anthonyaya.platypus.ui.theme.PlatypusColors

@Composable
fun GroupSelector(
    groups: List<WordGroup>,
    selectedGroupId: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyRow(
        modifier = modifier,
        contentPadding = PaddingValues(horizontal = 1.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(groups, key = { it.id }) { group ->
            val selected = group.id == selectedGroupId
            Surface(
                color = if (selected) PlatypusColors.Mint else PlatypusColors.Paper,
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier
                    .border(
                        width = 1.dp,
                        color = if (selected) PlatypusColors.Ink else PlatypusColors.Line,
                        shape = RoundedCornerShape(10.dp),
                    )
                    .clickable { onSelect(group.id) },
            ) {
                Text(
                    "${group.name} · ${group.wordCount}",
                    style = MaterialTheme.typography.labelMedium,
                    color = if (selected) PlatypusColors.Ink else PlatypusColors.Muted,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                )
            }
        }
    }
}

@Composable
fun GroupDropdown(
    groups: List<WordGroup>,
    selectedGroupId: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    val selected = groups.firstOrNull { it.id == selectedGroupId }

    Box(modifier = modifier) {
        Surface(
            color = PlatypusColors.Paper,
            shape = RoundedCornerShape(9.dp),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, PlatypusColors.Line, RoundedCornerShape(9.dp))
                .clickable(enabled = groups.isNotEmpty()) { expanded = true },
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    selected?.name ?: "选择词库",
                    style = MaterialTheme.typography.labelMedium,
                    color = PlatypusColors.InkSecondary,
                )
                Text("⌄", color = PlatypusColors.Muted)
            }
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            containerColor = PlatypusColors.Paper,
        ) {
            groups.forEach { group ->
                DropdownMenuItem(
                    text = { Text("${group.name} · ${group.wordCount} 词") },
                    onClick = {
                        onSelect(group.id)
                        expanded = false
                    },
                )
            }
        }
    }
}

