/**
 * tools/contrast-check.js —— 设计令牌对比度验证（第五份任务书 4.3）
 *
 * 从 css/app.css 的 :root 解析变量值，按 WCAG 2.1 相对亮度公式算对比度。
 * 规则：正文组合 ≥4.5:1；非关键文字（--ink-3 类）≥3:1。不达标退出码 1。
 * 用法：node tools/contrast-check.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

function parseTokens(css) {
  const out = {};
  const m = css.match(/:root\s*\{([^}]+)\}/g) || [];
  for (const block of m) {
    for (const line of block.split('\n')) {
      const kv = line.match(/--([\w-]+)\s*:\s*([^;]+);/);
      if (kv) out['--' + kv[1]] = kv[2].trim();
    }
  }
  return out;
}

function resolve(tokens, v) {
  // var(--x) 引用解析（一层链 + var() 内 fallback）
  let s = v, guard = 0;
  while (guard++ < 10) {
    const m = s.match(/^var\((--[\w-]+)\)$/);
    if (!m) break;
    s = tokens[m[1]] || '';
  }
  return s;
}

function hexToRgb(s) {
  const h = s.replace('#', '').trim();
  if (/^[0-9a-f]{3}$/i.test(h)) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  if (/^[0-9a-f]{6}$/i.test(h)) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice( 4, 6), 16)];
  }
  return null;
}

function lum(rgb) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}

function ratio(fg, bg) {
  const a = lum(fg), b = lum(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = [255, 255, 255];

function main() {
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'app.css'), 'utf8');
  const t = parseTokens(css);
  const val = (name) => resolve(t, t[name] || '');

  // [组合名, 前景令牌, 背景令牌(空=白), 最低要求, 级别说明]
  const pairs = [
    ['正文 --ink / --bg', val('--ink'), val('--bg'), 4.5, '正文'],
    ['次要文字 --ink-2 / --bg', val('--ink-2'), val('--bg'), 4.5, '正文'],
    ['次要文字 --ink-2 / --surface', val('--ink-2'), val('--surface'), 4.5, '正文'],
    ['主按钮字 --on-brand / --brand', val('--on-brand'), val('--brand'), 4.5, '正文'],
    ['品牌色文字 --brand / --surface', val('--brand'), val('--surface'), 4.5, '正文/图标'],
    ['品牌色文字 --brand / --brand-weak', val('--brand'), val('--brand-weak'), 3.0, '大字/图标'],
    ['非关键 --ink-3 / --bg', val('--ink-3'), val('--bg'), 3.0, '仅非关键'],
    ['危险 --danger / --surface', val('--danger'), val('--surface'), 4.5, '正文'],
    ['成功 --ok / --surface', val('--ok'), val('--surface'), 4.5, '正文'],
    ['警告 --warn / --surface', val('--warn'), val('--surface'), 4.5, '正文'],
    ['标签栏未选中 --ink-3 / 白底(0.92)', val('--ink-3'), '#FFFFFF', 3.0, '非关键'],
  ];

  console.log('组合 | 前景 | 背景 | 对比度 | 要求 | 结果');
  console.log('--- | --- | --- | --- | --- | ---');
  let fail = 0;
  for (const [name, fgV, bgV, need] of pairs) {
    const fg = hexToRgb(fgV), bg = hexToRgb(bgV) || WHITE;
    if (!fg) { console.log(name + ' | ' + fgV + ' | ' + bgV + ' | 解析失败 | ' + need + ' | ✗'); fail++; continue; }
    const r = ratio(fg, bg);
    const ok = r >= need;
    if (!ok) fail++;
    console.log(name + ' | ' + fgV + ' | ' + bgV + ' | ' + r.toFixed(2) + ':1 | ≥' + need + ' | ' + (ok ? '✓' : '✗ 不达标'));
  }
  console.log('\n共 ' + pairs.length + ' 组，不达标 ' + fail + ' 组（WCAG 2.1；正文 4.5 / 非关键 3.0）');
  process.exit(fail ? 1 : 0);
}

main();
