/**
 * tests/symbols.test.js —— 公式工具栏纯函数 + 符号表完整性（阶段 2）
 *
 * 任务书 2 节验收：至少 20 项，覆盖有/无选中、公式内外、多个占位符、
 * 占位符跳转、首尾边界、连续插入、残留占位符检测；
 * **symbols.js 中每一个 insert 都必须能被 KaTeX 无错误渲染**（▮→x 后逐项渲染）。
 */
'use strict';

const assert = require('node:assert');
const path = require('node:path');

global.QT = {};
require(path.join(__dirname, '..', 'js', 'util.js'));
require(path.join(__dirname, '..', 'js', 'mathtext.js'));
require(path.join(__dirname, '..', 'js', 'symbols.js'));
// 每个符号都要能被 KaTeX 渲染 —— 直接 require UMD 版
const katex = require(path.join(__dirname, '..', 'lib', 'katex.min.js'));

const QT = global.QT;
const S = QT.symbols;
const PH = S.PH;

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try { fn(); passed += 1; console.log('  ✓ ' + name); }
  catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.log('  ✗ ' + name);
    console.log('    ' + String(err.message).split('\n').join('\n    '));
  }
}
function group(name, fn) { console.log('\n' + name); fn(); }

/* ---------------- insertAt 基础 ---------------- */

group('insertAt · 无占位符命令', () => {
  test('光标在中间插入，光标停在插入文本末尾', () => {
    const r = S.insertAt('ab', 1, 1, '\\cdot', true);
    assert.strictEqual(r.text, 'a\\cdotb');
    assert.strictEqual(r.selStart, 6);
    assert.strictEqual(r.selEnd, 6);
  });
  test('空文本、光标 0（首边界）', () => {
    const r = S.insertAt('', 0, 0, '\\infty', true);
    assert.strictEqual(r.text, '\\infty');
    assert.strictEqual(r.selStart, 6);
  });
  test('光标在末尾（尾边界）', () => {
    const r = S.insertAt('x', 1, 1, '\\to', true);
    assert.strictEqual(r.text, 'x\\to');
    assert.strictEqual(r.selEnd, r.text.length);
  });
  test('非公式区（insideMath=false）自动包 $…$', () => {
    const r = S.insertAt('求 ', 2, 2, '\\int_{a}^{b}', false);
    assert.strictEqual(r.text, '求 $\\int_{a}^{b}$');
  });
  test('公式区内（insideMath=true）不包 $', () => {
    const r = S.insertAt('$x$', 2, 2, '\\cdot', true);
    assert.strictEqual(r.text, '$x\\cdot$');
  });
  test('$…$ 按钮本身以 $ 开头，永不双重包裹（无选中时 ▮ 保留）', () => {
    const r = S.insertAt('abc', 3, 3, '$' + PH + '$', false);
    assert.strictEqual(r.text, 'abc$' + PH + '$');
    assert.strictEqual(r.selStart, 4); // 选中 ▮
    // 有选中：包住选中内容
    const r2 = S.insertAt('x+1', 0, 3, '$' + PH + '$', false);
    assert.strictEqual(r2.text, '$x+1$');
  });
  test('selStart > selEnd 时钳到同一位置（textarea 不会出现反向选区，防御而已）', () => {
    const r = S.insertAt('abcd', 3, 1, '\\cdot', true);
    assert.strictEqual(r.text, 'abc\\cdotd'); // 选区钳到 [3,3)，在 c 与 d 之间插入
  });
  test('越界光标被钳制到文本长度', () => {
    const r = S.insertAt('ab', 99, 99, '\\times', true);
    assert.strictEqual(r.text, 'ab\\times');
  });
});

