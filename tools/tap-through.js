#!/usr/bin/env node
// Emulator tap-through: every button and screen of Bubble Pop, driven with
// real Android touch input (adb shell input), on a debug build of the Play
// edition. Play's 3 Nov 2026 review of vc1 listed "Unresponsive UI elements,
// such as buttons or icons"; this test fails unless each control visibly does
// its job when a finger taps it.
//
// The page's layout and state are read over WebView DevTools (enabled only in
// debuggable builds, see MainActivity), so every tap lands on the element's
// measured centre and every step is checked against the game's own state.
// Taps themselves never go through DevTools: they are real touches.
//
//   node tools/tap-through.js <debug-apk> [package]
// Screenshots and a log go to $TAP_THROUGH_OUT (default tap-through/).
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const APK = process.argv[2];
const PKG = process.argv[3] || 'com.taugustincst.bubblepop';
const OUT = process.env.TAP_THROUGH_OUT || 'tap-through';
const PORT = 9333;
if (!APK) { console.error('usage: node tools/tap-through.js <debug-apk> [package]'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const adb = (...a) => execFileSync('adb', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 << 20 }).trim();
let shotN = 0;
const shot = name => {
  const f = path.join(OUT, String(++shotN).padStart(2, '0') + '-' + name + '.png');
  try { fs.writeFileSync(f, execFileSync('adb', ['exec-out', 'screencap', '-p'], { maxBuffer: 64 << 20 })); } catch (e) { /* best effort */ }
};
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!ok) failures++;
  return ok;
};
const fatal = msg => { console.log('FAIL ' + msg); finish(true); };

