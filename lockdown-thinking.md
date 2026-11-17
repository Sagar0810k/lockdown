# Lockdown — Focus Study App: My Thinking & Design Notes

> What I was working on: an Android focus-lock app (Expo/React Native + a minimal native Kotlin core) that blocks chosen apps behind a full-screen lock screen until a timer expires, keeps the phone silent, and is hard to bail out of during a session.
> Name meaning: **Lockdown** — you lock *your own* apps, not the internet.

---

## 1. The one honest constraint

Latest Android (12–15+) does not let any normal app truly "lock" the phone. There are exactly three tiers of lockdown power, and I deliberately picked tier 2:

- **Tier 1 — App-pinning / overlays** (weakest): trivially escaped, mostly cosmetic. Rejected.
- **Tier 2 — AccessibilityService + Notification Policy (DND) + AlarmManager + boot receiver** (current design): the service sees which app is foreground and slams a full-screen lock screen in front of blocked apps. DND keeps the phone silent. Session state lives in native SharedPreferences, is measured on `elapsedRealtime`, and is restored after reboot. This is what real study-lock apps use.
- **Tier 3 — Device Owner / Device Admin** (strongest): silent install/uninstall prevention, Wi-Fi/keyguard control. Requires factory-reset-level provisioning or manual deactivation flows that are abusable, fragile on OEM devices, and overkill for "focused study". **Skipped on purpose** — noted here so the trade-off is explicit.

Consequence, stated plainly: nothing stops a determined user from going to system Settings and disabling the accessibility service. So instead of pretending, **Strict mode blocks Settings, Play Store and the package installer during the session** — which actually closes that escape hatch, without Device Owner.

## 2. What the app is (and is not)

**Is:** choose apps → set a duration or an until-time → phone goes silent → blocked apps open into a lock screen → countdown → auto-restore everything when time is up.

**Is not:** an internet blocker, a parental control suite, a device-owner appliance, a VPN blocker. Blocking "the whole internet" is both unreliable on modern Android (private DNS, Chrome Custom Tabs, WebView) and not what a study session needs — and the user explicitly excluded it.

## 3. Edge cases & how they're handled

| Edge case | Handling |
|---|---|
| User changes system clock forward/backward to end session early | Session duration anchored to `SystemClock.elapsedRealtime()` — wall clock changes can't shorten it. |
| "Block until 18:00" sessions | Wall-clock semantics by design; a clock change can affect them, so the UI prefers durations and labels until-time sessions clearly. |
| Phone reboots mid-session | `BOOT_COMPLETED` receiver re-applies DND, re-arms the exact end alarm; session never silently dies on reboot. |
| App is force-stopped / swiped from recents | Enforcement lives in the *system* accessibility service, not the JS app — killing the app UI doesn't stop blocking. |
| Notification fires during focus | DND (`INTERRUPTION_FILTER_NONE`) set at session start, previous filter restored at session end; falls back gracefully (app tells you to grant access) if not granted. |
| User opens blocked app N times | Each attempt is counted ("temptation count") and shown on the lock screen + stats. Data, not drama. |
| Escape via Settings / uninstall | Strict mode also blocks `com.android.settings`, `com.android.vending`, `com.google.android.packageinstaller`. |
| Emergency | Calls/dialer/phone app are never blockable; emergency exit = hold-to-quit (Normal) or hold 10 s with the reason logged (Strict). |
| Session ends while phone is off | End alarm may fire while off; state reconciles on next boot/unlock (`BOOT_COMPLETED` + status re-read on every JS screen focus). |
| Ending state on screen rot/app switch | Block screen is its own native activity — not dependent on RN JS being alive. |
| Alarm OEM reliability quirks (MIUI/OneUI/ColorOS kill alarms) | Uses `setExactAndAllowWhileIdle` + re-arms on boot; still flagged as OEM-dependent in README troubleshooting. |
| Forgetting to start the session | Daily schedule (optional): native alarms auto-start a preset session window; missed windows simply don't fire. |
| Uninstall attempt by curiosity | Prevented in practice by Strict mode (installer blocked); document that it isn't cryptographically impossible. |

## 4. Strictness levels (intentional, not gimmicks)

- **Normal**: blocked apps → lock screen; can quit early with a 3-second hold on the lock screen.
- **Strict**: no early exit at all via the app; emergency hold (10 s) is the only way out, and Settings/Play Store/Installer are blocked for the session. Rebooting does not end it.
- No "Monk mode with punishment videos" — forced content isn't lockdown, it's UX noise.

## 5. Keeping it light (explicit rules)

- **One** native package: a plain `ReactContextBaseJavaModule` (no full Expo Modules API dependency graph beyond what ships with Expo, no third-party blocker libs).
- No Redux, no styled-components, no animation libs — screens are stock React Native with a tiny shared style sheet; countdown ring is a plain bordered circle.
- Stats in AsyncStorage only; session truth lives native-side in SharedPreferences.
- `@expo/vector-icons` for icons (ships with Expo template). `async-storage` the only added runtime dep.
- Single JS codebase, hand-rolled micro router (3 screens) instead of react-navigation.
- Target: latest Android (`compileSdk`/`targetSdk` 36 via current Expo SDK defaults), minSdk 26.

## 6. What I cut and why

- **Device Admin/Owner** — abuse surface + OEM fragility; benefits don't beat Strict-mode-blocking-Settings for a study tool.
- **VPN/DNS internet blocking** — user said no, and it's leaky by design on modern Android.
- **Usage-stats real-time polling** — battery drain; Accessibility events are push-based and cheaper.
- **Cloud sync/accounts** — a study timer doesn't need them; zero PII, zero backend cost.
- **Recurring in-app schedules in v1 UI** — native plumbing included but UI ships one optional "daily focus reminder" toggle; full timetable UI is v2.

## 7. Build & delivery path

Expo managed → `npx expo prebuild` (bare) → hand-written Kotlin under `android/app/src/main/java/com/lockdown/app/` → **EAS Build** (cloud) with `preview` profile → installable APK link. No local Android SDK required on this machine (there isn't one — only adb platform-tools). EAS also means reproducible builds for future versions.

## 8. Honest limitations

- Can't block *everything* — hardened blocklists only via PackageManager-launchable apps the user picks.
- A user who really wants out can always factory-reset or disable accessibility from a safe state; this is a focus aid with teeth, not tamper-proof custody.
- OEM battery savers may defer the end alarm by minutes — session restoration is guaranteed on next boot/unlock, timing of the exact minute is not.