group('insertAt · 占位符与选中内容', () => {
  test('根号：无选中 → 插入后选中 ▮', () => {
    const r = S.insertAt('', 0, 0, '\\sqrt{' + PH + '}', false);
    assert.strictEqual(r.text, '$\\sqrt{' + PH + '}$');
    // ▮ 在 "$\sqrt{" 之后：1 + 6 = 7
    assert.strictEqual(r.selStart, 7);
    assert.strictEqual(r.selEnd, 8);
  });
  test('根号：有选中 → 选中内容放进 ▮，光标到插入末尾', () => {
    const r = S.insertAt('求 x+1 的值', 2, 5, '\\sqrt{' + PH + '}', false);
    assert.strictEqual(r.text, '求 $\\sqrt{x+1}$ 的值');
    assert.strictEqual(r.selStart, r.text.indexOf(' 的值'));
  });
  test('分数：选中文本进第一个 ▮，第二个 ▮ 保持并被选中', () => {
    const r = S.insertAt('', 0, 0, '\\frac{' + PH + '}{' + PH + '}', false);
    // 无选中：第一个 ▮ 被选中
    const firstPh = r.text.indexOf(PH);
    assert.strictEqual(r.selStart, firstPh);
    assert.strictEqual(r.selEnd, firstPh + 1);
  });
  test('分数：有选中 → 第一 ▮ 填入，光标选中第二个 ▮', () => {
    const r = S.insertAt('y', 0, 1, '\\frac{' + PH + '}{' + PH + '}', false);
    assert.ok(r.text.startsWith('$\\frac{y}{'));
    const secondPh = r.text.indexOf(PH);
    assert.ok(secondPh > 0);
    assert.strictEqual(r.selStart, secondPh);
  });
  test('2×2 矩阵 4 个占位符：无选中时选中第一个', () => {
    const tpl = '\\begin{pmatrix}' + PH + '&' + PH + '\\\\' + PH + '&' + PH + '\\end{pmatrix}';
    const r = S.insertAt('', 0, 0, tpl, false);
    assert.strictEqual(S.countPlaceholders(r.text), 4);
    assert.strictEqual(r.selStart, r.text.indexOf(PH));
  });
  test('连续插入：分数 → 填分子 → 跳转 → 填分母，文本正确', () => {
    let st = { text: '', selStart: 0, selEnd: 0 };
    st = S.insertAt(st.text, st.selStart, st.selEnd, '\\frac{' + PH + '}{' + PH + '}', false);
    // 模拟打字替换选中的 ▮
    st.text = st.text.slice(0, st.selStart) + 'a' + st.text.slice(st.selEnd);
    const ph = S.nextPlaceholder(st.text, st.selStart + 1);
    st.selStart = ph.start; st.selEnd = ph.end;
    st.text = st.text.slice(0, st.selStart) + 'b' + st.text.slice(st.selEnd);
    assert.strictEqual(st.text, '$\\frac{a}{b}$');
  });
  test('回归（基准脚本抓到的光标偏移 bug）：非空文本 + 有选中 + 多占位符，第二个 ▮ 的选区必须落在全文正确位置', () => {
    // 真实场景：在非空文本的公式里选中 X，点分数，选中内容进第一个 ▮，
    // 光标应落在第二个 ▮ 的**全文**位置（修复前会错到 inserted 内的偏移、乱跳到文首）
    const r = S.insertAt('设 $X$', 3, 4, '\\frac{' + PH + '}{' + PH + '}', true);
    assert.strictEqual(r.text, '设 $\\frac{X}{' + PH + '}$');
    assert.strictEqual(r.selStart, r.text.indexOf(PH));
    assert.strictEqual(r.selEnd, r.selStart + 1);
    // 再来一个：$…$ 留下的 ▮ 被选中，点 P(·)（单占位符）
    const r2 = S.insertAt('设 $X$', 3, 4, 'P(' + PH + ')', true);
    assert.strictEqual(r2.text, '设 $P(X)$');
  });
  test('回归（基准脚本抓到的 $$ 粘连）：无 ▮ 模板自动包 $ 后，光标停在闭 $ 之前（公式内）', () => {
    const r = S.insertAt('证明 ', 3, 3, '\\sum_{n=1}^{\\infty}', false);
    assert.strictEqual(r.text, '证明 $\\sum_{n=1}^{\\infty}$');
    assert.strictEqual(r.selStart, r.text.length - 1, '光标应在闭 $ 之前，方便继续插入');
    // 接着插入分数：不会再包第二对 $
    const r2 = S.insertAt(r.text, r.selStart, r.selEnd, '\\frac{' + PH + '}{' + PH + '}', true);
    assert.strictEqual(r2.text, '证明 $\\sum_{n=1}^{\\infty}\\frac{' + PH + '}{' + PH + '}$');
  });
});

