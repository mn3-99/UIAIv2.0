# MijlAI — Android (WebView) App

This folder is a complete, buildable Android project that wraps the deployed MijlAI web
app in a full-screen WebView. It produces the installable `MijlAi.apk`.

## Requirements to build
- Android SDK (API 34 platform + build-tools) **or** Android Studio
- JDK 17
- Gradle 8.6 (the wrapper jar is generated automatically by Android Studio / `gradle wrapper`)

## Configure the app URL
Open `app/src/main/res/values/strings.xml` and set `app_url` to your **production**
web app URL (the place where the Express + FastAPI backend is deployed):

```xml
<string name="app_url">https://your-deployed-mijlai.example.com</string>
```

## Build the APK
```bash
cd android
./gradlew assembleRelease      # Linux/macOS
# or: gradle assembleRelease   # if system gradle is installed
```
The unsigned release APK is written to:
`app/build/outputs/apk/release/app-release.apk`
(For distribution, sign it with your upload key: `apksigner sign --ks ...`).

## What changed in v2.0.0
- Bumped `versionCode`/`versionName` to 2 / 2.0.0.
- Added `MainActivity` WebView shell (JS + DOM storage + permissions granted for
  mic/camera), adaptive launcher icons (XML, no binary PNGs required), and the
  `Theme.MijlAi.NoActionBar` theme.
- The web app itself now shows a top **"Download APK"** banner for Android browsers
  (`src/components/AndroidAppBanner.tsx`), linking to the published APK.
