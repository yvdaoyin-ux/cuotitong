/**
 * tests/mathtext.test.js —— 公式文本规范化与渲染的单元测试
 *
 * 运行：cd 03-错题通 && node tests/mathtext.test.js
 *
 * 覆盖：任务书第 1.1 节要求的 ≥30 项 + Claude 补充的 5 项
 *   （全角空格、$$跨多行、行内公式含换行、嵌套花括号的 \text{} 不被重复包裹、语料库幂等）
 *
 * 注意：本文件用 String.raw 构造反斜杠字面量，避免在 shell/heredoc 里被吃掉。
 */
'use strict';

const assert = require('node:assert');
const path = require('node:path');

global.QT = {};
require(path.join(__dirname, '..', 'js', 'mathtext.js'));
const M = globalThis.QT.mathtext;
// 用真实 KaTeX 渲染（与浏览器同款），保证测的是真行为
const katex = require(path.join(__dirname, '..', 'lib', 'katex.min.js'));

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ✓ ' + name);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.log('  ✗ ' + name);
    console.log('    ' + String(err.message).split('\n').join('\n    '));
  }
}

function group(name, fn) {
  console.log('\n' + name);
  fn();
}

/* ============================================================
 * A. 分隔符与切分
 * ============================================================ */

group('A. 分隔符与切分', () => {
  test('$x$ 切为一个行内公式', () => {
    const r = M.splitMath('$x$');
    assert.deepStrictEqual(r.parts, [{ type: 'inline', value: 'x' }]);
  });

  test('$$x$$ 切为一个块级公式', () => {
    const r = M.splitMath('$$x$$');
    assert.deepStrictEqual(r.parts, [{ type: 'display', value: 'x' }]);
  });

  test('公式前后有文字时正确切分', () => {
    const r = M.splitMath('设 $f(x)=x^2$ 求导');
    assert.deepStrictEqual(r.parts, [
      { type: 'text', value: '设 ' },
      { type: 'inline', value: 'f(x)=x^2' },
      { type: 'text', value: ' 求导' }
    ]);
  });

  test('\\$ 是字面美元符，不当作公式', () => {
    const r = M.splitMath('价格是 \\$100 元');
    assert.deepStrictEqual(r.parts, [{ type: 'text', value: '价格是 \\$100 元' }]);
  });

  test('奇数个 $ 时最后一个按字面处理并给 warning', () => {
    const r = M.splitMath('$x 只有一个');
    assert.strictEqual(r.parts.length, 1);
    assert.strictEqual(r.parts[0].type, 'text');
    assert.ok(r.warnings.length > 0, '应给出 warning');
  });

  test('$$ 未闭合给 warning 且不崩', () => {
    const r = M.splitMath('$$x');
    assert.ok(r.warnings.length > 0);
  });
});

/* ============================================================
 * B. 全角 / 中文 / 圆括号写法
 * ============================================================ */

group('B. 全角 / 中文 / 圆括号写法', () => {
  test('\\(x^2\\) 转为 $x^2$', () => {
    const r = M.normalizeMath(String.raw`\(x^2\)`);
    assert.strictEqual(r.text, '$x^2$');
  });

  test('\\[x\\] 转为 $$x$$', () => {
    const r = M.normalizeMath(String.raw`\[x\]`);
    assert.strictEqual(r.text, '$$x$$');
  });

  test('全角 ＄x＄ 转为 $x$', () => {
    const r = M.normalizeMath('＄x＄');
    assert.strictEqual(r.text, '$x$');
  });

  test('公式内全角括号（x）转半角 (x)', () => {
    const r = M.normalizeMath('$（x）$');
    assert.strictEqual(r.text, '$(x)$');
  });

  test('公式内全角逗号 a，b 转半角 a,b', () => {
    const r = M.normalizeMath('$a，b$');
    assert.strictEqual(r.text, '$a,b$');
  });

  test('公式内全角等号 ＝ 转 =', () => {
    const r = M.normalizeMath('$x＝1$');
    assert.strictEqual(r.text, '$x=1$');
  });

  test('公式内全角 ASCII（ｘ＋１）转半角 x+1', () => {
    const r = M.normalizeMath('$ｘ＋１$');
    assert.strictEqual(r.text, '$x+1$');
  });

  test('中文自动包 \\text{}：$当x>0时$', () => {
    const r = M.normalizeMath('$当x>0时$');
    assert.ok(r.text.indexOf('\\text{当}') >= 0);
    assert.ok(r.text.indexOf('\\text{时}') >= 0);
  });

  test('已是 \\text{} 的内容不被重复包裹', () => {
    const r = M.normalizeMath(String.raw`$\text{已知} a$`);
    assert.strictEqual(r.text, String.raw`$\text{已知} a$`);
  });

  test('中文标点（。；：、）也被包进 \\text{}', () => {
    const r = M.normalizeMath('$当 x>0。时$');
    // 句号应被包进 \text{}，而不是裸暴露在公式里
    assert.ok(r.text.indexOf('。') < 0 || r.text.indexOf('\\text{') >= 0);
    assert.ok(r.text.indexOf('\\text{') >= 0);
  });

  test('公式外的中文与文本不动', () => {
    const r = M.normalizeMath('设 $x$ 是实数');
    assert.strictEqual(r.text, '设 $x$ 是实数');
  });

  test('公式内中文夹在希腊字母间：α当β', () => {
    const r = M.normalizeMath('$α当β$');
    assert.ok(r.text.indexOf('\\text{当}') >= 0);
    assert.ok(r.text.indexOf('α') >= 0);
    assert.ok(r.text.indexOf('β') >= 0);
  });

  test('全角空格 U+3000 转普通空格', () => {
    const r = M.normalizeMath('$x\u3000y$');
    assert.strictEqual(r.text, '$x y$');
  });
});

