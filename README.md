# Bubble Pop

A bright, ad-free popping game for little kids, published by AugustInnovations LLC.
Live at **https://taugustincst.github.io/bubblepop/** as an installable, offline-capable web app, and packaged for Google Play as a Trusted Web Activity.

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
| `android/` | Bubblewrap configuration for the Play Store build |
| `tests/smoke.js` | Headless end-to-end check |
| `tools/make-assets.js` | Regenerates icons, feature graphic and screenshots from the game itself |
| `.github/workflows/pages.yml` | Deploys `main` to GitHub Pages |

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

```bash
npm i -g @bubblewrap/cli
cd android
bubblewrap init --manifest https://taugustincst.github.io/bubblepop/manifest.webmanifest
bubblewrap build          # app-release-bundle.aab
```

Then in Play Console:

1. Upload the bundle. Under **Setup → App signing** copy the SHA-256 fingerprint.
2. Add a `com.taugustincst.bubblepop` entry with that fingerprint (and your upload key's) to `.well-known/assetlinks.json` on the `taugustincst.github.io` site repo. Without it Chrome shows a URL bar inside the app.
3. Fill the listing from `store/listing.md`, upload `store/feature-graphic-1024x500.png` and the screenshots.
4. Declare the target audience as children, complete the Data safety form as "no data collected", and the content rating questionnaire.
5. Set the price. A Play app cannot switch from free to paid later.
6. Optional: apply to the Teacher Approved program after publishing.

For updates to the game, pushing to `main` is enough. Rebuild the Android bundle (bump `appVersionCode` in `android/twa-manifest.json`) only when the wrapper or Play's target SDK requirement changes.
