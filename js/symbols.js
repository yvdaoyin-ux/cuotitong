/**
 * symbols.js —— 公式工具栏的数据表 + 插入纯函数（阶段 2）
 *
 * 数据表：{ group, tip, insert }，可选 tex 覆盖按钮显示。
 *   group   分组名（常用 / 微积分 / 线代 / 概率统计 / 集合逻辑 / 希腊）
 *   tip     按钮中文名（aria-label 用）
 *   insert  插入的 LaTeX，▮（U+25AE）表示占位符；无 ▮ 表示直接插入的光标命令
 *   tex     按钮上的图形（KaTeX 渲染）。默认由 insert 推导（▮→x），
 *           需要特殊显示时才写这个字段（保持表干净，方便审阅增删）
 * 任务书要求「我之后会审阅增删」，所以表里一行一个符号，不合并。
 *
 * 纯函数（Node 可测，tests/symbols.test.js）：
 *   insertAt(text, selStart, selEnd, template, insideMath)
 *   nextPlaceholder(text, from)
 *   hasResidual(text)
 * 自动补 $ 的规则（任务书 2.2）：isInsideMath 为假时插入内容自动包成 $...$，
 *   由 UI 层用 mathtext.isInsideMath 算好后经 insideMath 参数传入，本文件保持纯函数。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});

  var PH = '\u25AE'; // ▮ 占位符

  /* ============================================================
   * 数据表（分组顺序即面板分组顺序）
   * ============================================================ */

  var SYMBOLS = [
    // —— 常用 ——
    { group: '常用', tip: '分数', insert: '\\frac{' + PH + '}{' + PH + '}' },
    { group: '常用', tip: '根号', insert: '\\sqrt{' + PH + '}' },
    { group: '常用', tip: 'n 次根', insert: '\\sqrt[' + PH + ']{' + PH + '}' },
    { group: '常用', tip: '上标', insert: '^{' + PH + '}' },
    { group: '常用', tip: '下标', insert: '_{' + PH + '}' },
    { group: '常用', tip: '圆括号（自动大小）', insert: '\\left(' + PH + '\\right)' },
    { group: '常用', tip: '绝对值（自动大小）', insert: '\\left|' + PH + '\\right|' },
    { group: '常用', tip: '点乘', insert: '\\cdot' },
    { group: '常用', tip: '叉乘', insert: '\\times' },
    { group: '常用', tip: '除号', insert: '\\div' },
    { group: '常用', tip: '正负号', insert: '\\pm' },
    { group: '常用', tip: '小于等于', insert: '\\le' },
    { group: '常用', tip: '大于等于', insert: '\\ge' },
    { group: '常用', tip: '不等于', insert: '\\ne' },
    { group: '常用', tip: '约等于', insert: '\\approx' },
    { group: '常用', tip: '无穷', insert: '\\infty' },
    { group: '常用', tip: '箭头 →', insert: '\\to' },
    { group: '常用', tip: '推出 ⇒', insert: '\\Rightarrow' },
    { group: '常用', tip: '等价 ⇔', insert: '\\Leftrightarrow' },
    { group: '常用', tip: '包成行内公式 $…$', insert: '$' + PH + '$', tex: '\\$\\ldots\\$' },

    // —— 微积分 ——
    { group: '微积分', tip: '极限', insert: '\\lim_{x\\to ' + PH + '}' },
    { group: '微积分', tip: '定积分', insert: '\\int_{' + PH + '}^{' + PH + '}' },
    { group: '微积分', tip: '二重积分', insert: '\\iint' },
    { group: '微积分', tip: '环路积分', insert: '\\oint' },
    { group: '微积分', tip: '级数求和', insert: '\\sum_{n=1}^{\\infty}' },
    { group: '微积分', tip: '连乘', insert: '\\prod' },
    { group: '微积分', tip: 'dy/dx', insert: '\\frac{dy}{dx}' },
    { group: '微积分', tip: '偏导数', insert: '\\frac{\\partial ' + PH + '}{\\partial ' + PH + '}' },
    { group: '微积分', tip: '偏导符号 ∂', insert: '\\partial' },
    { group: '微积分', tip: '梯度算子 ∇', insert: '\\nabla' },
    { group: '微积分', tip: "f'(x)", insert: "f'(x)" },
    { group: '微积分', tip: 'sin', insert: '\\sin' },
    { group: '微积分', tip: 'cos', insert: '\\cos' },
    { group: '微积分', tip: 'tan', insert: '\\tan' },
    { group: '微积分', tip: 'ln', insert: '\\ln' },
    { group: '微积分', tip: 'exp', insert: '\\exp' },
    { group: '微积分', tip: 'arctan', insert: '\\arctan' },

    // —— 线代 ——
    { group: '线代', tip: '2×2 矩阵（圆括号）', insert: '\\begin{pmatrix}' + PH + ' & ' + PH + ' \\\\ ' + PH + ' & ' + PH + '\\end{pmatrix}' },
    { group: '线代', tip: '3×3 矩阵（圆括号）', insert: '\\begin{pmatrix}' + PH + ' & ' + PH + ' & ' + PH + ' \\\\ ' + PH + ' & ' + PH + ' & ' + PH + ' \\\\ ' + PH + ' & ' + PH + ' & ' + PH + '\\end{pmatrix}' },
    { group: '线代', tip: '2×2 行列式', insert: '\\begin{vmatrix}' + PH + ' & ' + PH + ' \\\\ ' + PH + ' & ' + PH + '\\end{vmatrix}' },
    { group: '线代', tip: '转置', insert: '^{T}' },
    { group: '线代', tip: '逆矩阵', insert: '^{-1}' },
    { group: '线代', tip: '行列式 det', insert: '\\det' },
    { group: '线代', tip: '秩 rank', insert: '\\operatorname{rank}' },
    { group: '线代', tip: '向量', insert: '\\vec{' + PH + '}' },
    { group: '线代', tip: '粗体（矩阵）', insert: '\\mathbf{' + PH + '}' },
    { group: '线代', tip: '内积 ⟨,⟩', insert: '\\langle ' + PH + ',' + PH + '\\rangle' },
    { group: '线代', tip: '实数集 ℝ', insert: '\\mathbb{R}' },
    { group: '线代', tip: '复数集 ℂ', insert: '\\mathbb{C}' },

    // —— 概率统计 ——
    { group: '概率统计', tip: '概率 P(·)', insert: 'P(' + PH + ')' },
    { group: '概率统计', tip: '条件概率 P(·|·)', insert: 'P(' + PH + '\\mid ' + PH + ')' },
    { group: '概率统计', tip: '期望 E(X)', insert: 'E(X)' },
    { group: '概率统计', tip: '方差 Var', insert: '\\operatorname{Var}' },
    { group: '概率统计', tip: '协方差 Cov', insert: '\\operatorname{Cov}' },
    { group: '概率统计', tip: '样本均值 X̄', insert: '\\bar{X}' },
    { group: '概率统计', tip: '估计量 θ̂', insert: '\\hat{\\theta}' },
    { group: '概率统计', tip: '服从于 ~', insert: '\\sim' },
    { group: '概率统计', tip: '正态分布 N(μ,σ²)', insert: 'N(\\mu,\\sigma^2)' },
    { group: '概率统计', tip: '组合数 C(n,k)', insert: '\\binom{n}{k}' },

    // —— 集合逻辑 ——
    { group: '集合逻辑', tip: '属于 ∈', insert: '\\in' },
    { group: '集合逻辑', tip: '不属于 ∉', insert: '\\notin' },
    { group: '集合逻辑', tip: '子集 ⊂', insert: '\\subset' },
    { group: '集合逻辑', tip: '子集或相等 ⊆', insert: '\\subseteq' },
    { group: '集合逻辑', tip: '并集 ∪', insert: '\\cup' },
    { group: '集合逻辑', tip: '交集 ∩', insert: '\\cap' },
    { group: '集合逻辑', tip: '空集 ∅', insert: '\\emptyset' },
    { group: '集合逻辑', tip: '任意 ∀', insert: '\\forall' },
    { group: '集合逻辑', tip: '存在 ∃', insert: '\\exists' },
    { group: '集合逻辑', tip: '自然数集 ℕ', insert: '\\mathbb{N}' },
    { group: '集合逻辑', tip: '整数集 ℤ', insert: '\\mathbb{Z}' },
    { group: '集合逻辑', tip: '有理数集 ℚ', insert: '\\mathbb{Q}' },

    // —— 希腊 ——
    { group: '希腊', tip: 'alpha α', insert: '\\alpha', tex: '\\alpha' },
    { group: '希腊', tip: 'beta β', insert: '\\beta', tex: '\\beta' },
    { group: '希腊', tip: 'gamma γ', insert: '\\gamma', tex: '\\gamma' },
    { group: '希腊', tip: 'delta δ', insert: '\\delta', tex: '\\delta' },
    { group: '希腊', tip: 'epsilon ε', insert: '\\epsilon', tex: '\\epsilon' },
    { group: '希腊', tip: 'theta θ', insert: '\\theta', tex: '\\theta' },
    { group: '希腊', tip: 'lambda λ', insert: '\\lambda', tex: '\\lambda' },
    { group: '希腊', tip: 'mu μ', insert: '\\mu', tex: '\\mu' },
    { group: '希腊', tip: 'xi ξ', insert: '\\xi', tex: '\\xi' },
    { group: '希腊', tip: 'pi π', insert: '\\pi', tex: '\\pi' },
    { group: '希腊', tip: 'rho ρ', insert: '\\rho', tex: '\\rho' },
    { group: '希腊', tip: 'sigma σ', insert: '\\sigma', tex: '\\sigma' },
    { group: '希腊', tip: 'tau τ', insert: '\\tau', tex: '\\tau' },
    { group: '希腊', tip: 'phi φ', insert: '\\phi', tex: '\\phi' },
    { group: '希腊', tip: 'omega ω', insert: '\\omega', tex: '\\omega' },
    { group: '希腊', tip: 'Delta Δ', insert: '\\Delta', tex: '\\Delta' },
    { group: '希腊', tip: 'Sigma Σ', insert: '\\Sigma', tex: '\\Sigma' },
    { group: '希腊', tip: 'Omega Ω', insert: '\\Omega', tex: '\\Omega' },
    { group: '希腊', tip: 'Phi Φ', insert: '\\Phi', tex: '\\Phi' },
    { group: '希腊', tip: 'Psi Ψ', insert: '\\Psi', tex: '\\Psi' },
    { group: '希腊', tip: 'Gamma Γ', insert: '\\Gamma', tex: '\\Gamma' },
    { group: '希腊', tip: 'Lambda Λ', insert: '\\Lambda', tex: '\\Lambda' },
    { group: '希腊', tip: 'Pi Π', insert: '\\Pi', tex: '\\Pi' }
  ];

  /* ============================================================
   * 纯函数
   * ============================================================ */

  /** 模板里有几个占位符。 */
  function countPlaceholders(template) {
    var n = 0;
    var i = template.indexOf(PH);
    while (i >= 0) { n += 1; i = template.indexOf(PH, i + 1); }
    return n;
  }

  /**
   * 核心插入函数（任务书 2.2 的行为规范全在这里，UI 只负责调用）。
   * @param {string} text      原文本
   * @param {number} selStart  选区起点
   * @param {number} selEnd    选区终点（无选中时 == selStart）
   * @param {string} template  要插入的模板（含 ▮）
   * @param {boolean} insideMath 光标是否已在公式内（UI 用 isInsideMath 算好传入）
   * @returns {{text, selStart, selEnd}}
   *   有 ▮：选中内容（若有）放进第一个 ▮，插入后**选中第一个 ▮**
   *   无 ▮：插入后光标停在插入文本末尾
   *   自动补 $：不在公式内且模板本身不是 $ 开头时，包成 $...$（手动 $…$ 按钮不受影响）
   */
  function insertAt(text, selStart, selEnd, template, insideMath) {
    if (typeof text !== 'string') text = String(text == null ? '' : text);
    selStart = Math.max(0, Math.min(Number(selStart) || 0, text.length));
    selEnd = Math.max(selStart, Math.min(Number(selEnd) || 0, text.length));

    // 字母命令后自动补一个空格（v1.2 A4，Claude 裁定「不追认不处理」后的修正）：
    // `\sim` + `N` 会被 KaTeX 当成未知命令 `\simN`；KaTeX 忽略命令后的空格，显示不变。
    // 以字母命令结尾的模板必然不含 ▮（正则天然排除），花括号结尾的模板不受影响。
    // 🔴 必须在 auto-$ 包裹**之前**做：包裹后模板以 $ 结尾，正则就永远匹配不上了，
    //    空格必须落在 $ 之内（`$\cdot $`）而不是外面。
    var tpl = template;
    if (/\\[A-Za-z]+$/.test(tpl)) {
      tpl = tpl + ' ';
    }
    // 自动补 $：文本区里插入公式命令必须自带分隔符，否则 KaTeX 看不到它
    if (!insideMath && tpl.charAt(0) !== '$') {
      tpl = '$' + tpl + '$';
    }

    var selected = text.slice(selStart, selEnd);
    var phCount = countPlaceholders(tpl);
    var inserted = tpl;
    var afterSelStart, afterSelEnd;

    if (phCount > 0) {
      // 选中内容放进第一个 ▮（无选中则保留 ▮）
      if (selected) {
        var first = inserted.indexOf(PH);
        inserted = inserted.slice(0, first) + selected + inserted.slice(first + 1);
        // 剩余 ▮ 的第一个作为插入后的选区
        // 🔴 rest 是 inserted 内的偏移，必须加 selStart 才是全文位置
        //    （基准脚本题 4 真实模拟时抓到过：漏加会光标乱跳到文首）
        var rest = inserted.indexOf(PH);
        if (rest >= 0) {
          afterSelStart = selStart + rest;
          afterSelEnd = afterSelStart + 1;
        } else {
          afterSelStart = afterSelEnd = selStart + inserted.length;
        }
      } else {
        var ph1 = inserted.indexOf(PH);
        afterSelStart = selStart + ph1;
        afterSelEnd = afterSelStart + 1;
      }
    } else {
      // 无 ▮：光标停在插入文本末尾。
      // 若刚被自动包 $，停在**闭 $ 之前**（仍在公式内）——
      // 否则用户接着插入第二个命令会被再包一对 $，出现 $$…$$ 粘连
      // （基准脚本题 5 真实模拟时抓到）。
      var end = selStart + inserted.length;
      if (!insideMath && tpl !== template) end -= 1;
      afterSelStart = afterSelEnd = end;
    }

    var out = text.slice(0, selStart) + inserted + text.slice(selEnd);
    return { text: out, selStart: afterSelStart, selEnd: afterSelEnd };
  }

  /**
   * 下一个占位符跳转（任务书 2.2 的「⏭ 下一个占位」）。
   * 从 from 起向后找第一个 ▮；后面没有时**回到开头找**（循环补齐），
   * 全文没有返回 null。
   */
  function nextPlaceholder(text, from) {
    var i = text.indexOf(PH, Math.max(0, Number(from) || 0));
    if (i < 0) i = text.indexOf(PH);
    return i >= 0 ? { start: i, end: i + 1 } : null;
  }

  /** 是否还有残留占位符（保存前确认用）。 */
  function hasResidual(text) {
    return String(text || '').indexOf(PH) >= 0;
  }

  /** 按钮显示用的 tex：默认把 ▮ 换成 x，可被数据表里的 tex 字段覆盖。 */
  function texOf(item) {
    return item.tex || item.insert.split(PH).join('x');
  }

  var GROUPS = [];
  SYMBOLS.forEach(function (s) {
    if (GROUPS.indexOf(s.group) < 0) GROUPS.push(s.group);
  });

  QT.symbols = {
    PH: PH,
    SYMBOLS: SYMBOLS,
    GROUPS: GROUPS,
    countPlaceholders: countPlaceholders,
    insertAt: insertAt,
    nextPlaceholder: nextPlaceholder,
    hasResidual: hasResidual,
    texOf: texOf
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
