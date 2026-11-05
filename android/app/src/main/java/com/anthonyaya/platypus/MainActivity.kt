package com.anthonyaya.platypus

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.anthonyaya.platypus.data.remote.ApiFactory
import com.anthonyaya.platypus.data.repository.NetworkPlatypusRepository
import com.anthonyaya.platypus.ui.PlatypusApp
import com.anthonyaya.platypus.ui.PlatypusViewModel
import com.anthonyaya.platypus.ui.ReviewPracticeStore
import com.anthonyaya.platypus.ui.theme.PlatypusTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val factory = PlatypusViewModel.factory(
            NetworkPlatypusRepository(ApiFactory.api),
            ReviewPracticeStore(applicationContext),
        )

        setContent {
            PlatypusTheme {
                PlatypusApp(viewModelFactory = factory)
            }
        }
    }
}