group('nextPlaceholder / hasResidual / countPlaceholders', () => {
  test('从光标处向后找下一个 ▮', () => {
    const t = 'a' + PH + 'b' + PH;
    assert.deepStrictEqual(S.nextPlaceholder(t, 2), { start: 3, end: 4 });
  });
  test('后面没有时回到开头找（循环补齐）', () => {
    const t = PH + 'x';
    assert.deepStrictEqual(S.nextPlaceholder(t, 2), { start: 0, end: 1 });
  });
  test('全文无 ▮ 返回 null', () => {
    assert.strictEqual(S.nextPlaceholder('abc', 0), null);
  });
  test('hasResidual 真/假', () => {
    assert.strictEqual(S.hasResidual('x^' + PH), true);
    assert.strictEqual(S.hasResidual('x^2'), false);
    assert.strictEqual(S.hasResidual(''), false);
  });
  test('countPlaceholders：0 / 2 / 4', () => {
    assert.strictEqual(S.countPlaceholders('\\cdot'), 0);
    assert.strictEqual(S.countPlaceholders(PH + PH), 2);
    assert.strictEqual(S.countPlaceholders(PH + PH + PH + PH), 4);
  });
});

group('符号表完整性（任务书：一项渲染失败就不通过）', () => {
  test('分组顺序与任务书一致', () => {
    assert.deepStrictEqual(S.GROUPS, ['常用', '微积分', '线代', '概率统计', '集合逻辑', '希腊']);
  });
  test('数据表每项都有 group / tip / insert，tip 不重复', () => {
    const tips = {};
    S.SYMBOLS.forEach((s) => {
      assert.ok(s.group && s.tip && s.insert, '缺字段: ' + JSON.stringify(s));
      assert.ok(!tips[s.tip], 'tip 重复: ' + s.tip);
      tips[s.tip] = true;
    });
  });
  test('**每一个 insert 把 ▮ 换成 x 后都能被 KaTeX 无错误渲染**（共 ' +
    S.SYMBOLS.length + ' 项）', () => {
    const bad = [];
    S.SYMBOLS.forEach((s) => {
      try {
        katex.renderToString(S.texOf(s), { throwOnError: true });
      } catch (e) {
        bad.push(s.tip + ' (' + S.texOf(s) + '): ' + e.message);
      }
    });
    assert.strictEqual(bad.length, 0, '渲染失败的符号:\n' + bad.join('\n'));
  });
  test('texOf：默认 ▮→x，希腊字母用显式 tex 覆盖', () => {
    assert.strictEqual(S.texOf({ insert: '\\sqrt{' + PH + '}' }), '\\sqrt{x}');
    const alpha = S.SYMBOLS.filter((s) => s.tip === 'alpha α')[0];
    assert.strictEqual(S.texOf(alpha), '\\alpha');
  });
  test('上标/下标等裸命令在公式外自动包 $ 后，经 mathtext.renderRich 渲染无错误', () => {
    // 模拟「文本区点 上标」：insertAt 自动包 $，整串文本用 renderRich 渲染
    const r = S.insertAt('x', 1, 1, '^{' + PH + '}', false);
    const rendered = QT.mathtext.renderRich(r.text.split(PH).join('2'));
    assert.strictEqual(rendered.errors.length, 0, '不应有公式错误: ' + JSON.stringify(rendered.errors));
  });
});

console.log('\n' + '-'.repeat(52));
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
if (failed > 0) {
  failures.forEach((f) => console.log('  · ' + f.name));
  process.exit(1);
}
console.log('全部通过 ✓');
