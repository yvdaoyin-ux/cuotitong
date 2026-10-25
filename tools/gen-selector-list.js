/**
 * tools/gen-selector-list.js —— 生成 docs/ui/选择器清单.md（U0 关口，界面升级契约）
 *
 * 每个关口收尾时重跑：node tools/gen-selector-list.js
 * 与已提交版本 diff——只允许新增，不允许减少（第五份任务书 4.2-2 硬约束）。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const jsFiles = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
const testFiles = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.js'));

const ids = new Map();
const dataAttrs = new Set();
const classes = new Set();

function push(map, k, f) {
  if (!map.has(k)) map.set(k, []);
  if (!map.get(k).includes(f)) map.get(k).push(f);
}

function scan(t, f) {
  for (const m of t.matchAll(/getElementById\('([^']+)'\)/g)) push(ids, m[1], f);
  for (const m of t.matchAll(/querySelector(All)?\('#([a-zA-Z][\w-]*)/g)) push(ids, m[2], f);
  for (const m of t.matchAll(/'#([a-zA-Z][\w-]*)( |,|'|\)|:)/g)) push(ids, m[1], f);
  for (const m of t.matchAll(/data-([a-z]+)/g)) dataAttrs.add('data-' + m[1]);
  for (const m of t.matchAll(/querySelector(All)?\('\.([\w-]+)/g)) classes.add(m[2]);
  for (const m of t.matchAll(/classList\.(add|remove|toggle)\('([\w-]+)/g)) classes.add(m[2]);
}

jsFiles.forEach((f) => scan(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), 'js/' + f));
testFiles.forEach((f) => scan(fs.readFileSync(path.join(ROOT, 'tests', f), 'utf8'), 'tests/' + f));

const lines = [];
lines.push('# UI 选择器清单（U0 关口 · 界面升级期间的契约）');
lines.push('');
lines.push('> 生成命令：`node tools/gen-selector-list.js`');
lines.push('> 硬约束（第五份任务书 4.2-2）：**不得删除或重命名任何 JS 在用的 id / data-* / class**；');
lines.push('> 界面升级只允许新增 class / 替换图标与结构。**每个关口完工后重新生成并与本文件 diff——只允许新增，不允许减少。**');
lines.push('');
lines.push('## 一、id（' + ids.size + ' 个，含测试引用）');
lines.push('');
lines.push('| id | 使用处 |');
lines.push('|---|---|');
for (const k of [...ids.keys()].sort()) lines.push('| `' + k + '` | ' + ids.get(k).join(', ') + ' |');
lines.push('');
lines.push('## 二、data-* 属性（' + dataAttrs.size + ' 个）');
lines.push('');
lines.push([...dataAttrs].sort().map((s) => '- `' + s + '`').join('\n'));
lines.push('');
lines.push('## 三、JS 查询/操作的 class（' + classes.size + ' 个）');
lines.push('');
lines.push([...classes].sort().map((s) => '- `.' + s + '`').join('\n'));
lines.push('');

fs.writeFileSync(path.join(ROOT, 'docs', 'ui', '选择器清单.md'), lines.join('\n'), 'utf8');
console.log('生成 docs/ui/选择器清单.md：id ' + ids.size + ' / data-* ' + dataAttrs.size + ' / class ' + classes.size);
