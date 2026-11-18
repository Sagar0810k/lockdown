# Lockdown — Focus Study Lock

**Lock your distracting apps behind a countdown. Keep the phone silent. Finish the chapter.**

> ⚠️ **Known issue with the currently distributed APK (build `0850cdb2`, pre–Nov 18 fix):** the release build strips the native module classes (`ExpoModulesPackageList` and `expo.modules.lockdown.*`) because R8 removed reflectively-loaded classes that had no keep rules. Symptom: the app UI opens fine, but the **Setup tab's GRANT buttons do nothing** and **START LOCKDOWN** does not work (it warns "build required"). The fix is committed (`ee6b612`, `plugins/withLockdownKeepRules.js`) and will be included in the next Android build. In the meantime, locally-built debug APKs are unaffected (debug builds are not minified).

Lockdown is an Android app for focused study sessions. You pick which apps get blocked (social, games, video — anything that steals focus), pick how long, and the phone goes quiet. Until time is up, opening a blocked app slams a full-screen lock with a countdown in front of it — no fighting your willpower with pure willpower.

It is **not** an internet blocker and it does **not** try to control your phone. It locks *your own chosen apps* and restores everything automatically when the session ends.

---

## Download the APK

- **EAS build page (latest build):** https://expo.dev/accounts/sagar0810k/projects/lockdown/builds
- Direct APK: `eas build -p android --profile preview` produces a `.apk` you can install from a download link or transfer directly (`adb install lockdown.apk`).
- Project: https://expo.dev/accounts/sagar0810k/projects/lockdown

> Quota note: the free plan includes 15 Android builds per month. When the quota is exhausted, local debug builds (`npx expo run:android`, requires Android SDK + JDK 17) are free and are not affected by the release minification issue described above.

> The first build may take a while in Expo's free-tier queue; once finished, the builds page shows a downloadable APK artifact.

### First-time setup (2 minutes)

1. Install and open **Lockdown**.
2. Open the **Setup** tab and grant:
   - **Accessibility access** → "Lockdown Focus Guard" (this is how it sees which app is in the foreground; it cannot and does not read your screen content)
   - **Do Not Disturb access** → so sessions can silence the phone
   - **Notifications** → one quiet "session complete" note, nothing else
3. Go to **Apps**, tap everything you want locked (quick filters: Social / Video / Games / Chat).
4. Back to **Focus**, choose a duration (or "Until a time"), tap **START LOCKDOWN**.

## Features

- **App-specific locking** — never "the whole internet", just your blocklist.
- **Silent sessions** — real Do Not Disturb (calls silenced too), previous ringer state restored on end.
- **Countdown lock screen** — opening a blocked app shows time remaining + how many times you've reached for it.
- **Two modes** — "Focus for 45m" (clock-change-proof) or "Block until 9:30 PM".
- **Strict mode** — no early quit (except a 10-second emergency hold); also blocks Settings, Play Store and the package installer so the lock can't be switched off mid-session.
- **Survives reboot** — session state lives in native storage; a reboot re-arms DND and the end alarm.
- **Temptation tracking** — every blocked-app open attempt is counted and shown in Stats (14-day chart, day streak, per-app temptation list).
- **Honest emergency path** — Phone/dialer is never blockable; ending early is always physically possible, logged as "quit early" or "emergency" in your stats (hold the button 3s / 10s).

## Screens

| Tab | What it does |
|---|---|
| Focus | Pick duration or until-time, silence/strict toggles, start session |
| Apps | Searchable installed-app list with category quick-filters |
| Stats | Today / week / streak / temptations, 14-day bar chart, history |
| Setup | Permission grants, how-locking-works, honest fine print |

## How it works (for the curious)

React Native (Expo, SDK 58) UI + a small native Kotlin core in `modules/lockdown/`:

- `LockdownAccessibilityService` — listens for window-focus changes; if the foreground app is on your blocklist during an active session, it counts the attempt and puts `BlockActivity` in front.
- `BlockActivity` — pure-Android full-screen lock (works even if the app UI is killed).
- `SessionStore` — session state anchored to `elapsedRealtime()` (clock-proof), persisted in SharedPreferences; `BootReceiver` re-arms DND + end alarm after reboot; `SessionEndReceiver` fires at the scheduled end and posts the completion notification.
- Stats live on-device in AsyncStorage. No accounts, no cloud, no tracking.

Strict mode also adds `com.android.settings`, `com.android.vending` and the package installer to the blocklist for the session.

## Honest limitations

- **Not tamper-proof.** A determined user can disable the accessibility service in system settings — Android offers no un-bypassable lock without Device Owner provisioning (deliberately out of scope: too intrusive for a study tool).
- "Block until" sessions use your wall clock; a device clock change can affect "until" sessions (duration sessions cannot be shortened by clock changes).
- Some OEM battery savers (Xiaomi/Oppo/Vivo aggressive kill modes) may defer the exact end alarm; the session still restores on next boot/unlock.
- Force-stopping the app from system settings freezes enforcement until restarted (session itself re-arms on reboot).

## Permissions and why

| Permission | Why |
|---|---|
| Accessibility (bind) | Detect the foreground app to show the lock screen |
| ACCESS_NOTIFICATION_POLICY | Set/restore Do Not Disturb |
| RECEIVE_BOOT_COMPLETED | Re-arm the session after a reboot |
| USE_EXACT_ALARM | Fire the session-end alarm exactly on time, even in Doze |
| POST_NOTIFICATIONS | One "session complete" notification |
| `QUERY_ALL_PACKAGES`-style launcher query | List your launchable apps to choose what to lock |

## Development

```sh
npm install
npx expo start            # dev server (needs a dev build — this app ships native code)
npx eas build -p android --profile preview   # produces the installable APK
```

- Native code is **Expo Continuous Native Generation** style: `android/` and `ios/` are generated by prebuild; all native sources live in `modules/lockdown/` — never edit generated folders by hand.
- See `lockdown-thinking.md` for the design rationale, threat model and edge-case decisions.

## License

MIT.
