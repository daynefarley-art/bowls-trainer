# Bowls Trainer — iOS TestFlight Build Guide (v0.9 Beta)

This project is wired for Capacitor. The iOS shell loads the **existing
production deployment** (`https://bowlmate-progress-tracker.lovable.app`) so
all users keep their login, profile, BSI, drill history, challenge history,
sessions, achievements, My Squad and Coach relationships. **No database is
created, migrated or reset.**

- **App Name:** Bowls Trainer
- **Bundle ID:** `com.bowlstrainer.app`
- **Version / Build:** `0.9` / `1`
- **Backend:** existing production Supabase (unchanged)
- **Domain (marketing):** bowlstrainer.com

You need a Mac with Xcode 15+ and a paid Apple Developer account.

---

## 1. Clone the project locally

```bash
git clone <your-repo-url> bowls-trainer
cd bowls-trainer
bun install
```

## 2. Add the iOS platform (once)

```bash
bunx cap add ios
bunx cap sync ios
```

This creates the native `ios/` folder. Commit it.

If `ios/` already exists from a previous run with the old bundle ID, delete
it and re-run `bunx cap add ios` so the native project picks up
`com.bowlstrainer.app` from `capacitor.config.ts`.

## 3. Open in Xcode

```bash
bunx cap open ios
```

Xcode opens `ios/App/App.xcworkspace`.

## 4. Configure signing & identity

In Xcode, select the **App** target → **Signing & Capabilities**:

| Field                        | Value                    |
| ---------------------------- | ------------------------ |
| Display Name                 | `Bowls Trainer`          |
| Bundle Identifier            | `com.bowlstrainer.app`   |
| Team                         | Your Apple Developer team|
| Automatically manage signing | ✅ On                    |

Then in the **General** tab:

| Field       | Value      |
| ----------- | ---------- |
| Version     | `0.9`      |
| Build       | `1`        |
| Deployment  | iOS 14.0+  |

## 5. App icon & splash

1. Export a 1024×1024 PNG from `src/assets/icon-512.png` (or drop in a
   higher-res master when you have one) and place it in
   `ios/App/App/Assets.xcassets/AppIcon.appiconset/` in the "App Store"
   1024pt slot. Xcode 15 generates the remaining sizes.
2. Splash screen background is set to `#0F5132` in `capacitor.config.ts`.

## 6. Register the app in App Store Connect

1. https://developer.apple.com/account/resources/identifiers → **+** → App IDs
   → create identifier **`com.bowlstrainer.app`**. Enable "Sign In with Apple"
   only if you plan to use it.
2. https://appstoreconnect.apple.com → **My Apps → +**
   - Platform: **iOS**
   - Name: **Bowls Trainer**
   - Bundle ID: **com.bowlstrainer.app**
   - SKU: e.g. `bowlstrainer-ios`

## 7. Archive & upload

In Xcode:

1. Top bar → device target → **Any iOS Device (arm64)**.
2. **Product → Archive**. Wait for build.
3. Organizer → **Distribute App → App Store Connect → Upload**.
4. Keep default signing options → **Upload**.

TestFlight processing takes ~5–30 minutes. Then in App Store Connect →
TestFlight, add internal testers; they install via the TestFlight app.

## 8. Shipping updates later

- Web/UI changes deploy automatically to the production URL used by the
  shell — **no new iOS build required**.
- New native build needed only when `capacitor.config.ts`, bundle ID, native
  plugins, icons, or Info.plist change.

```bash
bunx cap sync ios
bunx cap open ios
# bump Build number in Xcode → Product → Archive → Upload
```

---

## Existing users — data continuity confirmation

The iOS app is a Capacitor WebView pointed at the existing production URL
`https://bowlmate-progress-tracker.lovable.app`. It uses:

- the **same Supabase project** (no new backend created)
- the **same auth users, RLS policies and tables**
- the **same session storage** (Supabase JS keeps the JWT in the WebView's
  localStorage on device, just like the browser)

Therefore an existing user who installs the TestFlight build will:

1. Launch the app → see the standard sign-in screen.
2. Enter their existing email + password (or Google, if configured).
3. Land on their dashboard with **all** existing data intact: profile, BSI,
   drill history, challenge history, sessions, achievements, My Squad and
   Coach relationships, Performance Insights.

No migration, reset, or re-registration is required.

## Notes / gotchas

- **App Review guideline 4.2**: mention in review notes that the app uses
  native haptics, splash screen, and status bar integration, and include a
  test account so reviewers can log in.
- **Info.plist**: default HTTPS-only ATS is fine. No camera/mic/location
  keys needed for v0.9.
- **Sign In with Apple**: only required if you enable Apple as an auth
  provider — not needed for v0.9.
