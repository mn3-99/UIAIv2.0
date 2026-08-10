# MijlAi — Cross-Platform Native App Build Guide (Tauri v2)

MijlAi is wrapped using **Tauri v2** and compiled into lightweight, native desktop and mobile applications for **Windows**, **macOS**, **Linux**, **Android**, and **iOS**.

---

## 🏗️ 1. Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                   MijlAi React Frontend                │
│ (Custom Titlebar, Touch Viewport, Haptics, Local Cache) │
└──────────────────────────┬─────────────────────────────┘
                           │
             Tauri v2 IPC / WebSockets / SSE
                           │
 ┌─────────────────────────┴─────────────────────────────┐
 │               Native Rust Backend Core                │
 │  - Local SQLite Store (rusqlite / sqlx)              │
 │  - Native Haptic Engine & System Tray                 │
 │  - Asynchronous Offline Queue & HTTP Proxy            │
 └─────────────────────────┬─────────────────────────────┘
                           │
               Decoupled Engine Service
     (FastAPI / Express Server at localhost:3000 / 8088)
```

---

## 💻 2. Desktop Builds (Windows, macOS, Linux)

### Prerequisites:
- **Node.js** v18+ & **npm** v9+
- **Rust Toolchain**: Install via [rustup.rs](https://rustup.rs/)
- **Windows**: Visual Studio 2022 C++ Build Tools with "Desktop development with C++"
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget libssl-dev libayatana-appindicator3-dev librsvg2-dev`

### Commands:

```bash
# 1. Install dependencies
npm install

# 2. Run Desktop Dev Mode (Hot-Reload)
npm run tauri:dev

# 3. Build Native Bundles
npm run tauri:build
```

**Output Artifacts (`src-tauri/target/release/bundle/`):**
- **Windows**: `.msi` installer & standalone `.exe`
- **macOS**: `.dmg` installer & `.app` bundle
- **Linux**: `.deb` package & `.AppImage`

---

## 📱 3. Mobile Builds (Android & iOS)

### A. Android (APK & AAB)

#### Prerequisites:
- **Android Studio** & **Android SDK** (API 24+)
- **NDK** & **CMake** installed via Android SDK Manager
- Set environment variables:
  ```bash
  export ANDROID_HOME=$HOME/Android/Sdk
  export NDK_HOME=$ANDROID_HOME/ndk/25.2.9519653
  ```

#### Commands:

```bash
# Initialize Android project
npx tauri android init

# Build Debug / Release APK
npm run tauri:android
```

- **Output APK**: `src-tauri/gen/android/app/build/outputs/apk/release/app-release.apk`
- **Output AAB (Google Play)**: `src-tauri/gen/android/app/build/outputs/bundle/release/app-release.aab`

---

### B. iOS (IPA)

#### Prerequisites:
- **macOS** with **Xcode 15+**
- Apple Developer Account (for device signing)
- CocoaPods (`sudo gem install cocoapods`)

#### Commands:

```bash
# Initialize iOS project
npx tauri ios init

# Build iOS App / IPA
npm run tauri:ios
```

---

## ⚡ 4. Native Performance & Optimizations

1. **Zero-Latency Response Stream**: SSE tokens resume seamlessly using byte offsets (`?offset=0`) even when switching tabs or experiencing brief network drops.
2. **Local SQLite Persistence**: Messages are saved locally in SQLite (`mijlai_native_chat.db`) instantly before background server synchronization.
3. **Subtle Haptics**: Integrated `triggerHaptic()` on touch devices during message dispatch and stream completion.
4. **Mobile Soft Keyboard Adjustments**: Dynamically adapts layout using `window.visualViewport` to prevent input overlay bugs.

---

## 📜 Copyright & License

Developed for **MijlAi** — Cross-Platform AI Assistant.
© 2026 Mhmod Nemr Alijla.