// ---------------------------------------------------------------- DevTools
let ws = null, msgId = 0;
const pending = new Map();
const pageErrors = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('DevTools timeout: ' + method)); } }, 15000);
  });
}
async function js(expression) {
  const m = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (m.error) throw new Error('DevTools: ' + m.error.message);
  if (m.result.exceptionDetails) {
    const d = m.result.exceptionDetails;
    throw new Error('page: ' + ((d.exception && d.exception.description) || d.text));
  }
  return m.result.result.value;
}
async function connect() {
  for (let i = 0; i < 40; i++) {
    let pid = '';
    try { pid = adb('shell', 'pidof', PKG); } catch (e) { /* not up yet */ }
    if (pid) {
      try {
        adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid.split(/\s+/)[0]}`);
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
        const page = list.find(t => t.type === 'page' && /appassets\.androidplatform\.net/.test(t.url));
        if (page) {
          ws = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
          ws.onmessage = e => {
            const m = JSON.parse(e.data);
            if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
            if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
          };
          await send('Runtime.enable');
          if (await js('!!(window.__bubblepop)')) return;
          ws.close(); ws = null;
        }
      } catch (e) { /* the page or its DevTools socket is not ready yet */ }
    }
    await sleep(1000);
  }
  fatal('could not reach the game page over WebView DevTools (is this a debug build?)');
}

// ----------------------------------------------------------------- geometry
let dpr = 1, offX = 0, offY = 0, screenW = 0, screenH = 0;
// Measure an element (scrolled into view programmatically if it sits in a
// scrolling panel) and make sure it is the topmost thing at its centre, so a
// tap there reaches it and nothing covers it.
async function measure(sel) {
  return js(`(function(){
    var el=document.querySelector(${JSON.stringify(sel)});
    if(!el) return {missing:true};
    el.scrollIntoView({block:'center',inline:'center'});
    var r=el.getBoundingClientRect();
    var cx=r.left+r.width/2, cy=r.top+r.height/2;
    var top=document.elementFromPoint(cx,cy);
    var visible=r.width>0&&r.height>0&&cx>=0&&cy>=0&&cx<=innerWidth&&cy<=innerHeight;
    return {cx:cx,cy:cy,w:r.width,h:r.height,visible:visible,onTop:!!top&&(top===el||el.contains(top))};
  })()`);
}
const toScreen = (cx, cy) => [Math.round(cx * dpr + offX), Math.round(cy * dpr + offY)];
// Wait for the layout to settle (the soft keyboard opening or closing
// resizes the page), so the tap lands where the element really is.
async function measureSettled(sel) {
  let m = await measure(sel);
  for (let i = 0; i < 12 && !m.missing; i++) {
    await sleep(250);
    const n = await measure(sel);
    if (n.missing || (Math.abs(n.cx - m.cx) < 1 && Math.abs(n.cy - m.cy) < 1)) return n;
    m = n;
  }
  return m;
}
async function tap(sel, label) {
  await sleep(150);
  const m = await measureSettled(sel);
  if (m.missing) return check(`${label}: on screen`, false, `${sel} not in the page`);
  if (!check(`${label}: visible and not covered`, m.visible && m.onTop, JSON.stringify(m))) return false;
  const [x, y] = toScreen(m.cx, m.cy);
  adb('shell', 'input', 'tap', String(x), String(y));
  return true;
}
async function longPress(sel, ms) {
  const m = await measureSettled(sel);
  const [x, y] = toScreen(m.cx, m.cy);
  adb('shell', 'input', 'swipe', String(x), String(y), String(x), String(y), String(ms));
}
async function waitFor(expr, ms = 3000) {
  const end = Date.now() + ms;
  for (;;) {
    let v = false;
    try { v = await js(expr); } catch (e) { /* page busy */ }
    if (v) return true;
    if (Date.now() > end) return false;
    await sleep(150);
  }
}
const hidden = id => `document.getElementById(${JSON.stringify(id)}).hidden`;
const shown = id => `!document.getElementById(${JSON.stringify(id)}).hidden`;
async function typeName(keys, want) {
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const k of keys) { adb('shell', 'input', 'keyevent', String(k)); await sleep(250); }
    if (await waitFor(`document.getElementById('nameIn').value.toLowerCase()===${JSON.stringify(want)}`, 1500)) return true;
    // Clear whatever the keyboard made of it, then type again.
    adb('shell', 'input', 'keyevent', '123');
    for (let i = 0; i < 16; i++) adb('shell', 'input', 'keyevent', '67');
    await sleep(300);
  }
  return false;
}
function alive() { try { return adb('shell', 'pidof', PKG) !== ''; } catch (e) { return false; } }

// -------------------------------------------------------------------- run
let finished = false;
function finish(stop) {
  if (finished) return; finished = true;
  try { fs.writeFileSync(path.join(OUT, 'logcat.txt'), adb('logcat', '-d')); } catch (e) { /* best effort */ }
  if (stop) failures = failures || 1;
  console.log(failures ? `tap-through: ${failures} FAILED` : 'tap-through: every button and screen responded');
  try { if (ws) ws.close(); } catch (e) { /* closing */ }
  process.exit(failures ? 1 : 0);
}

(async () => {
  adb('wait-for-device');
  adb('install', '-r', APK);
  try { adb('shell', 'pm', 'clear', PKG); } catch (e) { /* fresh install */ }
  adb('logcat', '-c');
  adb('shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1');
  await connect();
  [screenW, screenH] = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)\s*$/).slice(1).map(Number);
  dpr = await js('devicePixelRatio');
  await sleep(1500);
  shot('first-run');

  // 1. First run opens the new-player form.
  check('first run opens the new-player form', await waitFor(shown('addPanel')));

  // Calibrate: where does a screen pixel land in the page? Tap the form's
  // heading (no handler) and read back the touch's page coordinates.
  await js(`window.__tt=[];addEventListener('pointerdown',function(e){__tt.push([e.clientX,e.clientY])},true);1`);
  {
    const m = await measure('#addTitle');
    const sx = Math.round(m.cx * dpr), sy = Math.round(m.cy * dpr);
    adb('shell', 'input', 'tap', String(sx), String(sy));
    if (!(await waitFor('__tt.length>0'))) fatal('a tap on the screen never reached the page (touch input is not getting through)');
    const [px, py] = await js('__tt[__tt.length-1]');
    offX = sx - px * dpr; offY = sy - py * dpr;
    console.log(`geometry: screen ${screenW}x${screenH}, devicePixelRatio ${dpr}, page offset ${offX.toFixed(1)},${offY.toFixed(1)}`);
    check('touch reaches the page where it was aimed', Math.abs(offX) < screenW && Math.abs(offY) < screenH);
  }

  // 2. Cancel closes the form; the menu with its Add player tile remains.
  await tap('#cancelBtn', 'Cancel');
  check('Cancel closes the form', await waitFor(hidden('addPanel')));
  check('menu is showing', await waitFor(shown('menu')));
  shot('menu-empty');

  // 3. Add player tile opens the form again.
  await tap('#players .tile.add', 'Add player tile');
  check('Add player opens the form', await waitFor(shown('addPanel')));

  // 4. The name field takes focus and typing.
  await tap('#nameIn', 'Name field');
  check('name field takes focus', await waitFor(`document.activeElement&&document.activeElement.id==='nameIn'`));
  check('typing fills the name', await typeName([41, 37, 29], 'mia'));
  adb('shell', 'input', 'keyevent', '111'); // hide the soft keyboard
  await sleep(800);
  shot('form-filled');

  // 5. Each face button selects that face.
  const faces = await js(`document.querySelectorAll('#avs button').length`);
  check('the form offers faces', faces > 0, `${faces}`);
  let faceFails = 0;
  for (let i = faces; i >= 1; i--) {
    await tap(`#avs button:nth-child(${i})`, `Face ${i}`);
    if (!(await waitFor(`document.querySelector('#avs button:nth-child(${i})').getAttribute('aria-pressed')==='true'`, 1500))) faceFails++;
  }
  check('every face button selects its face', faceFails === 0, `${faces - faceFails}/${faces}`);
  // Leave the second face chosen.
  await tap('#avs button:nth-child(2)', 'Face 2 again');
  shot('face-picked');

  // 6. Save creates the player.
  await tap('#saveBtn', 'Save');
  check('Save closes the form', await waitFor(hidden('addPanel')));
  check('Save creates the player', await waitFor(`window.__bubblepop.players.length===1&&window.__bubblepop.players[0].name.toLowerCase()==='mia'`));
  check('player tile appears', await waitFor(`document.querySelectorAll('#players .tile:not(.add)').length===1`));
  shot('menu-with-player');

  // 7. Edit players toggles edit mode; a tile then opens Edit player; Cancel closes it.
  await tap('#manage', 'Edit players');
  check('Edit players switches to edit mode', await waitFor(`document.getElementById('menu').classList.contains('managing')&&document.getElementById('manage').textContent==='Done editing'`));
  await tap('#players .tile:not(.add)', 'Player tile (edit mode)');
  check('tile in edit mode opens Edit player', await waitFor(`${shown('addPanel')}&&document.getElementById('addTitle').textContent==='Edit player'&&!!document.getElementById('deleteBtn')`));
  shot('edit-player');
  adb('shell', 'input', 'keyevent', '111');
  await sleep(500);
  await tap('#cancelBtn', 'Cancel (edit)');
  check('Cancel closes Edit player', await waitFor(hidden('addPanel')));
  await tap('#manage', 'Done editing');
  check('Done editing leaves edit mode', await waitFor(`!document.getElementById('menu').classList.contains('managing')`));

  // 8. A tile starts a round.
  await tap('#players .tile:not(.add)', 'Player tile');
  check('tapping the player starts a round', await waitFor(`window.__bubblepop.playing&&${shown('hud')}`));
  await sleep(2500); // let bubbles rise into view
  shot('round');

  // 9. Tapping a bubble pops it.
  let tapped = 0;
  for (let i = 0; i < 25 && (await js('window.__bubblepop.round')) === 0; i++) {
    // Pick the slowest big bubble in the middle of the screen, measure its
    // speed, and aim where it will be when the tap lands.
    const target = await js(`(function(){
      var l=window.__bubblepop.bubbles.filter(function(b){return !b.pop&&b.y>innerHeight*0.3&&b.y<innerHeight*0.85&&b.x>40&&b.x<innerWidth-40});
      if(!l.length) return null;
      l.sort(function(a,b){return b.r-a.r});
      window.__ttB=l[0];window.__ttY=l[0].y;window.__ttT=performance.now();return true})()`);
    if (!target) { await sleep(400); continue; }
    await sleep(200);
    const b = await js(`(function(){var b=window.__ttB;return {x:b.x,y:b.y,r:b.r,vy:(b.y-window.__ttY)/(performance.now()-window.__ttT)}})()`);
    const lead = 350; // ms from here until the touch reaches the page
    const [x, y] = toScreen(b.x, b.y + b.vy * lead);
    adb('shell', 'input', 'tap', String(x), String(y));
    tapped++;
    await sleep(300);
  }
  const popsByTap = await js('window.__bubblepop.round');
  check('tapping a bubble pops it', popsByTap > 0, `${popsByTap} popped in ${tapped} taps`);

  // 10. Swiping a finger across pops what it crosses.
  const before = await js('window.__bubblepop.round');
  for (let i = 0; i < 6; i++) {
    const y = Math.round(screenH * (0.35 + 0.08 * i));
    adb('shell', 'input', 'swipe', String(Math.round(screenW * 0.08)), String(y), String(Math.round(screenW * 0.92)), String(y), '500');
    await sleep(250);
  }
  const popsBySwipe = (await js('window.__bubblepop.round')) - before;
  check('swiping across the screen pops bubbles', popsBySwipe > 0, `${popsBySwipe} popped`);
  check('the score counter shows the pops', await waitFor(`document.getElementById('scoreN').textContent===String(window.__bubblepop.round)`));
  shot('popping');

  // 11. A short tap on home answers with the hold prompt and keeps playing.
  await tap('#home', 'Home button (short tap)');
  await sleep(500);
  check('short tap on home keeps the round going', await js('window.__bubblepop.playing'));
  check('short tap on home shows "Keep holding to finish!"', await js(shown('holdTip')));
  shot('home-tap');
  check('the prompt clears by itself', await waitFor(hidden('holdTip'), 3500));

  // 12. Holding home finishes the round and shows the summary.
  await longPress('#home', 1700);
  check('holding home ends the round', await waitFor(`!window.__bubblepop.playing&&${shown('done')}`, 3000));
  check('summary shows the pops', await js(`document.getElementById('donePts').textContent===String(window.__bubblepop.round)`));
  shot('summary');

  // 13. A tap on the summary returns to the menu with the leaderboard.
  await tap('#done', 'Summary screen');
  check('tapping the summary returns to the menu', await waitFor(`${shown('menu')}&&${hidden('done')}`));
  check('leaderboard lists the player', await waitFor(`document.getElementById('rows').textContent.toLowerCase().indexOf('mia')>=0`));
  shot('leaderboard');

  // 14. Android Back during a round ends it, and the app stays open.
  await tap('#players .tile:not(.add)', 'Player tile (second round)');
  check('second round starts', await waitFor('window.__bubblepop.playing'));
  await sleep(800);
  adb('shell', 'input', 'keyevent', '4');
  check('Back ends the round', await waitFor(`!window.__bubblepop.playing&&${shown('done')}`));
  await sleep(500);
  check('the app is still open after Back', alive());
  shot('after-back');
  await tap('#done', 'Summary screen (after Back)');
  check('back on the menu', await waitFor(shown('menu')));

  // 15. Remove deletes the player.
  await tap('#manage', 'Edit players (to remove)');
  await tap('#players .tile:not(.add)', 'Player tile (to remove)');
  adb('shell', 'input', 'keyevent', '111');
  await sleep(500);
  check('Remove button is offered', await waitFor(`!!document.getElementById('deleteBtn')`));
  await tap('#deleteBtn', 'Remove');
  if (!check('Remove deletes the player', await waitFor(`window.__bubblepop.players.length===0&&${hidden('addPanel')}`))) {
    console.log('  state: ' + JSON.stringify(await js(`({players:window.__bubblepop.players.length,panel:!document.getElementById('addPanel').hidden,innerHeight:innerHeight,active:document.activeElement&&document.activeElement.id})`)));
  }
  shot('removed');

  // Wrap-up: no crash, no ANR, no page errors.
  const log = adb('logcat', '-d');
  check('no crash', !new RegExp(`FATAL EXCEPTION[\\s\\S]{0,200}Process: ${PKG.replace(/\./g, '\\.')}`).test(log));
  check(`no "app not responding"`, !log.includes(`ANR in ${PKG}`));
  check('no errors in the page', pageErrors.length === 0, pageErrors.join(' | '));
  check('the app is still running', alive());
  finish(false);
})().catch(e => { console.log('FAIL tap-through stopped: ' + (e && e.stack || e)); finish(true); });
