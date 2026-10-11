// Скриншоты программы для сайта (ретина ×2): node tools/site-screenshots.mjs "$PWD/app/fotomagazin.html" "$PWD/site/assets" /tmp/fm-chrome
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [, , APP, OUT, PROFILE] = process.argv;
mkdirSync(OUT, { recursive: true });
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--hide-scrollbars',
  '--force-color-profile=srgb', '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let target;
for (let i = 0; i < 60 && !target; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); target = l.find(t => t.type === 'page'); } catch { }
  if (!target) await sleep(250);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(), waiters = [];
ws.onmessage = m => { const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { const { ok, no } = pend.get(d.id); pend.delete(d.id); d.error ? no(Error(JSON.stringify(d.error))) : ok(d.result); }
  else if (d.method) waiters.filter(w => w.m === d.method).forEach(w => { waiters.splice(waiters.indexOf(w), 1); w.r(d.params); }); };
const send = (method, params = {}) => new Promise((ok, no) => { const i = ++id; pend.set(i, { ok, no }); ws.send(JSON.stringify({ id: i, method, params })); });
const once = m => new Promise(r => waiters.push({ m, r }));
async function ev(fn, arg) {
  const r = await send('Runtime.evaluate', { expression: `(${fn})(${JSON.stringify(arg ?? null)})`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function shot(name, clip, q = 90) {
  await ev(() => { document.querySelector('#toast').style.display = 'none'; });
  await sleep(250);
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: q, clip: { ...clip, scale: 1 } });
  writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(r.data, 'base64')); console.log('saved', name);
}

await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 2, mobile: false });
await send('Page.enable');
const loaded = once('Page.loadEventFired');
await send('Page.navigate', { url: pathToFileURL(APP).href });
await loaded; await sleep(800);

