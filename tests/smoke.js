// Headless smoke test: node tests/smoke.js http://localhost:8777/bubblepop/
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://localhost:8777/bubblepop/';
let failures = 0;
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) failures++; };
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await b.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true });
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('response', r => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });
  await p.goto(base); await p.waitForTimeout(800);
  check('first run opens the add-player form', !(await p.isHidden('#addPanel')));
  check('Fredoka font loaded locally', await p.evaluate(() => document.fonts.check('700 20px Fredoka')));
  await p.fill('#nameIn', 'Mia'); await p.click('#avs button:nth-child(2)'); await p.locator('#saveBtn').scrollIntoViewIfNeeded(); await p.click('#saveBtn'); await p.waitForTimeout(200);
  check('player tile created', (await p.locator('#players .tile').count()) === 2);
  await p.click('#players .tile:first-child'); await p.waitForTimeout(1200);
  check('round starts and pushes history', await p.evaluate(() => window.__bubblepop.playing && !!(history.state && history.state.round)));
  let taps = 0;
  for (let i = 0; i < 10; i++) { const bb = await p.evaluate(() => { const l = window.__bubblepop.bubbles.filter(x => !x.pop && x.y > 90 && x.y < 600); return l.length ? { x: l[0].x, y: l[0].y } : null; }); if (bb) { taps++; await p.touchscreen.tap(bb.x, bb.y); } await p.waitForTimeout(200); }
  const pops = await p.evaluate(() => window.__bubblepop.round);
  check('taps pop bubbles', taps > 0 && pops >= taps * 0.8, `${pops}/${taps}`);
  await p.mouse.move(42, 42); await p.mouse.down(); await p.waitForTimeout(300); await p.mouse.up(); await p.waitForTimeout(100);
  check('short press on home does not end round', await p.evaluate(() => window.__bubblepop.playing));
  await p.mouse.down(); await p.waitForTimeout(1500); await p.mouse.up(); await p.waitForTimeout(400);
  check('long press ends round and shows summary', !(await p.evaluate(() => window.__bubblepop.playing)) && !(await p.isHidden('#done')));
  await p.click('#done'); await p.waitForTimeout(200);
  check('leaderboard lists the player', (await p.textContent('#rows')).includes('Mia'));
  await p.reload(); await p.waitForTimeout(600);
  check('players persist across reload', await p.evaluate(() => window.__bubblepop.players.some(x => x.name === 'Mia' && x.total > 0)));
  await p.click('#players .tile:first-child'); await p.waitForTimeout(500);
  await p.goBack(); await p.waitForTimeout(400);
  check('back button ends round without leaving the page', !(await p.evaluate(() => window.__bubblepop.playing)) && (p.url()).includes(base.replace(/^https?:\/\/[^/]+/, '')));
  await p.close();
  for (const [w, h] of [[320, 568], [844, 390]]) {
    const c = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true }); const q = await c.newPage(); await q.goto(base); await q.waitForTimeout(500);
    const ok = await q.evaluate(() => { const n = document.querySelector('#nameIn').getBoundingClientRect(); return n.y >= 0 && n.y + n.height <= innerHeight; });
    check(`name field reachable at ${w}x${h}`, ok); await c.close();
  }
  check('no page errors, console errors or failed requests', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED'); process.exit(failures ? 1 : 0);
})();
