# Bowls Trainer — Release Workflow

This document is your step-by-step guide for publishing updates to **Web**, **iOS**, and **Android** after today.

**How the app works:** Bowls Trainer is a live web app. Both the iOS and Android builds are Capacitor shells that load the production URL. This means **most UI and feature changes deploy to web first, and mobile apps pick them up automatically** — no new app store build required.

You only need a new native build when you:
- Change `capacitor.config.ts` (bundle ID, app name, allowed domains, splash colour, version)
- Add or remove a Capacitor native plugin
- Change app icons or splash screen assets
- Need to bump the build/version number for store compliance

---

## Platform Overview

| Platform | What users see | How updates work |
|----------|---------------|------------------|
| **Web** | `bowlstrainer.com` (via Lovable) | Publish button in Lovable → live in ~1 minute |
| **iOS** | TestFlight / App Store | Web UI updates automatically; native build only when config/plugins change |
| **Android** | Google Play (Internal / Beta / Production) | Web UI updates automatically; native build only when config/plugins change |

---

## 1. Web Releases

**Prerequisite:** Your domain `bowlstrainer.com` should be connected in Lovable Project Settings → Domains.

### Every web update

1. Make changes in the Lovable editor (or push via Git).
2. Click **Publish** (top right).
3. In the publish dialog, click **Update** to deploy frontend changes.
4. The production URL (`https://bowlmate-progress-tracker.lovable.app`) updates immediately.
5. If your custom domain is connected, it updates at the same time.

> **Backend changes** (database migrations, RLS policies, edge functions) deploy automatically when saved — no "Update" button needed.

---

## 2. iOS Releases (TestFlight → App Store)

**Prerequisite:** Mac with Xcode 15+, paid Apple Developer account.

### First-time setup (do once)

Run these on your Mac inside the project folder:

```bash
# 1. Clone the repo
git clone <your-repo-url> bowls-trainer
cd bowls-trainer
bun install

# 2. Generate the iOS native project
bunx cap add ios
bunx cap sync ios

# 3. Open in Xcode
bunx cap open ios
```

In Xcode, configure the **App** target:

| Tab | Field | Value |
|-----|-------|-------|
| General | Display Name | `Bowls Trainer` |
| General | Bundle Identifier | `com.bowlstrainer.app` |
| General | Version | `0.9` |
| General | Build | `1` |
| Signing & Capabilities | Team | Your Apple Developer Team |
| Signing & Capabilities | Automatically manage signing | ✅ On |

Add your app icon (1024×1024 PNG) to `ios/App/App/Assets.xcassets/AppIcon.appiconset/`.