// ---------- демо-сцена: горы на закате (процедурно) ----------
await ev(async () => {
  function scene(W, H) {
    const c = mk(W, H), x = c.getContext('2d');
    let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const hz = H * .64;
    let g = x.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, '#0b1636'); g.addColorStop(.42, '#33377a'); g.addColorStop(.72, '#b8607a'); g.addColorStop(.9, '#ee9a62'); g.addColorStop(1, '#f7b56c');
    x.fillStyle = g; x.fillRect(0, 0, W, hz);
    for (let i = 0; i < 380; i++) { const yy = rnd() * hz * .5; x.globalAlpha = (1 - yy / (hz * .5)) * rnd() * .85; x.fillStyle = '#fff';
      x.beginPath(); x.arc(rnd() * W, yy, rnd() * 1.7 + .3, 0, 7); x.fill(); }
    x.globalAlpha = 1;
    const sx = W * .64, sy = hz - H * .17;
    g = x.createRadialGradient(sx, sy, 0, sx, sy, W * .55); g.addColorStop(0, 'rgba(255,220,160,.9)'); g.addColorStop(.12, 'rgba(255,170,110,.45)'); g.addColorStop(.4, 'rgba(240,110,110,.12)'); g.addColorStop(1, 'rgba(200,90,120,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, hz);
    x.fillStyle = '#ffe7bf'; x.shadowColor = 'rgba(255,210,150,.9)'; x.shadowBlur = 60; x.beginPath(); x.arc(sx, sy, H * .05, 0, 7); x.fill(); x.shadowBlur = 0;
    x.filter = 'blur(7px)';   // мягкие перистые облака
    for (let i = 0; i < 26; i++) { const cy = hz * (.28 + rnd() * .58), cx = rnd() * W, w = W * (.08 + rnd() * .22), h = H * (.004 + rnd() * .008);
      for (let k = 0; k < 3; k++) { x.globalAlpha = .1 + rnd() * .18; x.fillStyle = cy > hz * .72 ? '#ffd0a8' : '#e7a0ba'; x.beginPath(); x.ellipse(cx + (rnd() - .5) * w * .6, cy + (rnd() - .5) * h * 3, w * (.5 + rnd() * .5), h, 0, 0, 7); x.fill(); } }
    x.filter = 'none'; x.globalAlpha = 1;
    const ridge = (n, rough) => { const N = 2 ** n, a = new Float32Array(N + 1); a[0] = rnd(); a[N] = rnd(); let st = N, amp = 1;
      while (st > 1) { const h = st / 2; for (let i = h; i < N; i += st) a[i] = (a[i - h] + a[i + h]) / 2 + (rnd() - .5) * amp; amp *= rough; st = h; }
      let lo = Math.min(...a), hi = Math.max(...a); return Array.from(a, v => (v - lo) / (hi - lo)); };
    const cols = [['#9a7096', '#7a5a86'], ['#6d4f7f', '#4c3b6a'], ['#433563', '#2c2448'], ['#272044', '#191530'], ['#15112a', '#0c0a1a']];
    cols.forEach(([top, bot], i) => {
      const a = ridge(9, .55 + i * .03), base = hz - H * (.035 - i * .002), amp = H * (.13 + i * .035), off = H * (.05 - i * .028);
      x.beginPath(); x.moveTo(0, hz);
      a.forEach((v, k) => x.lineTo(k / (a.length - 1) * W, base - off - v * amp * (0.55 + .45 * Math.sin(k / a.length * Math.PI * (1.2 + i * .3) + i))));
      x.lineTo(W, hz); x.closePath();
      g = x.createLinearGradient(0, base - amp - off, 0, hz); g.addColorStop(0, top); g.addColorStop(1, bot); x.fillStyle = g; x.fill();
      g = x.createLinearGradient(0, hz - H * .12, 0, hz); g.addColorStop(0, 'rgba(240,150,130,0)'); g.addColorStop(1, `rgba(240,150,130,${.22 - i * .035})`);
      x.fillStyle = g; x.fillRect(0, hz - H * .12, W, H * .12);
    });
    // озеро с отражением
    const t = mk(W, Math.ceil(hz)); t.getContext('2d').drawImage(c, 0, 0);
    x.fillStyle = '#1c1632'; x.fillRect(0, hz, W, H - hz);
    x.save(); x.translate(0, 2 * hz); x.scale(1, -1); x.filter = 'blur(3px)'; x.globalAlpha = .8; x.drawImage(t, 0, 0); x.restore();
    g = x.createLinearGradient(0, hz, 0, H); g.addColorStop(0, 'rgba(20,16,40,.25)'); g.addColorStop(1, 'rgba(8,6,20,.85)'); x.fillStyle = g; x.fillRect(0, hz, W, H - hz);
    for (let i = 0; i < 900; i++) { const yy = hz + Math.pow(rnd(), 1.6) * (H - hz), w = (10 + rnd() * 80) * (1 + (yy - hz) / (H - hz) * 2);
      const near = Math.abs(rnd() * W - sx); x.globalAlpha = .05 + rnd() * .1; x.fillStyle = '#ffd6a0'; x.fillRect(rnd() * W, yy, w, 1.5); }
    for (let i = 0; i < 260; i++) { const yy = hz + 4 + Math.pow(rnd(), 1.3) * (H - hz) * .9, spread = 30 + (yy - hz) * .35;
      x.globalAlpha = .25 + rnd() * .5; x.fillStyle = '#ffe2b4'; x.fillRect(sx + (rnd() - .5) * spread * 2, yy, 8 + rnd() * 50, 2); }
    x.globalAlpha = 1;
    // ели на переднем плане
    x.fillStyle = '#07060f';
    const tree = (tx, ty, th) => { for (let k = 0; k < 6; k++) { const w = th * (.42 - k * .055), y0 = ty - th * k * .15; x.beginPath(); x.moveTo(tx - w / 2, y0); x.lineTo(tx, y0 - th * .32); x.lineTo(tx + w / 2, y0); x.fill(); } x.fillRect(tx - th * .02, ty, th * .04, th * .06); };
    x.beginPath(); x.moveTo(0, H); x.lineTo(0, H * .84);
    for (let i = 0; i <= 40; i++) { const t = i / 40; x.lineTo(t * W * .46, H * (.84 + t * t * .17) + (rnd() - .5) * H * .006); }
    x.lineTo(W * .46, H); x.fill();
    for (let i = 0; i < 24; i++) { const t = i / 24; tree(W * (t * .42 + rnd() * .012), H * (.85 + t * t * .16), H * (.25 - t * .18 + rnd() * .05)); }
    // зерно плёнки
    const n = mk(256, 256), nx = n.getContext('2d'), id = nx.createImageData(256, 256);
    for (let i = 0; i < id.data.length; i += 4) { const v = rnd() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 22; }
    nx.putImageData(id, 0, 0); x.globalCompositeOperation = 'overlay'; x.fillStyle = x.createPattern(n, 'repeat'); x.fillRect(0, 0, W, H);
    // «исходник»: плоский и холодный — чтобы правка в Camera Raw была заметна
    x.globalCompositeOperation = 'saturation'; x.globalAlpha = .45; x.fillStyle = '#808080'; x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = .2; x.fillStyle = '#6f84a6'; x.fillRect(0, 0, W, H); x.globalAlpha = 1;
    return c;
  }
  const W = 3000, H = 2000, b = snapDoc();
  addLayer(scene(W, H), 'Горы на закате'); commitDoc('Открыть: горы.jpg', b);
  const P = cur();
  P.adj = { ex: .15, co: 22, hi: -18, sh: 24, vi: 45, sa: 10, ti: 6, te: 32,
    g: [{ h: 228, s: 22, l: -4 }, { h: 0, s: 0, l: 0 }, { h: 38, s: 28, l: 6 }] };
  applyAdj(P); thumb(P);
  for (const f of ['700 80px "Unbounded"', '400 80px "Montserrat"', '700 80px "Montserrat"']) await document.fonts.load(f, 'АлтайAa0');
  setTool('text');
  Object.assign(textOpt, { font: 'Unbounded', size: 250, bold: true, color: '#ffffff', align: 'left' });
  createText({ x: 300, y: 420 }); ta.value = 'АЛТАЙ'; ta.oninput(); endTextEdit();
  Object.assign(textOpt, { font: 'Montserrat', size: 78, bold: false, color: '#ffe3c4' });
  createText({ x: 318, y: 640 }); ta.value = 'Высота 3 200 м  ·  июль'; ta.oninput(); endTextEdit();
  layers[layers.length - 1].opacity = .92;
  setTool('move'); sel = 1; fitView(); refreshAll();
  $('#toast').style.display = 'none';
  await new Promise(r => setTimeout(r, 600));
});