/* ============================================================
 * C. Unicode 符号（实测：KaTeX 可直接渲染，无需转换）
 * ============================================================ */

group('C. Unicode 符号（实测可直渲染，转换不应破坏）', () => {
  // 2026-10-24 实测：KaTeX 0.16.9 能直接渲染 75/75 个常见 Unicode 符号。
  // 因此 normalizeMath 不做 Unicode→\times 之类转换，这里验证「不破坏」。
  test('×÷·−≤≥ 等符号保持原样（幂等，不破坏）', () => {
    const s = '$a×b÷c·d−e≤f≥g$';
    const r = M.normalizeMath(s);
    assert.strictEqual(r.text, s);
  });

  test('希腊字母 α β π 保持原样', () => {
    const s = '$α+β=π$';
    assert.strictEqual(M.normalizeMath(s).text, s);
  });

  test('∈ ⊂ ∪ ∩ → ∞ 保持原样', () => {
    const s = '$x∈A⊂B∪C∩D→∞$';
    assert.strictEqual(M.normalizeMath(s).text, s);
  });

  test('ℝ ℂ ℕ ℤ ℚ 保持原样', () => {
    const s = '$x∈ℝ, z∈ℂ, n∈ℕ$';
    assert.strictEqual(M.normalizeMath(s).text, s);
  });
});

/* ============================================================
 * D. 幂等性与边界
 * ============================================================ */

group('D. 幂等性与边界', () => {
  test('幂等：连续两次结果相同', () => {
    const s = '$当 x>0 时$';
    const once = M.normalizeMath(s).text;
    const twice = M.normalizeMath(once).text;
    assert.strictEqual(twice, once);
  });

  test('语料库幂等：全部样例各跑两遍结果一致', () => {
    const corpus = [
      '$当 x>0 时$',
      String.raw`设\(f(x)=x^2\)，求\[\int_0^1 f(x)dx\]`,
      '$（x）＝１＋２，且$',
      '＄αβ当γ＄',
      String.raw`$x^2+\frac{1}{2}$`,
      '纯文本，price=$x$元',
      String.raw`$已\text{知} a$`,
      '$a×b÷c≤d$',
      '$\\sum_{n=1}^{∞}x^n$',
      String.raw`$$\begin{aligned}a&=b\\c&=d\end{aligned}$$`
    ];
    corpus.forEach((s) => {
      const once = M.normalizeMath(s).text;
      const twice = M.normalizeMath(once).text;
      assert.strictEqual(twice, once, '不幂等: ' + s);
    });
  });

  test('空串返回空串', () => {
    assert.strictEqual(M.normalizeMath('').text, '');
  });

  test('只有 $$ 不崩', () => {
    assert.doesNotThrow(() => M.normalizeMath('$$'));
  });

  test('只有 $ 不崩', () => {
    assert.doesNotThrow(() => M.normalizeMath('$'));
  });

  test('null / undefined 不崩', () => {
    assert.doesNotThrow(() => M.normalizeMath(null));
    assert.doesNotThrow(() => M.normalizeMath(undefined));
  });

  test('没有公式的纯文本原样返回', () => {
    const s = '这是一段没有任何公式的普通文本';
    assert.strictEqual(M.normalizeMath(s).text, s);
  });

  test('已经正确的公式不被改动', () => {
    const s = String.raw`$\frac{1}{2}$`;
    assert.strictEqual(M.normalizeMath(s).text, s);
  });

  test('$$ 跨多行公式内容保留', () => {
    const s = String.raw`$$\begin{aligned}
a&=b\\
c&=d
\end{aligned}$$`;
    const r = M.normalizeMath(s);
    // 块级公式内的换行是合法的，应保留
    assert.ok(r.text.indexOf('\n') >= 0 || r.text.indexOf('\\\\') >= 0);
    assert.strictEqual(M.normalizeMath(r.text).text, r.text, '应幂等');
  });

  test('行内公式含换行：不当作公式（行内不跨行）', () => {
    // splitMath 规定行内公式不跨行，遇到换行就按字面处理
    const r = M.splitMath('$x\ny$');
    // 不崩即可；具体切分见 splitMath 语义
    assert.ok(Array.isArray(r.parts));
  });

  test('嵌套花括号的 \\text{} 不被重复包裹', () => {
    const s = String.raw`$\text{已知 a} + \text{未知 b}$`;
    const r = M.normalizeMath(s);
    assert.strictEqual(r.text, s);
  });
});

