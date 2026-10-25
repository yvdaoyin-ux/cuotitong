/** tools/u3-screenshots.js —— U3 验收截图：诊断（含雷达展开）、组卷 setup、设置 */
'use strict';
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'dist', '错题通-单文件.html');
const OUT = path.join(ROOT, 'docs', 'ui', 'u3');
const PORT = 9230;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  for (let i = 0; i < 50; i++) { try { return await (await fetch(url)).json(); } catch (e) { await sleep(200); } }
  throw new Error('CDP 连不上');
}
let msgId = 0; const pending = new Map();
function send(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId; pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
async function evaluate(ws, expression) {
  const r = await send(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('页面异常：' + JSON.stringify(r.exceptionDetails.exception || {}).slice(0, 300));
  return r.result.value;
}
async function shot(ws, file) {
  const r = await send(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log('  ✓ ' + path.basename(file));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qt-u3-'));
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
    'file:///' + encodeURI(APP.replace(/\\/g, '/')) + '#/diag'
  ], { stdio: 'ignore' });
  try {
    const list = await fetchJson('http://127.0.0.1:' + PORT + '/json/list');
    const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
    };
    await send(ws, 'Runtime.enable'); await send(ws, 'Page.enable');
    await send(ws, 'Emulation.setDeviceMetricsOverride', { width: 375, height: 800, deviceScaleFactor: 2, mobile: true });
    await sleep(900);
    await evaluate(ws, 'QT.sampleData.load()');
    await evaluate(ws, "location.hash='#/home'");
    await sleep(500);
    await evaluate(ws, "location.hash='#/diag'"); // 换 hash 强制重渲染
    await sleep(1800); // ECharts 按需加载 + 渲染
    await shot(ws, path.join(OUT, 'diag-rank.png')); // 顶部：结论 + 排行

    // 滚到雷达图并展开
    await evaluate(ws, `(function(){
      var d = document.querySelector('details.card--fold');
      if (d) d.open = true;
      if (d) d.scrollIntoView({ block: 'start' });
    })()`);
    await sleep(1200);
    await shot(ws, path.join(OUT, 'diag-radar-open.png'));

    await evaluate(ws, "location.hash='#/quiz'");
    await sleep(800);
    await shot(ws, path.join(OUT, 'quiz-setup.png'));

    await evaluate(ws, "location.hash='#/settings'");
    await sleep(700);
    await shot(ws, path.join(OUT, 'settings.png'));

    process.exit(0);
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