// 1. главный экран
await shot('hero', { x: 0, y: 0, width: 1600, height: 1000 }, 88);

// 2. слои и Camera Raw крупно
const rects = await ev(async () => {
  sel = 0; refreshAll(); const secs = document.querySelectorAll('.sec');
  secs[1].classList.add('collapsed'); await new Promise(r => setTimeout(r, 300));
  const R = el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
  return { layers: R(secs[0]), raw: R(secs[2]), wheels: R(secs[3]) };
});
await shot('layers', rects.layers); await shot('raw', rects.raw); await shot('wheels', rects.wheels);

// 3. кадрирование 4:5
await ev(async () => {
  document.querySelectorAll('.sec')[1].classList.remove('collapsed'); sel = 1; refreshAll();
  setTool('crop'); $('#cRatio').value = '4:5'; $('#cRatio').onchange(); resetCrop();
  const c = crop, k = .82; crop = { x: c.x + c.w * (1 - k) * .75, y: c.y + c.h * (1 - k) * .4, w: c.w * k, h: c.h * k }; updateCropUI(); renderOverlay();
});
await shot('crop', { x: 0, y: 0, width: 1296, height: 1000 });

// 4. выделение овалом вокруг солнца
await ev(async () => {
  setTool('select'); setSelMode('ellipse'); sel = 0; refreshAll();
  setSelection([{ type: 'ellipse', op: 'add', x: 1920 - 290, y: 940 - 290, w: 580, h: 580 }]);
});
await shot('select', { x: 0, y: 0, width: 1296, height: 1000 });

// 5. редактирование текста прямо на фото
await ev(async () => {
  setSelection([]); setTool('text'); const T = layers[1]; sel = 1; refreshAll(); startTextEdit(T, false);
  await new Promise(r => setTimeout(r, 200)); ta.setSelectionRange(5, 5);
});
await shot('text', { x: 0, y: 0, width: 1296, height: 1000 });
await ev(() => endTextEdit());

// 6. до / после — сама картинка
const ba = await ev(async () => {
  const P = layers[0], adj = JSON.parse(JSON.stringify(P.adj));
  const out = () => { const c = compositeCanvas([P]), s = mk(2400, 1600); const x = s.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, 2400, 1600); return s.toDataURL('image/jpeg', .86); };
  const after = out(); P.adj = newAdj(); applyAdj(P); const before = out(); P.adj = adj; applyAdj(P);
  return { before, after };
});
for (const k of ['before', 'after']) { writeFileSync(`${OUT}/${k}.jpg`, Buffer.from(ba[k].split(',')[1], 'base64')); console.log('saved', k); }

ws.close(); chrome.kill(); process.exit(0);