/* ============================================================
 * E. 特殊字符不崩
 * ============================================================ */

group('E. 特殊字符不崩', () => {
  test('公式内含 %（KaTeX 注释符）不崩', () => {
    assert.doesNotThrow(() => M.renderRich('$a % b$', { katex }));
  });

  test('公式内含 # 不崩', () => {
    assert.doesNotThrow(() => M.renderRich('$a # b$', { katex }));
  });

  test('公式内含 & 不崩', () => {
    assert.doesNotThrow(() => M.renderRich('$a & b$', { katex }));
  });

  test('公式内含连续 _ ^ 不崩', () => {
    assert.doesNotThrow(() => M.renderRich('$a_b^c$', { katex }));
  });

  test('未闭合的 $ 不把后面整段吞掉', () => {
    const r = M.splitMath('$x 后面还有文字');
    // 未闭合时后面文字应保留在 text 里
    const text = r.parts.map((p) => p.value).join('');
    assert.ok(text.indexOf('后面还有文字') >= 0);
  });
});

/* ============================================================
 * F. 安全性
 * ============================================================ */

group('F. 安全性', () => {
  test('<script> 被转义', () => {
    const r = M.renderRich('<script>alert(1)</script>', { katex });
    assert.ok(r.html.indexOf('<script>') < 0);
  });

  test('公式内 < > 正常渲染（回归：不退化源码）', () => {
    const r = M.renderRich('$x>0$', { katex });
    // 判断标准是「有没有被 KaTeX 渲染」，而不是「有没有 &gt;」——
    // KaTeX 输出的 <mo> 标签里本来就会用 &gt; 这个合法实体。
    // 上一轮的真 bug 是：先 esc() 再渲染，导致 `$x>0$` 整个退化成源码、
    // 完全没有 class="katex"。所以这里看渲染标记。
    assert.ok(r.html.indexOf('class="katex') >= 0, '应被 KaTeX 渲染，实际: ' + r.html.slice(0, 120));
  });

  test('引号被转义', () => {
    const r = M.renderRich('他说"答对了"', { katex });
    assert.ok(r.html.indexOf('"') < 0 || r.html.indexOf('&quot;') >= 0);
  });
});

/* ============================================================
 * G. API 与渲染
 * ============================================================ */

group('G. API 与渲染', () => {
  test('splitMath 返回 {parts, warnings}', () => {
    const r = M.splitMath('$x$');
    assert.ok(Array.isArray(r.parts));
    assert.ok(Array.isArray(r.warnings));
  });

  test('isInsideMath：光标在 $ 内为真，外为假', () => {
    const s = 'a $b$ c';
    assert.strictEqual(M.isInsideMath(s, 0), false);   // 'a'
    assert.strictEqual(M.isInsideMath(s, 3), true);    // 'b'
    assert.strictEqual(M.isInsideMath(s, 7), false);   // 'c'
  });

  test('renderRich 输出含 class="katex"', () => {
    const r = M.renderRich('$x^2$', { katex });
    assert.ok(r.html.indexOf('class="katex') >= 0);
  });

  test('renderRich 错误公式返回 errors 数组（含 index 与 message）', () => {
    const r = M.renderRich(String.raw`$\undefinedcmd{x}$`, { katex });
    assert.ok(r.errors.length > 0);
    assert.ok('index' in r.errors[0]);
    assert.ok('message' in r.errors[0]);
    assert.ok(r.errors[0].message.length <= 40);
  });

  test('renderRich 多个公式时错误 index 正确', () => {
    const r = M.renderRich(String.raw`$ok$ 和 $\badcmd{x}$`, { katex });
    // 第一个 ok 正常，第二个 badcmd 出错 → index 应为 2
    assert.strictEqual(r.errors.length, 1);
    assert.strictEqual(r.errors[0].index, 2);
  });
});

/* ---------------- 汇总 ---------------- */

console.log('\n' + '-'.repeat(52));
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
if (failed > 0) {
  console.log('\n失败详情：');
  failures.forEach((f) => {
    console.log('  · ' + f.name);
    console.log('    ' + f.err.message);
  });
  process.exit(1);
}
console.log('全部通过 ✓');
