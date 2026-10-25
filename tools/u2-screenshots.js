/**
 * tools/u2-screenshots.js —— U2 验收截图：录题页（极速/带缩略图/工具栏展开）+ 错题本
 * 用法：node tools/u2-screenshots.js（需先 build）
 */
'use strict';
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'dist', '错题通-单文件.html');
const OUT = path.join(ROOT, 'docs', 'ui', 'u2');
const PORT = 9229;
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qt-u2-'));
  const child = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
    'file:///' + encodeURI(APP.replace(/\\/g, '/')) + '#/entry'
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
    await send(ws, 'Emulation.setDeviceMetricsOverride', { width: 375, height: 740, deviceScaleFactor: 2, mobile: true });
    await sleep(900);

    await shot(ws, path.join(OUT, 'entry-quick.png'));

    // 注入一张假照片（canvas 生成 → File → addFiles，与真实拍照同管线）
    await evaluate(ws, `(async function(){
      var c = document.createElement('canvas'); c.width = 1600; c.height = 1000;
      var x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0,0,1600,1000);
      x.fillStyle = '#111'; x.font = '60px sans-serif';
      for (var i = 0; i < 8; i++) x.fillText('设函数 f(x)=' + (i+1) + 'x^2，求导数与积分的第 ' + (i+1) + ' 行题目文字', 80, 140 + i*100);
      var blob = await new Promise(function (r) { c.toBlob(r, 'image/jpeg', 0.8); });
      var f = new File([blob], 'demo.jpg', { type: 'image/jpeg' });
      await QT.entryPhoto.addFiles([f]);
    })()`);
    await sleep(800);
    await shot(ws, path.join(OUT, 'entry-with-photo.png'));

    // 展开详细填写 + 聚焦题干 → 公式工具栏弹出
    await evaluate(ws, `(function(){
      var t = document.getElementById('toggle-detail');
      if (t && document.getElementById('detail-panel').hidden) t.click();
    })()`);
    await sleep(300);
    await evaluate(ws, `(function(){
      var s = document.getElementById('f-stem');
      s.focus();
      s.dispatchEvent(new Event('focusin', { bubbles: true }));
    })()`);
    await sleep(700);
    await shot(ws, path.join(OUT, 'entry-toolbar.png'));

    await evaluate(ws, "location.hash='#/list'");
    await sleep(900);
    await shot(ws, path.join(OUT, 'list.png'));

    console.log('\nU2 验收截图完成：docs/ui/u2/');
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
