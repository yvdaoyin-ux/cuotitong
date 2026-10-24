/**
 * mathtext.js —— 公式文本的切分、规范化、渲染（纯函数，可在 Node 测试）
 *
 * 设计目标：让不会 LaTeX 的人也能把题录进来。
 * 用户可能的输入来源：
 *   1. 手机中文输入法：`＄`、`（`、`，`、`＝` 全是全角，KaTeX 渲染出来是乱码
 *   2. 别的 AI / 识别工具输出的 `\(...\)`、`\[...\]` 写法
 *   3. 直接粘中文到公式里：`$当 x>0 时$`
 *
 * ============================================================
 * 关于「Unicode 数学符号要不要转成命令」—— 已实测，答案是**不用转**
 * ============================================================
 * 2026-10-24 用 KaTeX 0.16.9 实测了 75 个常见符号（×÷·−±≤≥≠≈∈⊂∪∩→⇒∞∂∇∑∫√
 * α β γ δ ε θ λ μ π ρ σ τ φ ω ξ Δ Σ Ω Φ Ψ Γ Λ Π ℝ ℂ ℕ ℤ ℚ ⋯ ° ′ ⟨⟩ ∴∵），
 * 方式为「单个符号」与「真实公式语境」两轮（如 `x ≤ 1`、`∀x ∈ A, x ≥ 0`）：
 *   → **75/75 全部能直接渲染，0 个需要转换**
 * 所以本模块**不做** Unicode→`\times` 之类的转换（任务书原本建议做，实测后发现多余）。
 * 真正必须转的是**全角字符**：`（` `）` `，` `＝` 它们虽"能渲染"，
 * 但产出的是错乱内容（实测可见文字会重复三遍），必须归一为半角。
 *
 * 本文件不依赖 DOM，也不依赖 QT 的其它模块，可直接 require 测试。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});

  /* ============================================================
   * 一、splitMath：把文本切成 普通文本 / 行内公式 / 块级公式
   * ============================================================ */

  /**
   * @param {string} text
   * @returns {{parts: Array<{type:string, value:string}>, warnings: string[]}}
   *   type: 'text' | 'inline' | 'display'
   *   value: 公式**内部**的 LaTeX（不含分隔符）；text 则为原文
   */
  function splitMath(text) {
    var src = text == null ? '' : String(text);
    var parts = [];
    var warnings = [];
    var i = 0;
    var buf = '';

    function flushText() {
      if (buf) { parts.push({ type: 'text', value: buf }); buf = ''; }
    }

    while (i < src.length) {
      var ch = src.charAt(i);

      // 转义美元符：\$ 是字面美元，不进公式
      if (ch === '\\' && src.charAt(i + 1) === '$') {
        buf += '\\$';
        i += 2;
        continue;
      }

      // 块级 $$...$$
      if (ch === '$' && src.charAt(i + 1) === '$') {
        var closeD = src.indexOf('$$', i + 2);
        if (closeD < 0) {
          warnings.push('未闭合的块级公式 $$');
          buf += src.slice(i);
          i = src.length;
          break;
        }
        flushText();
        parts.push({ type: 'display', value: src.slice(i + 2, closeD) });
        i = closeD + 2;
        continue;
      }

      // 行内 $...$
      if (ch === '$') {
        var closeI = findInlineClose(src, i + 1);
        if (closeI < 0) {
          // 奇数个 $：最后一个按字面处理（任务书要求）
          warnings.push('存在未闭合的行内公式 $，最后一个按字面美元符处理');
          buf += src.slice(i);
          i = src.length;
          break;
        }
        flushText();
        parts.push({ type: 'inline', value: src.slice(i + 1, closeI) });
        i = closeI + 1;
        continue;
      }

      buf += ch;
      i += 1;
    }
    flushText();
    return { parts: parts, warnings: warnings };
  }

  /** 从 from 开始找行内公式的闭合 $（不允许跨行，且跳过 \$）。 */
  function findInlineClose(src, from) {
    for (var i = from; i < src.length; i++) {
      var ch = src.charAt(i);
      if (ch === '\n') return -1;          // 行内公式不跨行
      if (ch === '\\' && src.charAt(i + 1) === '$') { i += 1; continue; }
      if (ch === '$') return i;
    }
    return -1;
  }

  /* ============================================================
   * 二、normalizeMath：规范化（必须幂等）
   * ============================================================ */

  /** 全角 ASCII（U+FF01–FF5E）→ 半角。 */
  function fullwidthAsciiToHalf(s) {
    return s.replace(/[\uFF01-\uFF5E]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    });
  }

  /** 中文里常见的全角空格。 */
  function normalizeSpaces(s) {
    return s.replace(/\u3000/g, ' ');
  }

  /**
   * `√` → `\sqrt{...}` 的机械转换（Claude 更正 b，2026-10-24 实测确认）。
   *
   * 背景：KaTeX 对 Unicode `√` 会报 unknownSymbol 警告，且渲染出来只是
   * 「根号符号 + 紧跟内容」，**没有根号横线**，与真正的 `\sqrt` 语义不符。
   *
   * 规则（只做机械转换，不猜）：
   *   - `√{…}` → `\sqrt{…}`（取花括号内内容）
   *   - `√(…)` → `\sqrt{…}`（圆括号改成花括号）
   *   - `√x`（单个字母/数字）→ `\sqrt{x}`
   *   - 其它情况（如 `√` 后面是命令、空格、或已经是 \sqrt）不动
   */
  function convertSqrt(s) {
    // 已经是 \sqrt 的不动
    return s.replace(/√(\{[^{}]+\}|\([^)]+\)|[0-9a-zA-Z])/g, function (m, arg) {
      if (arg.charAt(0) === '{') return '\\sqrt' + arg;
      if (arg.charAt(0) === '(') return '\\sqrt{' + arg.slice(1, -1) + '}';
      return '\\sqrt{' + arg + '}';
    });
  }

  /**
   * 把公式内的连续汉字/中文标点包成 \text{...}。
   * 中文标点（。；：、！？）也包进去 —— KaTeX 在公式模式遇到中文会触发
   * unicodeTextInMathMode 警告，并按文本字体渲染，间距和斜体与数学字体不一致，
   * 所以必须用 \text{} 明确包起来。
   * 逗号、括号、等号已在前面转成半角，保持数学语义，不包。
   * 已在 \text{...} 内的跳过（按花括号深度判断）。
   */
  function wrapCjk(s) {
    var out = '';
    var i = 0;
    var CJK = /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]/;
    var CJK_PUNCT = /[。；：、！？，（）【】《》“”‘’]/;

    while (i < s.length) {
      var ch = s.charAt(i);
      // 在 \text{...} 里就整段跳过
      if (s.substr(i, 6) === '\\text{') {
        var depth = 0;
        var j = i + 5;
        for (; j < s.length; j++) {
          var c = s.charAt(j);
          if (c === '\\') { j += 1; continue; }
          if (c === '{') depth += 1;
          else if (c === '}') {
            depth -= 1;
            if (depth === 0) { j += 1; break; }
          }
        }
        out += s.slice(i, j);
        i = j;
        continue;
      }
      // 连续中文（含中文标点）
      if (CJK.test(ch) || CJK_PUNCT.test(ch)) {
        var start = i;
        while (i < s.length) {
          var cc = s.charAt(i);
          if (CJK.test(cc) || CJK_PUNCT.test(cc)) i += 1;
          else break;
        }
        var word = s.slice(start, i);
        // 去掉首尾空格后再包（避免 \text{ 当 } 这种）
        out += '\\text{' + word + '}';
        continue;
      }
      out += ch;
      i += 1;
    }
    return out;
  }

  /**
   * 规范化整段文本。
   *
   * 规则（按处理顺序，后一条不受前一条影响）：
   *   1. `\(...\)` → `$...$`；`\[...\]` → `$$...$$`（兼容别的工具的输出）
   *   2. 全角 `＄` → `$`
   *   3. 公式段内部：全角 ASCII → 半角、全角空格 → 普通空格
   *   4. 公式段内部：连续汉字/中文标点 → `\text{...}`（已在 \text{} 内跳过）
   *   5. 公式段外的文本**不动**（除规则 1、2）
   *
   * 幂等：连续调用两次结果相同（有测试覆盖）。
   *
   * @param {string} text
   * @returns {{text: string, warnings: string[]}}
   */
  function normalizeMath(text) {
    var src = text == null ? '' : String(text);
    var warnings = [];

    // 规则 1：\(...\) 与 \[...\]
    src = src.replace(/\\\(([\s\S]+?)\\\)/g, function (m, body) { return '$' + body + '$'; });
    src = src.replace(/\\\[([\s\S]+?)\\\]/g, function (m, body) { return '$$' + body + '$$'; });

    // 规则 2：全角美元符
    src = src.replace(/\uFF04/g, '$');

    // 规则 3、4：只在公式段内处理
    var split = splitMath(src);
    var rebuilt = split.parts.map(function (p) {
      if (p.type === 'text') return p.value;
      var body = p.value;
      body = fullwidthAsciiToHalf(body);   // 全角 ASCII → 半角（含全角标点）
      body = normalizeSpaces(body);        // U+3000 → 普通空格
      body = convertSqrt(body);            // √ → \sqrt{}（机械规则，不猜）
      body = wrapCjk(body);                // 连续中文 → \text{}
      return p.type === 'inline' ? '$' + body + '$' : '$$' + body + '$$';
    }).join('');

    warnings = warnings.concat(split.warnings);
    return { text: rebuilt, warnings: warnings };
  }

  /* ============================================================
   * 三、isInsideMath：光标是否在公式内（工具栏用）
   * ============================================================ */

  /**
   * @param {string} text 全文
   * @param {number} pos 光标位置（0..text.length）
   * @returns {boolean}
   */
  function isInsideMath(text, pos) {
    var src = text == null ? '' : String(text);
    var p = Math.max(0, Math.min(Number(pos) || 0, src.length));
    var inMath = false;
    var i = 0;
    while (i < p) {
      var ch = src.charAt(i);
      if (ch === '\\' && src.charAt(i + 1) === '$') { i += 2; continue; }
      if (ch === '$') {
        // $$ 要整体翻转一次
        if (src.charAt(i + 1) === '$') { inMath = !inMath; i += 2; continue; }
        if (src.charAt(i - 1) === '$') { i += 1; continue; } // $$ 的后半个
        inMath = !inMath;
      }
      i += 1;
    }
    return inMath;
  }

  /* ============================================================
   * 四、renderRich：渲染成 HTML（先规范化，再交给 KaTeX）
   * ============================================================ */

  /** HTML 转义。本模块自带，避免依赖 util.js。 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  var PH = '\u0000MATH\u0000';

  /**
   * 把文本渲染成安全 HTML。
   *
   * 顺序至关重要（此坑已踩过一次）：**先在原文上抽取公式，再转义文本**。
   * 若先 esc() 再渲染，`$x>0$` 会变成 `x&gt;0`，KaTeX 不认识 HTML 实体，
   * 整个公式退化成源码显示在页面上。
   *
   * @param {string} text
   * @param {object} [opts] { katex } 可注入 KaTeX（测试用）
   * @returns {{html: string, errors: Array<{index:number, message:string}>}}
   *   errors 中 index 从 1 开始，对应第几个公式
   */
  function renderRich(text, opts) {
    opts = opts || {};
    var katex = opts.katex || global.katex;
    var norm = normalizeMath(text);
    var parts = splitMath(norm.text).parts;
    var errors = [];
    var html = '';
    var mathIndex = 0;

    if (!katex || typeof katex.renderToString !== 'function') {
      // 没有 KaTeX：全部转义，公式保留源码可读
      return {
        html: esc(norm.text).replace(/\n/g, '<br>'),
        errors: errors
      };
    }

    parts.forEach(function (p) {
      if (p.type === 'text') {
        html += esc(p.value).replace(/\n/g, '<br>');
        return;
      }
      mathIndex += 1;
      var displayMode = p.type === 'display';
      try {
        html += katex.renderToString(p.value, {
          displayMode: displayMode,
          throwOnError: true,
          strict: 'ignore'
        });
      } catch (e) {
        // 单公式失败：记下序号与 KaTeX 报错前 40 字，页面退化为源码但不丢内容
        var msg = String((e && e.message) || e || '未知错误');
        errors.push({ index: mathIndex, message: msg.slice(0, 40) });
        html += esc((displayMode ? '$$' : '$') + p.value + (displayMode ? '$$' : '$'));
      }
    });

    return { html: html, errors: errors };
  }

  /* ---------------- 导出 ---------------- */
  QT.mathtext = {
    splitMath: splitMath,
    normalizeMath: normalizeMath,
    isInsideMath: isInsideMath,
    renderRich: renderRich,
    // 供测试与调试
    fullwidthAsciiToHalf: fullwidthAsciiToHalf,
    wrapCjk: wrapCjk,
    convertSqrt: convertSqrt
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
