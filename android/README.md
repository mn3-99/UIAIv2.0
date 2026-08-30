# MijlAi — Native Android App (Kotlin + Jetpack Compose)

This is a **real native Android app** (not a WebView wrapper). It reuses the exact same
backend APIs as the web client and delivers a smooth, 2026-grade native experience with
the same MijlAi interface.

## Features
- **Chat** — streaming responses over SSE (`/api/chat/send` + `/api/chat/stream`),
  model tiers (MijlAi Mini / Flash / Pro / PWR), agentic thinking display, web-search
  enrichment via deep search, skill chips, and native image attachments (sent as data URLs).
- **Image Studio** — pick a model, set aspect ratio, generate images (`/api/image/v2/generate`).
- **Deep Search** — agentic web search with cited references (`/api/search/deep`).
- **Settings** — configure the backend server URL (persisted via `AppPrefs`).
- Native markdown rendering, Material 3, RTL support, dark/light themes.

## Requirements to build
- Android SDK (API 34 platform + build-tools) **or** Android Studio
- JDK 17
- Gradle 8.6 (the wrapper jar is generated automatically by Android Studio / `gradle wrapper`)
- Kotlin 1.9.22, Jetpack Compose Compiler 1.5.10 (pinned in `app/build.gradle`)

## Build
```bash
cd android
./gradlew assembleRelease      # Linux/macOS  (or: gradle assembleRelease)
```
Output: `app/build/outputs/apk/release/app-release.apk`
Sign it for distribution: `apksigner sign --ks <keystore> app/build/outputs/apk/release/app-release-unsigned.apk`

## Configure the server
On first launch the app uses `https://mijlai.duckdns.org` (see
`app/src/main/res/values/strings.xml` → `default_base_url`). Change it in the in-app
**Settings** screen, or edit the string before building. The URL must point at a running
instance of the MijlAi backend (Express `:8082` / FastAPI `:8088` / g4f `:5050`).

## Project layout
```
android/
  build.gradle                      # root (AGP + Kotlin plugins)
  settings.gradle
  gradle.properties
  gradle/wrapper/gradle-wrapper.properties
  app/
    build.gradle                    # Compose, OkHttp, Coil, kotlinx-serialization
    src/main/
      AndroidManifest.xml
      res/                          # strings, colors, themes, adaptive launcher icons
      java/com/mijlai/chat/
        MainActivity.kt             # native shell + bottom navigation
        data/                       # ApiClient, AppPrefs, models
        viewmodel/ChatViewModel.kt
        ui/                         # ChatScreen, ImageStudio, DeepSearch, Settings, Markdown
```

## Version
`versionCode 2` / `versionName 2.0.0`
