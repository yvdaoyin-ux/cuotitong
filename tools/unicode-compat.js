#!/usr/bin/env node
/**
 * tools/unicode-compat.js —— Unicode 数学符号的 KaTeX 兼容性实测
 *
 * 用途：为 normalizeMath 的「规则 6」提供实测依据。
 *
 * 结论（2026-10-24，KaTeX 0.16.9，strict 回调实测）：
 *   - **72 个符号无任何警告**，可直接渲染。
 *   - **3 个符号（∅、√、′）触发 unknownSymbol 警告**，但渲染结果与
 *     `\emptyset`、`\surd`、`\prime` 一致，视觉上正确。
 *   - 其中 `√` 有额外语义问题：`√x` 只渲染出「根号符号 + x」而无根号横线，
 *     与 `\sqrt{x}` 不同。故 normalizeMath 单独加了 `√`→`\sqrt{}` 的机械转换。
 *
 * 重要更正（Claude 指出，我复验确认）：之前用 `strict:'ignore'` 把警告吞掉了，
 * 误判成「75/75 全部无警告」。本版改用 strict 回调收集警告，区分两类。
 *
 * 运行：node tools/unicode-compat.js
 */
'use strict';

const path = require('path');
const katex = require(path.join(__dirname, '..', 'lib', 'katex.min.js'));

const SYMBOLS = [
  // 运算符
  ['×', 'times'], ['÷', 'div'], ['·', 'cdot'], ['−', 'minus'],
  ['±', 'pm'], ['∓', 'mp'],
  // 关系
  ['≤', 'le'], ['≥', 'ge'], ['≠', 'ne'], ['≈', 'approx'],
  ['≡', 'equiv'], ['∼', 'sim'], ['∝', 'propto'],
  // 集合
  ['∈', 'in'], ['∉', 'notin'], ['⊂', 'subset'], ['⊆', 'subseteq'],
  ['∪', 'cup'], ['∩', 'cap'], ['∅', 'emptyset'], ['∖', 'setminus'],
  // 逻辑
  ['∀', 'forall'], ['∃', 'exists'], ['¬', 'neg'], ['∧', 'wedge'], ['∨', 'vee'],
  // 箭头
  ['→', 'to'], ['←', 'leftarrow'], ['↔', 'leftrightarrow'],
  ['⇒', 'Rightarrow'], ['⇔', 'Leftrightarrow'],
  // 特殊
  ['∞', 'infty'], ['∂', 'partial'], ['∇', 'nabla'], ['∑', 'sum'], ['∏', 'prod'],
  ['∫', 'int'], ['∬', 'iint'], ['√', 'sqrt'],
  // 希腊（小写）
  ['α', 'alpha'], ['β', 'beta'], ['γ', 'gamma'], ['δ', 'delta'], ['ε', 'epsilon'],
  ['θ', 'theta'], ['λ', 'lambda'], ['μ', 'mu'], ['π', 'pi'], ['ρ', 'rho'],
  ['σ', 'sigma'], ['τ', 'tau'], ['φ', 'phi'], ['ω', 'omega'], ['ξ', 'xi'],
  // 希腊（大写）
  ['Δ', 'Delta'], ['Σ', 'Sigma'], ['Ω', 'Omega'], ['Φ', 'Phi'], ['Ψ', 'Psi'],
  ['Γ', 'Gamma'], ['Λ', 'Lambda'], ['Π', 'Pi'],
  // 数集
  ['ℝ', 'R'], ['ℂ', 'C'], ['ℕ', 'N'], ['ℤ', 'Z'], ['ℚ', 'Q'],
  // 其它
  ['⋯', 'cdots'], ['…', 'ldots'], ['°', 'degree'], ['′', 'prime'],
  ['⟨', 'langle'], ['⟩', 'rangle'], ['∴', 'therefore'], ['∵', 'because'],
];

/**
 * 用 strict 回调收集警告，返回 { renders, warnings }。
 * renders: 是否真的渲染出来了（不抛异常、无错误色）
 * warnings: 触发的警告 code 列表（unknownSymbol / unicodeTextInMathMode 等）
 */
function probe(sym) {
  const warnings = [];
  let renders = false;
  try {
    const html = katex.renderToString(sym, {
      throwOnError: true,
      strict: function (code, msg, tok) { warnings.push(code); }
    });
    renders = !/color:\s*#cc0000/i.test(html);
  } catch (e) {
    renders = false;
  }
  return { renders, warnings };
}

const noWarn = [];
const warnButOk = [];
const failed = [];

SYMBOLS.forEach(function (pair) {
  const sym = pair[0];
  const r = probe(sym);
  if (!r.renders) failed.push(sym);
  else if (r.warnings.length === 0) noWarn.push(sym);
  else warnButOk.push({ sym, codes: r.warnings });
});

console.log('=== 单个符号（strict 回调收集警告） ===');
console.log('无警告直接渲染：' + noWarn.length + ' / ' + SYMBOLS.length);
console.log('  ' + noWarn.join(' '));
console.log('');
console.log('有警告但渲染正确：' + warnButOk.length + ' 个');
warnButOk.forEach(function (w) {
  console.log('  ' + w.sym + ' → 警告 ' + w.codes.join(','));
});
console.log('');
console.log('渲染失败：' + failed.length + ' 个' + (failed.length ? ' ' + failed.join(' ') : ''));

/* ---------- √ 的语义问题专项 ---------- */

console.log('');
console.log('=== √ 的语义问题（Claude 更正 b） ===');

function sqrtBarCheck(src) {
  // 看渲染出来的 HTML 里有没有真正的 sqrt 结构（mroot/msqrt 或 \sqrt 的视觉横线）
  const html = katex.renderToString(src, { throwOnError: false });
  const hasSqrt = /sqrt|surd|mroot|msqrt/i.test(html) && html.indexOf('√') < 0;
  return { src, html, hasTrueSqrt: hasSqrt };
}

['√x', '√{x}', '√(x)', '√2'].forEach(function (s) {
  const r = sqrtBarCheck(s);
  console.log('  ' + s + ' → 有真 sqrt 结构: ' + (r.hasTrueSqrt ? '是' : '否（只有符号+内容，无根号横线）'));
});
// 对照：正确的 \sqrt
const ref = katex.renderToString('\\sqrt{x}', { throwOnError: false });
console.log('  对照 \\sqrt{x} → 有真 sqrt 结构: ' + (/sqrt|mroot|msqrt/i.test(ref) ? '是' : '否'));

console.log('');
console.log('结论：');
console.log('  · 72 个符号无警告，可直接渲染，规则 6 对它们省略。');
console.log('  · ∅、√、′ 三个有 unknownSymbol 警告但渲染视觉正确，可不转换。');
console.log('  · √ 单独处理：normalizeMath 已加 √→\\sqrt{} 的机械规则（有 ≥5 项测试）。');
console.log('  · 全角字符（（），＝＄等）触发 unicodeTextInMathMode 警告、按文本字体渲染，');
console.log('    间距斜体与数学字体不一致，必须归一为半角 —— normalizeMath 已实现并有测试。');
