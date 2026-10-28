# Bubble Pop

The bubble popping game for little kids, originally built as a Claude artifact
(https://claude.ai/artifact/KG3kJNdBH2cXagXVYdCTuF), now packaged as an installable,
offline-capable web app for Google Play. Live at **https://taugustincst.github.io/bubblepop/**.

## The game

- Pick your face from a tile of avatars; each player keeps a running total, a best round, and a spot on the family leaderboard
- Pop bubbles, balloons and stars by tapping or by swiping a finger across them; multi-touch works
- Three scenes rotate every 40 seconds: daytime clouds, under the sea, and a starry night, each with its own cast of animal faces and synthesized voices (croak, quack, moo, blub, hoot, and more)
- A gentle background melody, a cheer and a confetti shower every 10 pops, and "New best!" at the end of a round
- Hold-to-finish home button so a stray tap never ends the round; fullscreen with keyboard lock on desktops so the kid stays in the game
- No ads, purchases, accounts, or analytics. Player names and scores live only on the device

## What changed for release

The artifact's code is untouched apart from four additions at the end of its script:

1. A proper document head with the web app manifest, icons and theme color, and the `[hidden]` rule the artifact host used to supply
2. Service worker registration (`sw.js`) so the game loads offline after the first visit
3. Android back button support: Back ends the current round instead of closing the app
4. A small `window.__bubblepop` test hook used by the automated checks
5. A CSS rule letting the add-player form scroll: it is taller than small or landscape phone screens, which clipped the name field

The shared cross-device leaderboard only works when the page runs inside the Claude artifact host.
In the Play app the code falls back to device-only storage automatically and labels the board "this device only".

## Publishing to Google Play

Same Trusted Web Activity (TWA) flow as Ironhold and Elderon. Bubblewrap config: `android/twa-manifest.json`
(package `com.taugustincst.bubblepop`).

```bash
npm i -g @bubblewrap/cli
cd bubblepop/android
bubblewrap init --manifest https://taugustincst.github.io/bubblepop/manifest.webmanifest
bubblewrap build          # produces app-release-bundle.aab
```

After the first upload, add a `com.taugustincst.bubblepop` entry with the Play App Signing SHA-256 fingerprint
(and your upload key's fingerprint) to `/.well-known/assetlinks.json`, next to the Elderon entry.

### Play Console checklist for a kids' app

- **Target audience**: declare the app is designed for children. This enrolls it in the Families policy, which it meets: no ads, no external links, no data collection.
- **Privacy policy URL**: `https://taugustincst.github.io/bubblepop/privacy.html`.
- **Data safety form**: "No data collected", "No data shared".
- **Content rating**: IARC questionnaire, expect "Everyone".
- **Pricing**: Play apps cannot switch from free to paid later. Decide before publishing.
- **Store assets**: 512×512 icon (`icons/icon-512.png`), a 1024×500 feature graphic, and phone screenshots (`icons/screenshot-portrait.png` is one; capture a few more showing the sea and night scenes and the leaderboard).

### Updates

Push to this repo to update the game and bump `VERSION` in `sw.js` so cached players refresh.
Rebuild the Android bundle (bump `appVersionCode`) only when the wrapper or Play's target SDK requirement changes.
