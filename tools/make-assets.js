// Generates store assets from the game itself. Usage: node tools/make-assets.js [baseUrl]
// Requires playwright (the repo's devDependency) and a local server on the base URL.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const base = process.argv[2] || 'http://localhost:8777/bubblepop/';
const root = path.join(__dirname, '..'), icons = path.join(root, 'icons'), store = path.join(root, 'store');
fs.mkdirSync(store, { recursive: true });
const font = fs.readFileSync(path.join(root, 'fonts/fredoka-latin.woff2')).toString('base64');
const css = `@font-face{font-family:Fredoka;font-weight:300 700;src:url(data:font/woff2;base64,${font}) format('woff2')}
body{margin:0;font-family:Fredoka,sans-serif;overflow:hidden}
.bg{position:absolute;inset:0;background:linear-gradient(#7ccdf9,#eaf8ff)}
.b{position:absolute;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-family:"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif}
.b::after{content:"";position:absolute;left:22%;top:18%;width:24%;height:14%;border-radius:50%;background:rgba(255,255,255,.6);transform:rotate(-35deg)}
.cloud{position:absolute;background:#fff;border-radius:50%;opacity:.9}
h1{position:absolute;margin:0;color:#fff;font-weight:700;text-shadow:0 4px 0 rgba(0,0,0,.18),0 10px 30px rgba(0,0,0,.15);letter-spacing:.02em}`;
const bubble = (x, y, d, hue, face) => `<div class="b" style="left:${x}px;top:${y}px;width:${d}px;height:${d}px;font-size:${d * 0.55}px;background:radial-gradient(circle at 35% 30%,hsl(${hue},95%,92%),hsl(${hue},85%,62%) 55%,hsl(${hue},80%,45%))">${face || ''}</div>`;
function iconHtml(size, maskable) {
  const pad = maskable ? size * 0.1 : 0, s = size - pad * 2, r = maskable ? 0 : size * 0.2;
  return `<style>${css}</style><div class="bg" style="border-radius:${r}px"></div>
  <div style="position:absolute;left:${pad}px;top:${pad}px;width:${s}px;height:${s}px">
   ${bubble(s * 0.06, s * 0.3, s * 0.62, 352, '🐸')}${bubble(s * 0.58, s * 0.1, s * 0.34, 48, '')}${bubble(s * 0.66, s * 0.6, s * 0.28, 128, '')}
  </div>`;
}
function featureHtml() {
  return `<style>${css} h1{font-size:150px;left:60px;top:150px}</style><div class="bg"></div>
  <div class="cloud" style="left:40px;top:40px;width:160px;height:90px"></div><div class="cloud" style="left:760px;top:340px;width:220px;height:110px"></div>
  ${bubble(620, 40, 200, 352, '🐸')}${bubble(820, 120, 150, 48, '🐱')}${bubble(700, 260, 190, 196, '🐶')}${bubble(900, 10, 90, 302, '')}${bubble(560, 300, 110, 128, '⭐')}
  <h1>Bubble Pop</h1><div style="position:absolute;left:66px;top:320px;font-size:40px;color:#1b3a52;font-weight:500">No ads · No purchases · Ages 1 to 5</div>`;
}
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [name, size, mask] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['maskable-512.png', 512, true]]) {
    await p.setViewportSize({ width: size, height: size }); await p.setContent(`<body style="background:transparent">${iconHtml(size, mask)}</body>`); await p.waitForTimeout(100);
    await p.screenshot({ path: path.join(icons, name), omitBackground: !mask });
  }
  await p.setViewportSize({ width: 1024, height: 500 }); await p.setContent(`<body>${featureHtml()}</body>`); await p.waitForTimeout(100);
  await p.screenshot({ path: path.join(store, 'feature-graphic-1024x500.png') });
  await p.close();
  // Screenshots from the real game
  const c = await b.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true });
  const g = await c.newPage(); await g.goto(base); await g.waitForTimeout(600);
  const add = async (name, av) => { await g.fill('#nameIn', name); await g.click(`#avs button:nth-child(${av})`); await g.locator('#saveBtn').scrollIntoViewIfNeeded(); await g.click('#saveBtn'); await g.waitForTimeout(150); };
  await add('Mia', 2);
  await g.click('#players .tile.add'); await add('Leo', 1);
  await g.click('#players .tile.add'); await add('Zoe', 13);
  await g.evaluate(() => { const P = window.__bubblepop.players; P[0].total = 148; P[0].best = 42; P[1].total = 96; P[1].best = 31; P[2].total = 57; P[2].best = 20; });
  await g.click('#players .tile:first-child'); await g.waitForTimeout(500);
  const shots = [['01-day', 0], ['02-sea', 1], ['03-night', 2]];
  for (const [name, scene] of shots) { await g.evaluate(i => window.__bubblepop.setScene(i), scene); await g.waitForTimeout(5500); await g.screenshot({ path: path.join(store, `screenshot-${name}.png`) }); }
  await g.mouse.move(42, 42); await g.mouse.down(); await g.waitForTimeout(1500); await g.mouse.up(); await g.waitForTimeout(500);
  await g.screenshot({ path: path.join(store, 'screenshot-04-done.png') });
  await g.click('#done'); await g.waitForTimeout(300); await g.screenshot({ path: path.join(store, 'screenshot-05-leaderboard.png') });
  fs.copyFileSync(path.join(store, 'screenshot-01-day.png'), path.join(icons, 'screenshot-portrait.png'));
  await b.close(); console.log('assets written');
})();
