plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.compose.compiler)
}

val apiBaseUrl = providers.gradleProperty("PLATYPUS_API_BASE_URL")
    .orElse("http://139.224.55.132:3000/")
    .map { value -> if (value.endsWith('/')) value else "$value/" }

android {
    namespace = "com.anthonyaya.platypus"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "com.anthonyaya.platypus"
        minSdk = 26
        targetSdk = 36
        versionCode = 4
        versionName = "0.3.0"

        buildConfigField(
            "String",
            "API_BASE_URL",
            apiBaseUrl.map { "\"${it.replace("\"", "\\\"")}\"" }.get(),
        )
        manifestPlaceholders["usesCleartextTraffic"] = "true"
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // The current production API is served over HTTP at 139.224.55.132.
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    // Reuse the exact same demo subtitles as Web. The override is useful for isolated builds.
    sourceSets.getByName("main").assets.srcDir(
        providers.gradleProperty("PLATYPUS_DEMO_ASSETS_DIR").orElse("../../shared").get(),
    )
    sourceSets.getByName("main").assets.srcDir(
        providers.gradleProperty("PLATYPUS_WORDLIST_ASSETS_DIR").orElse("../../public/wordlists").get(),
    )

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.viewmodel.ktx)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.retrofit.core)
    implementation(libs.retrofit.gson)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
