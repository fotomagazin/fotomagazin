// Проверка сайта по разделам: node tools/site-check.mjs http://127.0.0.1:8766/ /tmp/shots 1440 900 /tmp/fm-chrome2
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const [, , URL, OUT, W, H, PROFILE] = process.argv;
mkdirSync(OUT, { recursive: true });
const PORT = 9334, sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let target; for (let i = 0; i < 60 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page'); } catch { } if (!target) await sleep(250); }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(), waiters = [];
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method) waiters.filter(w => w.m === d.method).forEach(w => { waiters.splice(waiters.indexOf(w), 1); w.r(d.params); }); };
const send = (method, params = {}) => new Promise(ok => { const i = ++id; pend.set(i, d => ok(d.result || d)); ws.send(JSON.stringify({ id: i, method, params })); });
const once = m => new Promise(r => waiters.push({ m, r }));
const ev = async e => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
const mobile = +W < 600;
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: mobile ? 2 : 1, mobile });
await send('Page.enable'); const l = once('Page.loadEventFired'); await send('Page.navigate', { url: URL }); await l; await sleep(1500);
const shots = [['top', 'window.scrollTo(0,0)', 1200], ['flat', 'window.scrollTo(0, innerHeight*.75)', 1400], ['statement', "document.querySelector('.statement').scrollIntoView({block:'center'})", 1800],
  ['styles', "document.querySelector('#stDemo').scrollIntoView({block:'center'})", 3000], ['styles-duo', "document.querySelector('#styles .duo').scrollIntoView({block:'center'})", 1800],
  ['layers', "document.querySelector('#layers .grid2').scrollIntoView({block:'center'})", 2200], ['raw', "document.querySelector('#ba').scrollIntoView({block:'center'})", 4200],
  ['duo', "document.querySelector('#raw .duo').scrollIntoView({block:'center'})", 1800],
  ['curves', "document.querySelector('#curves .grid2').scrollIntoView({block:'center'})", 2200], ['fx', "document.querySelector('.fx-grid').scrollIntoView({block:'center'})", 2000], ['crop', "document.querySelector('#cropDemo').scrollIntoView({block:'center'})", 2000],
  ['select', "document.querySelector('#selDemo').scrollIntoView({block:'center'})", 4400], ['text', "document.querySelector('#textDemo').scrollIntoView({block:'center'})", 2600],
  ['export', "document.querySelector('#export .grid2').scrollIntoView({block:'center'})", 2200], ['tools', "document.querySelector('.tab-stage').scrollIntoView({block:'center'})", 2000], ['bento', "document.querySelector('.bento').scrollIntoView({block:'start'})", 2000],
  ['together', "document.querySelector('#together').scrollIntoView({block:'start'})", 2000], ['roadmap', "document.querySelector('.roadmap').scrollIntoView({block:'center'})", 1800], ['privacy', "document.querySelector('.privacy').scrollIntoView({block:'center'})", 1800], ['download', "document.querySelector('#download').scrollIntoView({block:'start'})", 2000],
  ['faq', "document.querySelector('#faq details').open=true; document.querySelector('#faq').scrollIntoView({block:'start'})", 1800]];
for (const [name, js, ms] of shots) { await ev(js); await sleep(ms); const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(r.data, 'base64')); }
console.log('errors:', await ev('JSON.stringify(window.__errs||[])'));
ws.close(); chrome.kill(); process.exit(0);
