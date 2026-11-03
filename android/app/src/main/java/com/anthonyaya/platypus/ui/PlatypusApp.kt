package com.anthonyaya.platypus.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.anthonyaya.platypus.ui.components.BrandLockup
import com.anthonyaya.platypus.ui.components.NavItem
import com.anthonyaya.platypus.ui.components.PlatypusMark
import com.anthonyaya.platypus.ui.components.TinyPill
import com.anthonyaya.platypus.ui.screens.CardsScreen
import com.anthonyaya.platypus.ui.screens.LibraryScreen
import com.anthonyaya.platypus.ui.screens.ReviewScreen
import com.anthonyaya.platypus.ui.screens.SearchScreen
import com.anthonyaya.platypus.ui.screens.VideoStudyScreen
import com.anthonyaya.platypus.ui.theme.PlatypusColors

@Composable
fun PlatypusApp(
    viewModelFactory: ViewModelProvider.Factory,
    viewModel: PlatypusViewModel = viewModel(factory = viewModelFactory),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }
    val wordSpeaker = rememberWordSpeaker(viewModel::showMessage)

    LaunchedEffect(state.message) {
        state.message?.let { message ->
            snackbarHostState.showSnackbar(message)
            viewModel.consumeMessage()
        }
    }

    Scaffold(
        containerColor = PlatypusColors.Cream,
        snackbarHost = {
            SnackbarHost(
                hostState = snackbarHostState,
                modifier = Modifier.navigationBarsPadding(),
            ) { data ->
                Surface(
                    color = PlatypusColors.Ink,
                    contentColor = Color.White,
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(30.dp),
                    shadowElevation = 8.dp,
                    modifier = Modifier.padding(horizontal = 18.dp, vertical = 8.dp),
                ) {
                    Text(data.visuals.message, modifier = Modifier.padding(horizontal = 17.dp, vertical = 11.dp))
                }
            }
        },
        topBar = {
            if (state.tab != MainTab.Video) MobileHeader(
                due = state.totalDue,
                onBrandClick = { viewModel.selectTab(MainTab.Search) },
            )
        },
        bottomBar = {
            MobileNavigation(
                selected = state.tab,
                onSelect = viewModel::selectTab,
            )
        },
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            if (state.tab == MainTab.Video) {
                VideoStudyScreen(groups = state.groups, onImported = viewModel::refresh)
            } else if (state.initialLoading) {
                LoadingState()
            } else {
                when (state.tab) {
                    MainTab.Search -> SearchScreen(
                        state = state,
                        onQueryChange = viewModel::updateQuery,
                        onSearch = viewModel::search,
                        onSelectGroup = viewModel::selectGroup,
                        onSave = viewModel::saveWord,
                        onRemove = viewModel::removeWord,
                        onSaveNote = viewModel::updateNote,
                        onOpenReview = { viewModel.selectTab(MainTab.Review) },
                        onSpeak = wordSpeaker::speak,
                        onImported = viewModel::refresh,
                    )
                    MainTab.Review -> ReviewScreen(
                        state = state,
                        onSelectGroup = viewModel::selectGroup,
                        onStart = viewModel::beginReview,
                        onAnswer = viewModel::answerTask,
                        onContinue = viewModel::continueReview,
                        onCancel = viewModel::cancelReview,
                        onSpeak = wordSpeaker::speak,
                    )
                    MainTab.Cards -> CardsScreen(
                        state = state,
                        onSelectGroup = viewModel::selectGroup,
                    )
                    MainTab.Video -> VideoStudyScreen(groups = state.groups, onImported = viewModel::refresh)
                    MainTab.Library -> LibraryScreen(
                        state = state,
                        onSelectGroup = viewModel::selectGroup,
                        onCreateGroup = viewModel::createGroup,
                        onSetDefault = viewModel::setDefaultGroup,
                        onDeleteGroup = viewModel::deleteGroup,
                        onRemove = viewModel::removeWord,
                        onSaveNote = viewModel::updateNote,
                        onSpeak = wordSpeaker::speak,
                    )
                }
            }
        }
    }
}

@Composable
private fun MobileHeader(due: Int, onBrandClick: () -> Unit) {
    Surface(
        color = PlatypusColors.Header,
        modifier = Modifier
            .fillMaxWidth()
            .drawBehind {
                drawLine(
                    color = PlatypusColors.Line,
                    start = androidx.compose.ui.geometry.Offset(0f, size.height - 1f),
                    end = androidx.compose.ui.geometry.Offset(size.width, size.height - 1f),
                    strokeWidth = 1f,
                )
            },
    ) {
        Row(
            modifier = Modifier
                .statusBarsPadding()
                .height(67.dp)
                .fillMaxWidth()
                .padding(horizontal = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            BrandLockup(
                modifier = Modifier.clickable(onClick = onBrandClick),
            )
            TinyPill(
                text = "今日 $due 词",
                background = Color(0xFFF7EADB),
                foreground = PlatypusColors.InkSecondary,
            )
        }
    }
}

@Composable
private fun MobileNavigation(selected: MainTab, onSelect: (MainTab) -> Unit) {
    Surface(
        color = PlatypusColors.Paper.copy(alpha = .98f),
        modifier = Modifier
            .fillMaxWidth()
            .drawBehind {
                drawLine(
                    color = PlatypusColors.Line,
                    start = androidx.compose.ui.geometry.Offset(0f, 0f),
                    end = androidx.compose.ui.geometry.Offset(size.width, 0f),
                    strokeWidth = 1f,
                )
            },
    ) {
        Row(
            modifier = Modifier
                .navigationBarsPadding()
                .height(67.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MainTab.entries.forEach { tab ->
                NavItem(
                    symbol = tab.symbol,
                    label = when (tab) {
                        MainTab.Review -> "背诵"
                        else -> tab.label
                    },
                    selected = selected == tab,
                    onClick = { onSelect(tab) },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun LoadingState() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(PlatypusColors.Cream),
        contentAlignment = Alignment.Center,
    ) {
        androidx.compose.foundation.layout.Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            PlatypusMark()
            Text(
                "正在整理今天的单词…",
                color = PlatypusColors.Muted,
                style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
            )
        }
    }
}
