# Bubble Pop

A bright, ad-free popping game for little kids, published by AugustInnovations LLC.
Live at **https://taugustincst.github.io/bubblepop/** as an installable, offline-capable web app. The Google Play edition is a bundled native app: a full-screen WebView that plays the game from files packaged inside the app, with no internet permission.

## The game

- Pick your face from a tile of avatars; each player keeps a running total, a best round, and a spot on the family leaderboard
- Pop bubbles, balloons and stars by tapping or by swiping a finger across them; multi-touch works
- Three scenes rotate every 40 seconds: daytime clouds, under the sea, and a starry night, each with its own animal faces and synthesized voices
- A gentle background melody, a cheer and confetti shower every 10 pops, and "New best!" at the end of a round
- Hold-to-finish home button so a stray tap never ends the round
- No ads, purchases, accounts, analytics or network requests. Player names and scores live only on the device

## Repository layout

| Path | What |
|---|---|
| `index.html` | The whole game: markup, styles and script in one file |
| `sw.js`, `manifest.webmanifest` | Offline app shell and install metadata |
| `fonts/` | Fredoka (SIL Open Font License), self-hosted so the game makes no third-party requests |
| `icons/` | App icons and the PWA screenshot |
| `store/` | Play Store listing copy, feature graphic and phone screenshots |
| `android/` | Gradle project for the Google Play edition (`android/play`); the web files are copied in at build time |
| `tools/check-apk.js`, `tools/launch-test.sh` | Checks that every class the manifest names is in the dex, and that the game renders on an emulator |
| `tools/tap-through.js` | Taps every button and screen on an emulator with real touches and checks each one responds |
| `tests/smoke.js` | Headless end-to-end check |
| `tools/make-assets.js` | Regenerates icons, feature graphic and screenshots from the game itself |
| `.github/workflows/pages.yml` | Deploys `main` to GitHub Pages |
| `.github/workflows/android.yml` | Builds the Play edition, opens it on an Android 14 emulator, and taps through every button |
| `.github/workflows/release.yml` | Builds the signed Play bundle and attaches it to a GitHub release |

## Development

No build step. Serve the parent folder so the game runs under `/bubblepop/`, matching production:

```bash
npm install            # playwright, for tests and assets only
npm run serve          # http://localhost:8777/bubblepop/
npm test               # headless smoke test
npm run assets         # regenerate icons and store assets
```

After changing game files, bump `VERSION` in `sw.js` so cached players refresh.

## Publishing to Google Play

The Play bundle is built by GitHub Actions, never by hand.

1. Push to `main`. The **Android** workflow builds `android/play` and opens it on an emulator; it fails unless the game actually renders and every button responds to a real tap. Don't release from a red run.
2. Run **Release (Play bundle)** from the Actions tab with a version name and a `version_code` higher than any code Play has seen (vc1 was rejected; `play-v1.0.1` is versionCode 2; `play-v1.0.2` is versionCode 3). It signs with the upload key in the four `ANDROID_UPLOAD_*` repository secrets and attaches `bubble-pop-<version>-play.aab` to a `play-v<version>` release.
3. In Play Console, upload that `.aab` and send it for review.

To build locally instead, put `storeFile`, `storePassword`, `keyAlias` and `keyPassword` in `android/keystore.properties` (never committed) and run `./gradlew :play:bundleRelease -PversionCode=<n> -PversionName=<x.y.z>` in `android/`.

Listing setup in Play Console:

1. The game files ship inside the app (no TWA), so **no assetlinks.json entry is needed**.
2. Enroll in Play App Signing with the upload key.
3. Fill the listing from `store/listing.md`. The app name is **Bubble Pop for Kids**: no promotional words such as "Ad-Free" in the title (vc1's title was flagged for that). Upload `store/feature-graphic-1024x500.png` and the screenshots.
4. Declare the target audience as children, complete the Data safety form as "no data collected", and the content rating questionnaire.
5. **Price: Paid, $1.99 one-time** (decided by Tj 2026-10-28). A Play app cannot switch from free to paid later, so set this at creation.
6. Optional: apply to the Teacher Approved program after publishing.

For updates to the game on the web, pushing to `main` is enough. The Android app bundles its copy of the game, so app updates need a rebuilt bundle with a bumped `versionCode`.
