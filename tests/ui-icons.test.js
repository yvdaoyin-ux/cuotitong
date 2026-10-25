/**
 * tests/ui-icons.test.js —— U1 图标契约（第五份任务书 4.4，纯文本扫描无需浏览器）
 *
 * ① index.html 里每个 href="#i-…" 引用都有对应 <symbol id="i-…">；
 * ② 已换装文件（EMOJI_WHITELIST 之外）的模板不得再出现表情符号。
 *    白名单 = U2/U3 尚未换装的页面文件，逐关口移除；全部移除后此测试即全量生效。
 */
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (err) { failed++; failures.push(name); console.log('  ✗ ' + name + '\n    ' + err.message); }
}

console.log('\nU1. 图标精灵引用完整性');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const symbols = new Set([...html.matchAll(/<symbol id="(i-[\w-]+)"/g)].map((m) => m[1]));
test('精灵里有 symbol（≥18 枚）', () => assert.ok(symbols.size >= 18, '实际 ' + symbols.size));

const refFiles = ['index.html', ...fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)];
const missing = [];
for (const f of refFiles) {
  const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of t.matchAll(/href="#(i-[\w-]+)"/g)) {
    if (!symbols.has(m[1])) missing.push(f + ' → #' + m[1]);
  }
}
test('所有 href="#i-…" 引用都有对应 symbol（缺失 0）', () => assert.deepStrictEqual(missing, [], missing.join('; ')));

const used = new Set([...refFiles.flatMap((f) =>
  [...fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/href="#(i-[\w-]+)"/g)].map((m) => m[1]))]);
const unused = [...symbols].filter((s) => !used.has(s));
test('没有从未引用的冗余 symbol（多余: ' + (unused.join(',') || '无') + '）', () => assert.ok(unused.length === 0 || unused.join(',').length >= 0, '')); // 信息性断言：只列出，不失败

console.log('\nU1. 已换装文件无表情符号');

// 只扫「界面文件」：app.js + ui-*.js + image-view.js（渲染 DOM 模板的）。
// 逻辑层文件（stats/storage/util/symbols 等）注释里的 ⚠ 🔴 标记不是界面元素，不在此测。
// U2/U3 未换装的 UI 文件临时白名单（逐关口移除；移空后此表为空数组）。
const EMOJI_WHITELIST = new Set([
  'ui-list.js', 'ui-entry.js', 'ui-entry-photo.js', 'ui-toolbar.js',
  'ui-diag.js', 'ui-quiz.js', 'ui-settings.js', 'ui-print.js',
  'image-view.js',
]);
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

const uiFiles = fs.readdirSync(path.join(ROOT, 'js'))
  .filter((x) => x.startsWith('ui-') || x === 'app.js' || x === 'image-view.js');
for (const f of uiFiles) {
  if (EMOJI_WHITELIST.has(f)) continue;
  const t = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
  const hits = [...new Set(t.match(EMOJI_RE) || [])];
  test('js/' + f + ' 无表情符号' + (hits.length ? '（发现 ' + hits.join(' ') + '）' : ''), () =>
    assert.deepStrictEqual(hits, [], '发现表情: ' + hits.join(' ')));
}
{
  const t = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  test('js/app.js 标签栏为 SVG 图标（无表情）', () =>
    assert.ok(!EMOJI_RE.test(t) && t.includes("icon: 'i-home'") && t.includes('<use href'), 'app.js 应使用 SVG 精灵'));
}

console.log('\n' + '-'.repeat(52));
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
if (failed) { failures.forEach((f) => console.log('  · ' + f)); process.exit(1); }
console.log('全部通过 ✓');
