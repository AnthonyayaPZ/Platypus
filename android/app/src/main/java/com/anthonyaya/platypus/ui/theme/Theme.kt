package com.anthonyaya.platypus.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

object PlatypusColors {
    val Ink = Color(0xFF17352F)
    val InkSecondary = Color(0xFF315149)
    val Cream = Color(0xFFF6F3EA)
    val Paper = Color(0xFFFFFDF8)
    val Header = Color(0xFFFBFAF5)
    val Orange = Color(0xFFF28C52)
    val OrangeDark = Color(0xFFD96F35)
    val Mint = Color(0xFFDFEEE5)
    val Peach = Color(0xFFF9E1D3)
    val Line = Color(0xFFDEDDD4)
    val Muted = Color(0xFF7B8983)
    val SoftGreen = Color(0xFFF0F2EB)
    val NavigationMuted = Color(0xFF83908B)
}

private val LightColors = lightColorScheme(
    primary = PlatypusColors.Ink,
    onPrimary = Color.White,
    primaryContainer = PlatypusColors.Mint,
    onPrimaryContainer = PlatypusColors.Ink,
    secondary = PlatypusColors.Orange,
    onSecondary = Color.White,
    secondaryContainer = PlatypusColors.Peach,
    onSecondaryContainer = PlatypusColors.Ink,
    background = PlatypusColors.Cream,
    onBackground = PlatypusColors.Ink,
    surface = PlatypusColors.Paper,
    onSurface = PlatypusColors.Ink,
    surfaceVariant = PlatypusColors.SoftGreen,
    onSurfaceVariant = PlatypusColors.Muted,
    outline = PlatypusColors.Line,
    error = Color(0xFFA94F42),
)

private val PlatypusTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = FontFamily.Serif,
        fontSize = 52.sp,
        lineHeight = 58.sp,
        fontWeight = FontWeight.Normal,
        letterSpacing = (-1.5).sp,
    ),
    displayMedium = TextStyle(
        fontFamily = FontFamily.Serif,
        fontSize = 42.sp,
        lineHeight = 48.sp,
        fontWeight = FontWeight.Normal,
        letterSpacing = (-1).sp,
    ),
    headlineLarge = TextStyle(
        fontFamily = FontFamily.Serif,
        fontSize = 34.sp,
        lineHeight = 42.sp,
        fontWeight = FontWeight.Normal,
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.Serif,
        fontSize = 28.sp,
        lineHeight = 35.sp,
        fontWeight = FontWeight.Normal,
    ),
    headlineSmall = TextStyle(
        fontFamily = FontFamily.Serif,
        fontSize = 24.sp,
        lineHeight = 31.sp,
        fontWeight = FontWeight.Normal,
    ),
    titleLarge = TextStyle(fontSize = 19.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 16.sp, lineHeight = 23.sp, fontWeight = FontWeight.SemiBold),
    titleSmall = TextStyle(fontSize = 13.sp, lineHeight = 19.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 15.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontSize = 13.sp, lineHeight = 21.sp),
    bodySmall = TextStyle(fontSize = 11.sp, lineHeight = 17.sp),
    labelLarge = TextStyle(fontSize = 13.sp, lineHeight = 18.sp, fontWeight = FontWeight.Bold),
    labelMedium = TextStyle(fontSize = 11.sp, lineHeight = 16.sp, fontWeight = FontWeight.SemiBold),
    labelSmall = TextStyle(fontSize = 9.sp, lineHeight = 13.sp, fontWeight = FontWeight.Medium),
)

@Composable
fun PlatypusTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColors,
        typography = PlatypusTypography,
        content = content,
    )
}

