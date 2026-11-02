package com.anthonyaya.platypus.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.anthonyaya.platypus.ui.theme.PlatypusColors

val PageHorizontalPadding = 17.dp
val PaperShape = RoundedCornerShape(18.dp)

@Composable
fun PlatypusMark(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier.size(width = 47.dp, height = 36.dp)) {
        withTransform({ rotate(degrees = -5f, pivot = center) }) {
            drawOval(
                color = PlatypusColors.Ink,
                topLeft = Offset(1.dp.toPx(), 3.dp.toPx()),
                size = Size(33.dp.toPx(), 28.dp.toPx()),
            )
            drawOval(
                color = PlatypusColors.Orange,
                topLeft = Offset(27.dp.toPx(), 20.dp.toPx()),
                size = Size(20.dp.toPx(), 11.dp.toPx()),
            )
            drawCircle(
                color = Color.White,
                radius = 2.dp.toPx(),
                center = Offset(24.dp.toPx(), 11.dp.toPx()),
            )
        }
    }
}

@Composable
fun BrandLockup(modifier: Modifier = Modifier, compact: Boolean = true) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        PlatypusMark()
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(
                "鸭嘴兽单词",
                fontSize = if (compact) 16.sp else 19.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
            )
            if (!compact) {
                Text(
                    "PLATYPUS WORDS",
                    style = MaterialTheme.typography.labelSmall,
                    letterSpacing = 1.3.sp,
                    color = PlatypusColors.Muted,
                )
            }
        }
    }
}

@Composable
fun PageHeader(
    eyebrow: String,
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text(
            eyebrow.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = 1.8.sp,
            color = PlatypusColors.OrangeDark,
        )
        Text(title, style = MaterialTheme.typography.headlineLarge)
        Text(
            subtitle,
            style = MaterialTheme.typography.bodyMedium,
            color = PlatypusColors.Muted,
        )
    }
}

@Composable
fun PaperCard(
    modifier: Modifier = Modifier,
    containerColor: Color = PlatypusColors.Paper,
    content: @Composable () -> Unit,
) {
    Card(
        modifier = modifier.border(1.dp, PlatypusColors.Line, PaperShape),
        shape = PaperShape,
        colors = CardDefaults.cardColors(containerColor = containerColor),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
    ) { content() }
}

@Composable
fun InkButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    orange: Boolean = false,
    trailing: String? = null,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(46.dp),
        shape = RoundedCornerShape(10.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (orange) PlatypusColors.Orange else PlatypusColors.Ink,
            contentColor = Color.White,
            disabledContainerColor = PlatypusColors.Ink.copy(alpha = .35f),
        ),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = if (trailing == null) Arrangement.Center else Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text, fontWeight = FontWeight.Bold)
            trailing?.let { Text(it, fontSize = 18.sp) }
        }
    }
}

@Composable
fun TinyPill(
    text: String,
    modifier: Modifier = Modifier,
    background: Color = PlatypusColors.Mint,
    foreground: Color = PlatypusColors.InkSecondary,
) {
    Box(
        modifier = modifier
            .background(background, RoundedCornerShape(20.dp))
            .padding(horizontal = 9.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = MaterialTheme.typography.labelSmall, color = foreground)
    }
}

@Composable
fun SectionHeading(eyebrow: String, title: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(
            eyebrow.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            color = PlatypusColors.OrangeDark,
            fontWeight = FontWeight.ExtraBold,
            letterSpacing = 1.3.sp,
        )
        Text(title, style = MaterialTheme.typography.headlineSmall)
    }
}

@Composable
fun NavItem(
    symbol: String,
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            symbol,
            fontSize = 21.sp,
            color = if (selected) PlatypusColors.Ink else PlatypusColors.NavigationMuted,
        )
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = if (selected) PlatypusColors.Ink else PlatypusColors.NavigationMuted,
        )
    }
}