Register the app in [App Store Connect](https://appstoreconnect.apple.com) → My Apps → `+` → iOS → Bundle ID `com.bowlstrainer.app`.

### Normal web-only update (no Xcode needed)

If you only changed UI, features, or backend logic in Lovable:

1. Publish in Lovable (Web step above).
2. Done. iOS users get the new version the next time they open the app.

### Native iOS update (Xcode required)

If you changed `capacitor.config.ts`, added a plugin, changed icons, or need to bump the version:

```bash
# Run from the project root on your Mac
bunx cap sync ios
bunx cap open ios
```

Then in Xcode:

1. If needed, bump **Build** number (e.g. `1` → `2`). Keep or bump **Version** if releasing a new milestone.
2. Top bar → target → **Any iOS Device (arm64)**.
3. **Product → Archive**.
4. Organizer window opens → **Distribute App → App Store Connect → Upload**.
5. Keep default signing → **Upload**.

TestFlight processing takes 5–30 minutes. Add testers in App Store Connect → TestFlight.

---

## 3. Android Releases (Google Play)

**Prerequisite:** Android Studio, a Google Play Developer account.

### First-time setup (do once)

The Android project is already generated in the repo (`android/` folder). On your Mac or any machine with Android Studio:

```bash
# From the project root
bunx cap sync android
```

Open `android/` in **Android Studio**.

Check the app identity is correct:

| File | Setting | Value |
|------|---------|-------|
| `android/app/build.gradle` | `applicationId` | `com.bowlstrainer.app` |
| `android/app/build.gradle` | `versionName` | `0.9` |
| `android/app/build.gradle` | `versionCode` | `1` |
| `android/app/src/main/res/values/strings.xml` | `app_name` | `Bowls Trainer` |

**Create a signing keystore** (do once — keep this file safe and backed up):

In Android Studio: **Build → Generate Signed Bundle / APK → Create new...**

- Key store path: `~/bowls-trainer-keystore.jks`
- Password: choose a strong password and save it
- Key alias: `bowlstrainer`
- Validity: 25 years

Then in `android/app/build.gradle`, inside the `android { }` block, add:

```gradle
signingConfigs {
    release {
        storeFile file("~/bowls-trainer-keystore.jks")
        storePassword "YOUR_KEYSTORE_PASSWORD"
        keyAlias "bowlstrainer"
        keyPassword "YOUR_KEY_PASSWORD"
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
    }
}
```

> **Security tip:** Do not commit passwords to Git. In a team, use environment variables or a `local.properties` file excluded from Git.

Create the app in [Google Play Console](https://play.google.com/console) → Create app → Name: **Bowls Trainer**.

### Normal web-only update (no Android Studio needed)

If you only changed UI, features, or backend logic in Lovable:

1. Publish in Lovable (Web step above).
2. Done. Android users get the new version the next time they open the app.

### Native Android update (Android Studio required)

If you changed `capacitor.config.ts`, added a plugin, changed icons, or need to bump the version:

```bash
# From the project root
bunx cap sync android
```

Then in Android Studio:

1. Open the `android/` folder.
2. In `android/app/build.gradle`, bump `versionCode` by 1 (e.g. `1` → `2`). Update `versionName` if needed (e.g. `"0.9"` → `"1.0"`).
3. **Build → Generate Signed App Bundle** (recommended — `.aab`) or **Generate Signed APK** (`.apk`).
4. Select your keystore, enter passwords, choose **release**.
5. Upload the resulting `.aab` or `.apk` to Google Play Console → Testing → Internal Testing (or Production when ready).

Google Play processing takes a few minutes to a few hours.

---

## Quick Reference — When to Build What

| What you changed | Web action | iOS action | Android action |
|------------------|-----------|------------|----------------|
| Text, colours, layout, pages, components | Publish in Lovable | Nothing | Nothing |
| Backend logic, database, auth, API | Publish in Lovable | Nothing | Nothing |
| `capacitor.config.ts` settings | Publish in Lovable | `cap sync ios` → Archive → Upload | `cap sync android` → Build signed bundle → Upload |
| Added/removed Capacitor plugin | Publish in Lovable | `cap sync ios` → Archive → Upload | `cap sync android` → Build signed bundle → Upload |
| App icons or splash screen | Publish in Lovable | `cap sync ios` → Archive → Upload | `cap sync android` → Build signed bundle → Upload |
| New version milestone (e.g. 0.9 → 1.0) | Publish in Lovable | Bump version + build → Archive → Upload | Bump versionName + versionCode → Build → Upload |

---

## Important Notes

### Existing users and data

All three platforms use the **same production backend** (Supabase). An existing user who installs the iOS or Android app will:

1. See the sign-in screen.
2. Log in with their existing email/password.
3. See **all** their data intact: profile, BSI, drill history, challenge history, sessions, achievements, My Squad and Coach relationships.

No migration, reset, or re-registration is needed.

### App Review considerations

- **iOS**: The app is a Capacitor WebView loading a live URL. Apple guideline 4.2 (minimum functionality) can be a risk. Mitigation: mention in review notes that the app uses native haptics, splash screen, and status bar integration. Provide a test account.
- **Android**: Google Play is generally more permissive with web-wrapper apps, but still ensure the app feels native (splash screen, no browser chrome, proper back-button handling).

### Build number discipline

Every time you upload to TestFlight or Google Play, the build number must be higher than the last upload:

- **iOS**: increment the **Build** field in Xcode.
- **Android**: increment `versionCode` in `android/app/build.gradle`.

The **Version** / `versionName` is what users see (e.g. `0.9`, `1.0`). You can keep the same version across multiple builds.
