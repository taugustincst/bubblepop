#!/usr/bin/env bash
# Installs the Play-edition APK on a running emulator, opens it the way a
# player (or a Play reviewer) does, and fails if the game does not actually
# appear. Play rejected vc1 on 3 Nov 2026 under Broken Functionality: the
# reviewer's screenshot showed the WebView error page
# "net::ERR_INVALID_RESPONSE" for the app's own asset URL — the app opened
# but the game never loaded. A launch that merely doesn't crash is NOT a
# pass here: the first screenshot must show the game, not the error page.
#
# After the render checks, the script drives the first-run flow the way the
# web smoke test (tests/smoke.js) does — add a player, start a round, tap
# the home button once (the "Hold to finish" prompt must appear), then hold
# it to finish — saving a screenshot at each step for review. Those taps are
# best-effort (WebView accessibility nodes); the fatal checks are crash,
# ANR, the vc1 error string, an error-page screenshot, and process death.
#   tools/launch-test.sh <apk> [package]
set -uo pipefail
APK="$1"
PKG="${2:-com.taugustincst.bubblepop}"
OUT="${LAUNCH_TEST_OUT:-launch-test}"
mkdir -p "$OUT"

fail() { echo "launch-test: FAIL — $*"; exit 1; }
note() { echo "launch-test: $*"; }

adb wait-for-device
adb install -r "$APK" || fail "APK did not install"
adb shell pm clear "$PKG" >/dev/null 2>&1 || true
adb logcat -c
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 12
adb exec-out screencap -p > "$OUT/01-first-screen.png" || true
adb logcat -d > "$OUT/logcat.txt"

if grep -A2 "FATAL EXCEPTION" "$OUT/logcat.txt" | grep -q "Process: $PKG"; then
  grep -A30 "FATAL EXCEPTION" "$OUT/logcat.txt" | head -60
  fail "$PKG crashed at launch"
fi
grep -q "ANR in $PKG" "$OUT/logcat.txt" && fail "$PKG stopped responding at launch"
grep -q "ERR_INVALID_RESPONSE" "$OUT/logcat.txt" && fail "WebView reported ERR_INVALID_RESPONSE (the vc1 failure)"

# The error page is a near-uniform white page; the game is a full-screen
# colourful scene. Fail if the first screenshot looks like the error page.
if command -v convert >/dev/null 2>&1; then
  python3 - "$OUT/01-first-screen.png" <<'PYEOF' || fail "first screenshot looks like the WebView error page (near-uniform white)"
import subprocess, sys
img = sys.argv[1]
def stat(fmt):
    return float(subprocess.check_output(['convert', img, '-colorspace', 'Gray', '-format', fmt, 'info:']).decode())
mean = stat('%[fx:mean]')
std = stat('%[fx:standard_deviation]')
print(f"launch-test: first screenshot mean={mean:.3f} std={std:.3f}")
sys.exit(0 if not (mean > 0.93 and std < 0.06) else 1)
PYEOF
else
  note "ImageMagick not present; skipping the pixel check (screenshots are still saved for review)"
fi

# --- best-effort flow: add a player, play, exercise the home button -------
tap_node() { # tap_node <text-or-content-desc>
  local want="$1" dump bounds xy x1 y1 x2 y2
  dump=$(adb shell uiautomator dump /sdcard/window_dump.xml >/dev/null 2>&1; adb exec-out cat /sdcard/window_dump.xml 2>/dev/null)
  bounds=$(printf '%s' "$dump" | grep -oE "(text|content-desc)=\"$want\"[^>]*bounds=\"\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]\"" | grep -oE '\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]' | head -1)
  if [ -z "$bounds" ]; then note "node not found (skipping tap): $want"; return 1; fi
  xy=$(printf '%s' "$bounds" | tr -d '[]' | tr ',' ' ')
  read -r x1 y1 x2 y2 <<< "$xy"
  adb shell input tap $(( (x1 + x2) / 2 )) $(( (y1 + y2) / 2 ))
  sleep 1
}
shot() { adb exec-out screencap -p > "$OUT/$1" || true; }

tap_node "Who is playing?" || adb shell input tap 540 960   # name input (placeholder or centre fallback)
adb shell input text Mia
tap_node "🐱" || note "avatar tap skipped"
shot 02-player-form.png
tap_node "Save" || note "save tap skipped"
sleep 1
shot 03-menu.png
tap_node "Mia" || note "player tile tap skipped"
sleep 2
shot 04-round.png
# One tap on the home button: the "Hold to finish" prompt must appear and
# the round must NOT end.
tap_node "Hold to finish" || note "home tap skipped"
sleep 1
shot 05-home-prompt.png
adb shell pidof "$PKG" >/dev/null || fail "$PKG died during the flow"
# Now hold the home button to finish the round (long press at its centre).
dump=$(adb shell uiautomator dump /sdcard/window_dump.xml >/dev/null 2>&1; adb exec-out cat /sdcard/window_dump.xml 2>/dev/null)
bounds=$(printf '%s' "$dump" | grep -oE 'content-desc="Hold to finish"[^>]*bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' | grep -oE '\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]' | head -1)
if [ -n "$bounds" ]; then
  xy=$(printf '%s' "$bounds" | tr -d '[]' | tr ',' ' ')
  read -r x1 y1 x2 y2 <<< "$xy"
  adb shell input swipe $(( (x1 + x2) / 2 )) $(( (y1 + y2) / 2 )) $(( (x1 + x2) / 2 )) $(( (y1 + y2) / 2 )) 1600
  sleep 1
fi
shot 06-after-hold.png
adb shell pidof "$PKG" >/dev/null || fail "$PKG died after the hold"
adb logcat -d > "$OUT/logcat-final.txt"
note "$PKG rendered, survived the flow, and is still running"
