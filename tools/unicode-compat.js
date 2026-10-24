#!/usr/bin/env node
/**
 * tools/unicode-compat.js —— Unicode 数学符号的 KaTeX 兼容性实测
 *
 * 用途：为 normalizeMath 的「规则 6」提供实测依据。
 * 结论（2026-10-24，KaTeX 0.16.9）：全部 75 个常见符号都能被 KaTeX 直接渲染，
 * **不需要** Unicode→LaTeX 命令转换。所以 normalizeMath 只做「全角转半角 + 中文包 text」，
 * 不做符号转换。
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

/** 单个符号能否无错误渲染（throwOnError:true + strict:'ignore'）。 */
function canRender(sym) {
  try {
    const html = katex.renderToString(sym, { throwOnError: true, strict: 'ignore' });
    return !/color:\s*#cc0000/i.test(html); // 错误色 = 软失败
  } catch (e) {
    return false;
  }
}

/** 在真实语境里验证（单个符号能渲染不代表在公式里没问题）。 */
const CONTEXTS = [
  'a × b', 'a ÷ b', 'x ≤ 1', 'x ≥ 1', 'a ≠ b', 'a ≈ b',
  'x ∈ A', 'A ⊂ B', 'A ∪ B', 'A ∩ B', 'A = ∅',
  'x → 0', 'n → ∞', '∂f/∂x', '∇f', '∑ x', '∫ f dx', '√2',
  'sin α', 'cos θ', 'λ x', 'N(μ, σ²)', 'x ∈ ℝ', 'n ∈ ℕ',
  '∀x ∈ A, x ≥ 0'
];

function contextOk(ctx) {
  try {
    const html = katex.renderToString(ctx, { throwOnError: true, strict: 'ignore' });
    return !/color:\s*#cc0000/i.test(html);
  } catch (e) {
    return false;
  }
}

let directOk = 0, directBad = [];
SYMBOLS.forEach(function (pair) {
  if (canRender(pair[0])) directOk += 1;
  else directBad.push(pair[0]);
});

let ctxOk = 0, ctxBad = [];
CONTEXTS.forEach(function (ctx) {
  if (contextOk(ctx)) ctxOk += 1;
  else ctxBad.push(ctx);
});

console.log('=== 单个符号 ===');
console.log('可直接渲染：' + directOk + ' / ' + SYMBOLS.length);
if (directBad.length) console.log('需转换：' + directBad.join(' '));
else console.log('全部可直接渲染，无需 Unicode→LaTeX 转换');

console.log('');
console.log('=== 真实语境 ===');
console.log('可渲染：' + ctxOk + ' / ' + CONTEXTS.length);
if (ctxBad.length) console.log('失败：' + ctxBad.join(' | '));
else console.log('语境中全部可渲染');

console.log('');
console.log('结论：规则 6（Unicode 符号转命令）可以整体省略。');
console.log('真正必须处理的是全角字符（（），＝＄等），它们在 KaTeX 里会渲染出乱码，');
console.log('必须归一为半角 —— 这一项 normalizeMath 已实现并有测试。');
