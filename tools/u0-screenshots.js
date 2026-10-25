/**
 * _tmp-u0.js —— U0 关口交付：before 截图 ×6 + 图标草案预览图（用完即删）
 *
 * 截图口径：真 375×667（CDP Emulation 强制——无头 Edge 最小窗宽 ~500px，--window-size 不可信）
 * + 载入示例数据 + 逐页（home/entry/list/diag/quiz/settings）各一张。
 * 生成命令：cd 03-错题通 && node _tmp-u0.js
 */
'use strict';
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = __dirname;
const APP = path.join(ROOT, 'dist', '错题通-单文件.html');
const OUT = path.join(ROOT, 'docs', 'ui', 'before');
const PORT = 9227;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = [
  ['home', '#/home'],
  ['entry', '#/entry'],
  ['list', '#/list'],
  ['diag', '#/diag'],
  ['quiz', '#/quiz'],
  ['settings', '#/settings'],
];

/** 图标草案（第五份任务书 4.4 原路径 + 补充 edit/copy/trash/printer/close/chevron-right） */
const ICONS = [
  ['home', '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>'],
  ['book', '<path d="M5 4.5h11a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2z"/><path d="M5 18a2 2 0 0 1 2-2h11"/>'],
  ['add', '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'],
  ['chart', '<path d="M5 20V11M12 20V5M19 20v-8"/>'],
  ['target', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>'],
  ['sliders', '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'],
  ['camera', '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'],
  ['image', '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M4 17l5-4 4 3 3-2 4 3"/>'],
  ['scan', '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8 12h8"/>'],
  ['rotate', '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>'],
  ['key', '<circle cx="8" cy="15" r="3.5"/><path d="M10.5 12.5 19 4M16 7l2.5 2.5"/>'],
  ['check', '<path d="M5 12.5l4.5 4.5L19 7.5"/>'],
  ['edit', '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M13.5 6.5l3 3"/>'],
  ['copy', '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a0 0 0 0 1 0 0V5a1 1 0 0 1 1-1h10v1"/>'],
  ['trash', '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v5M14 11v5"/>'],
  ['printer', '<path d="M7 8V4h10v4"/><rect x="4" y="8" width="16" height="8" rx="1.5"/><path d="M7 13h10v7H7z"/>'],
  ['close', '<path d="M6 6l12 12M18 6L6 18"/>'],
  ['chevron-right', '<path d="M9 5l7 7-7 7"/>'],
];

function iconPreviewHtml() {
  const cells = ICONS.map(([name, body]) =>
    '<div style="display:inline-block;width:104px;height:104px;text-align:center;border:1px solid #eee;border-radius:10px;margin:6px;font-family:system-ui">' +
    '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3A47B8" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="margin-top:22px">' + body + '</svg>' +
    '<div style="font-size:12px;color:#556;margin-top:10px">' + name + '</div></div>'
  ).join('');
  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="background:#FAF9F6;padding:20px">' +
    '<div style="font:600 16px system-ui;color:#171C26;margin-bottom:6px">图标精灵草案 · 24×24 网格 · 描边 1.75 · currentColor（此处渲染为品牌色 #3A47B8）</div>' +
    '<div style="font:12px system-ui;color:#6F7A8A;margin-bottom:12px">18 枚：home book add chart target sliders camera image scan rotate key check edit copy trash printer close chevron-right</div>' +
    cells + '</body></html>';
}

async function fetchJson(url, tries) {
  for (let i = 0; i < (tries || 50); i++) {
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
async function shot(ws, file) {
  const r = await send(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log('  ✓ ' + path.basename(file) + '（' + (r.data.length * 0.75 / 1024).toFixed(0) + 'KB）');
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qt-u0-'));
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
    await send(ws, 'Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });

    await sleep(800);
    // 载入示例数据（若已载入则跳过——幂等）
    const loaded = await evaluate(ws, '(function(){try{QT.sampleData.load();return QT.sampleData.countSample();}catch(e){return "err:"+e.message;}})()');
    console.log('示例数据：' + loaded + ' 道（带 isSample）');

    for (const [name, hash] of PAGES) {
      await evaluate(ws, "location.hash='" + hash + "'");
      await sleep(900); // ECharts/渲染
      await shot(ws, path.join(OUT, name + '.png'));
    }

    // 图标预览：临时 HTML 截图
    const iconHtml = path.join(os.tmpdir(), 'qt-icons-preview.html');
    fs.writeFileSync(iconHtml, iconPreviewHtml(), 'utf8');
    await send(ws, 'Page.navigate', { url: 'file:///' + encodeURI(iconHtml.replace(/\\/g, '/')) });
    await sleep(600);
    await shot(ws, path.join(ROOT, 'docs', 'ui', 'icons-preview.png'));
    fs.unlinkSync(iconHtml);
    console.log('\nU0 交付完成：docs/ui/before/*.png ×6 + docs/ui/icons-preview.png');
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
