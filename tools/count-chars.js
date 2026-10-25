/**
 * count-chars.js —— 申报书填写稿逐栏字数统计（第五份任务书 3.2-7）
 *
 * 字数规则：去掉所有空白后按字符（Unicode 码点）计数，含标点/数字/字母各算 1。
 * 解析格式：`## 标题…（限 N 字）` 标题后的第一个 ``` 围栏块视为该栏定稿；
 * 无（限 N 字）的栏目（如作品全称、分类）自动跳过。
 * 有任何一栏超限 → 退出码 1（可作为提交前检查）。
 *
 * 用法：node tools/count-chars.js [填写稿路径=docs/申报书_B3填写稿.md]
 */
'use strict';

const fs = require('fs');
const path = require('path');

function countChars(text) {
  return Array.from(String(text == null ? '' : text).replace(/\s+/g, '')).length;
}

/** 解析填写稿：返回 [{title, limit, text}]。 */
function parse(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let cur = null;
  let inFence = false;
  let buf = [];
  for (const line of lines) {
    const h = line.match(/^##\s+(.+?)（限\s*(\d+)\s*字）/);
    if (h && !inFence) {
      cur = { title: h[1].replace(/^[\d.、\s]+/, '').trim(), limit: Number(h[2]) };
      continue;
    }
    if (/^```/.test(line.trim())) {
      if (inFence) {
        if (cur) { cur.text = buf.join('\n'); out.push(cur); cur = null; buf = []; }
        inFence = false;
      } else {
        inFence = true;
        buf = [];
      }
      continue;
    }
    if (inFence) buf.push(line);
  }
  return out;
}

function main() {
  const file = process.argv[2] || path.join(__dirname, '..', 'docs', '申报书_B3填写稿.md');
  const md = fs.readFileSync(file, 'utf8');
  const rows = parse(md);
  if (!rows.length) {
    console.error('没解析到任何「（限 N 字）+ 围栏块」栏——检查标题格式是否为：## 标题（限 200 字）');
    process.exit(2);
  }
  console.log('栏目 | 字数 | 上限 | 合格');
  console.log('--- | --- | --- | ---');
  let fail = 0;
  for (const r of rows) {
    const n = countChars(r.text);
    const ok = n <= r.limit;
    if (!ok) fail += 1;
    console.log(r.title + ' | ' + n + ' | ' + r.limit + ' | ' + (ok ? '✓' : '✗ 超限'));
  }
  console.log('\n共 ' + rows.length + ' 栏，超限 ' + fail + ' 栏（字数规则：去空白按码点计）');
  process.exit(fail ? 1 : 0);
}

main();
