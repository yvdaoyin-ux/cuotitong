/**
 * tools/u1-screenshots.js —— U1 关口验收截图：主页在 360/375/390/414 四宽度（真 Emulation）
 * 用法：node tools/u1-screenshots.js （需先 node build/make-dist.js）
 */
'use strict';
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'dist', '错题通-单文件.html');
const OUT = path.join(ROOT, 'docs', 'ui', 'u1');
const PORT = 9228;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const WIDTHS = [360, 375, 390, 414];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  for (let i = 0; i < 50; i++) {
    try { return await (await fetch(url)).json(); } catch (e) { await sleep(200); }
  }
  throw new Error('CDP 连不上');
}
let msgId = 0;
const pending = new Map();
function send(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
async function evaluate(ws, expression) {
  const r = await send(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('页面异常：' + JSON.stringify(r.exceptionDetails.exception || {}).slice(0, 200));
  return r.result.value;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qt-u1-'));
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
    'file:///' + encodeURI(APP.replace(/\\/g, '/')) + '#/home'
  ], { stdio: 'ignore' });

  try {
    const list = await fetchJson('http://127.0.0.1:' + PORT + '/json/list');
    const page = list.find((t) => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id); pending.delete(m.id);
        m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
      }
    };
    await send(ws, 'Runtime.enable');
    await send(ws, 'Page.enable');
    await sleep(800);
    await evaluate(ws, 'QT.sampleData.load()');

    for (const w of WIDTHS) {
      await send(ws, 'Emulation.setDeviceMetricsOverride', { width: w, height: 740, deviceScaleFactor: 2, mobile: true });
      await sleep(600);
      const r = await send(ws, 'Page.captureScreenshot', { format: 'png' });
      const file = path.join(OUT, 'home-' + w + '.png');
      fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
      // 溢出检查（4.2-5：无横向溢出）
      const overflow = await evaluate(ws, 'document.documentElement.scrollWidth - window.innerWidth');
      console.log('  ✓ home-' + w + '.png（' + (r.data.length * 0.75 / 1024).toFixed(0) + 'KB，横向溢出 ' + overflow + 'px）');
      if (overflow > 0) process.exitCode = 1;
    }
    console.log('\nU1 验收截图完成：docs/ui/u1/home-{360,375,390,414}.png');
    process.exit(process.exitCode || 0);
  } finally {
    try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }); } catch (e) {}
    try {
      const out = execSync('netstat -ano | findstr ":' + PORT + '" | findstr LISTENING', { encoding: 'utf8' });
      const m = out.match(/\s(\d+)\s*$/m);
      if (m) { try { execSync('taskkill /PID ' + m[1] + ' /T /F', { stdio: 'ignore' }); } catch (e) {} }
    } catch (e) {}
    await sleep(400);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
}

main().catch((e) => { console.error('失败：' + e.message); process.exit(1); });
