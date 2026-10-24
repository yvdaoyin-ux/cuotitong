/**
 * util.js —— 通用工具（无依赖，必须在所有其它脚本之前加载）
 *
 * 设计说明：
 * 本工程不用 ES6 module，而是「经典脚本 + window.QT 命名空间」。
 * 原因：任务书要求「微信发 zip 直接打开」，而 file:// 协议下浏览器会以 CORS 为由
 * 拒绝加载 <script type="module">，模块方案会让离线兜底直接失效。
 * 同时为了能在 Node 里跑单元测试，一律挂在 globalThis 上而不是 window 上。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});

  // 页面注册表：各 ui-*.js 在 app.js 之前加载，所以必须在这里先建好容器，
  // 否则它们执行 QT.pages.home = ... 时 QT.pages 还是 undefined。
  QT.pages = QT.pages || {};

  /* ---------------- 基础 ---------------- */

  /** 生成短 ID：前缀 + 时间戳(base36) + 随机串，够一亿条不撞。 */
  function uid(prefix) {
    var t = Date.now().toString(36);
    var r = Math.random().toString(36).slice(2, 8);
    return (prefix || 'id') + '_' + t + r;
  }

  /** HTML 转义：所有用户输入在插入 innerHTML 前必须过这一层。 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 当前时间 ISO 字符串。 */
  function nowIso() {
    return new Date().toISOString();
  }

  /** ISO → 本地日期短格式，如 "10-23 20:15"。 */
  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /** 两个时间点相差多少天（可为小数）。用于遗忘曲线。 */
  function daysBetween(fromIso, toIso) {
    var a = new Date(fromIso).getTime();
    var b = new Date(toIso).getTime();
    if (isNaN(a) || isNaN(b)) return 0;
    return (b - a) / 86400000;
  }

  /** 截断长文本，按字符数。 */
  function truncate(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  /* ---------------- 文本 → HTML（含公式） ---------------- */

  /**
   * 把用户输入的纯文本渲染成安全的 HTML 片段。
   * - 先转义，再识别 $...$（行内公式）与 $$...$$（独立公式）
   * - 有 KaTeX 就渲染，没有就原样保留（此时公式显示为源码，但不报错）
   * 注意：转义在前，所以公式内容里如果有 < >，仍然安全。
   */
  /**
   * 把用户输入的纯文本渲染成安全的 HTML 片段。
   *
   * ⚠️ 顺序至关重要：**必须先在原文上抽取公式，再转义文本**。
   * 反面教材（本工程踩过）：先 esc() 再渲染公式 → `x>0` 变成 `x&gt;0`，
   * KaTeX 不认识 `&gt;` 这个 HTML 实体，于是整个公式退化成源码，
   * 页面上直接看到 `y=x^{x}\ (x&gt;0)`。含 `<` `>` 的不等式公式在数学里极常见，
   * 所以这条路径必须按「原文抽取 → 文本转义 → 填回渲染结果」来做。
   *
   * 安全性：公式以外的一切都经过 esc()，用户写 <script> 也不会被执行；
   * 公式本身交给 KaTeX 渲染（它输出的是它自己生成的安全 HTML）。
   */
  /**
   * 渲染纯文本为安全 HTML（含 KaTeX 公式）。
   *
   * 现在委托给 mathtext.renderRich，它会在渲染前先做规范化
   * （全角转半角、`\(..\)`→`$..$`、中文包 \text{} 等），
   * 旧数据同样受益。返回 HTML 字符串（mathtext 返回 {html,errors}，
   * 这里取 html，错误信息不抛出，公式失败时退化为源码但不丢内容）。
   */
  function renderRichText(text) {
    var mt = QT.mathtext;
    if (mt && typeof mt.renderRich === 'function') {
      return mt.renderRich(text).html;
    }
    // 兜底：mathtext 未加载时（理论上不会发生，加载顺序里它在前）
    return esc(text == null ? '' : String(text)).replace(/\n/g, '<br>');
  }

  /* ---------------- 轻量 UI 反馈 ---------------- */

  var toastTimer = null;

  /** 页内提示条。避免用 alert()（体验差且阻塞）。 */
  function toast(msg, kind) {
    if (typeof document === 'undefined') return;
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast' + (kind ? ' toast--' + kind : '');
    el.hidden = false;
    // 强制重排以重启动画
    void el.offsetWidth;
    el.classList.add('toast--show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('toast--show');
      setTimeout(function () { el.hidden = true; }, 220);
    }, kind === 'error' ? 3200 : 2000);
  }

  QT.util = {
    uid: uid,
    esc: esc,
    nowIso: nowIso,
    fmtDate: fmtDate,
    daysBetween: daysBetween,
    truncate: truncate,
    renderRichText: renderRichText,
    toast: toast
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
