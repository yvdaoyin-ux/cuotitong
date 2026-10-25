/**
 * ui-toolbar.js —— 公式工具栏（阶段 2）
 *
 * 行为（任务书 2.2）：
 *   - 题干 / 我的答案 / 解析任一获得焦点时出现，跟随当前焦点的框
 *   - 按钮用 pointerdown + preventDefault() 触发插入，**不让输入法键盘收起**
 *   - 固定在可视视口底部（visualViewport resize/scroll 跟随软键盘上沿）；
 *     不支持时退化为固定在底部标签栏上方（任务书要求退化为输入框上方静态条，见汇报调整 #5）
 *   - 插入：光标处插入；有选中文本时放进第一个 ▮；插入后选中第一个 ▮
 *   - 「⏭ 下一个占位」跳转；「$…$」手动包裹；「↶ 撤销」自建最小栈（textarea 原生撤销被程序化修改打断）
 *   - 最近使用 8 个，localStorage 单独键 qt:recentSymbols（界面偏好，不进业务数据不进导出）
 *   - 每次插入后向 textarea 派发 input 事件 → 实时预览同步更新
 *
 * 保存前残留检查：QT.toolbar.guardResidual(payload) 由 ui-entry 在保存时调用。
 * 埋点计数：QT.toolbar.taps（本次会话内累计，entry-metrics 读取后由 opened() 归零）。
 *
 * 本文件在 Node 里被测试加载（只用到纯函数导出），DOM 部分全部惰性初始化。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});
  var util = QT.util;

  var RECENT_KEY = 'qt:recentSymbols';
  var RECENT_MAX = 8;
  var UNDO_MAX = 50;

  var toolbarEl = null;   // 惰性创建
  var currentTa = null;   // 当前焦点的 textarea
  var activeGroup = null; // 当前分组
  var undoStack = [];     // { ta, text, selStart, selEnd }
  var taps = 0;           // 工具栏点击计数（埋点）
  var vvBound = false;

  /* ---------------- 最近使用 ---------------- */

  function loadRecent() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(RECENT_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function bumpRecent(tip) {
    try {
      if (!global.localStorage) return;
      var next = [tip].concat(loadRecent().filter(function (t) { return t !== tip; })).slice(0, RECENT_MAX);
      global.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch (e) { /* 偏好失败不影响主流程 */ }
    if (toolbarEl) renderTabs(); // 「最近」标签的显隐与高亮跟着变
  }

  function itemByTip(tip) {
    var hit = null;
    QT.symbols.SYMBOLS.forEach(function (s) { if (s.tip === tip && !hit) hit = s; });
    return hit;
  }

  /* ---------------- DOM ---------------- */

  var RECENT_GROUP = '__recent__'; // 「最近」不是真分组，是分组标签里的第一个虚拟标签

  function katexTex(item) {
    try {
      if (global.katex) {
        return global.katex.renderToString(QT.symbols.texOf(item), { throwOnError: false });
      }
    } catch (e) { /* 渲染失败退化为纯文本 */ }
    return util.esc(item.tip);
  }

  function symBtnHtml(item) {
    return '<button type="button" class="fbar__btn" data-sym-tip="' + util.esc(item.tip) + '"' +
      ' aria-label="' + util.esc(item.tip) + '">' + katexTex(item) + '</button>';
  }

  function recentTips() { return loadRecent(); }

  /** 分组标签行：有最近使用时「最近」排第一（v1.2 A2：不再独占一行）。 */
  function renderTabs() {
    var tabs = toolbarEl.querySelector('#fbar-tabs');
    var html = '';
    if (recentTips().length) {
      var on = activeGroup === RECENT_GROUP ? ' fbar__tab--on' : '';
      html += '<button type="button" class="fbar__tab' + on + '" data-group="' + RECENT_GROUP + '">' +
        '最近</button>';
    }
    html += QT.symbols.GROUPS.map(function (g) {
      var on = g === activeGroup ? ' fbar__tab--on' : '';
      return '<button type="button" class="fbar__tab' + on + '" data-group="' + util.esc(g) + '">' +
        util.esc(g) + '</button>';
    }).join('');
    tabs.innerHTML = html;
  }

  function renderGroup() {
    var row = toolbarEl.querySelector('#fbar-syms');
    if (activeGroup === RECENT_GROUP) {
      row.innerHTML = recentTips().map(function (tip) {
        var item = itemByTip(tip);
        return item ? symBtnHtml(item) : '';
      }).join('');
      return;
    }
    row.innerHTML = QT.symbols.SYMBOLS.filter(function (s) { return s.group === activeGroup; })
      .map(symBtnHtml).join('');
  }

  function ensureToolbar() {
    if (toolbarEl) return toolbarEl;
    toolbarEl = document.createElement('div');
    toolbarEl.id = 'formula-bar';
    toolbarEl.className = 'fbar';
    toolbarEl.hidden = true;
    // v1.2 A2 两行布局：第一行 = 分组标签（横滑）+ 右侧固定 ⏭/↶；第二行 = 符号按钮
    toolbarEl.innerHTML =
      '<div class="fbar__top">' +
        '<div class="fbar__tabs" id="fbar-tabs"></div>' +
        '<button type="button" class="fbar__tool" data-tool="next" aria-label="下一个占位符">⏭</button>' +
        '<button type="button" class="fbar__tool" data-tool="undo" aria-label="撤销上一步插入">↶</button>' +
      '</div>' +
      '<div class="fbar__row" id="fbar-syms"></div>';
    document.body.appendChild(toolbarEl);
    activeGroup = QT.symbols.GROUPS[0];
    renderTabs();
    renderGroup();

    // 注意：pointerdown + preventDefault：阻止焦点转移，输入法键盘不收起（任务书 2.2）
    // 所有动作都在 pointerdown 里做，click 一律忽略
    toolbarEl.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      var tab = ev.target.closest('[data-group]');
      if (tab) {
        activeGroup = tab.getAttribute('data-group');
        renderTabs(); renderGroup();
        return;
      }
      if (!currentTa) return;
      var sym = ev.target.closest('[data-sym-tip]');
      if (sym) {
        var item = itemByTip(sym.getAttribute('data-sym-tip'));
        if (item) insert(item);
        return;
      }
      var tool = ev.target.closest('[data-tool]');
      if (tool) {
        if (tool.getAttribute('data-tool') === 'next') jumpNext();
        else if (tool.getAttribute('data-tool') === 'undo') undo();
      }
    });

    bindViewportFollow();
    return toolbarEl;
  }

  /* ---------------- 插入 / 跳转 / 撤销 ---------------- */

  function pushUndo() {
    if (!currentTa) return;
    undoStack.push({
      ta: currentTa,
      text: currentTa.value,
      selStart: currentTa.selectionStart,
      selEnd: currentTa.selectionEnd
    });
    if (undoStack.length > UNDO_MAX) undoStack.shift();
  }

  /** 插入后必须派发 input：录题页的实时预览靠它同步（任务书验收 3）。 */
  function applyTo(ta, r) {
    ta.value = r.text;
    ta.setSelectionRange(r.selStart, r.selEnd);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function insert(item) {
    var ta = currentTa;
    if (!ta) return;
    pushUndo();
    var s = ta.selectionStart, e = ta.selectionEnd;
    var inside = QT.mathtext ? QT.mathtext.isInsideMath(ta.value, s) : false;
    applyTo(ta, QT.symbols.insertAt(ta.value, s, e, item.insert, inside));
    bumpRecent(item.tip);
    taps += 1;
    ta.focus(); // 双保险：即使浏览器仍收了焦点也拉回来
  }

  function jumpNext() {
    var ta = currentTa;
    if (!ta) return;
    pushUndo();
    var ph = QT.symbols.nextPlaceholder(ta.value, ta.selectionEnd);
    if (!ph) { util.toast('没有占位符了'); return; }
    ta.setSelectionRange(ph.start, ph.end);
    taps += 1;
    ta.focus();
  }

  function undo() {
    var step = undoStack.pop();
    if (!step || !step.ta) { util.toast('没有可撤销的操作'); return; }
    applyTo(step.ta, { text: step.text, selStart: step.selStart, selEnd: step.selEnd });
    taps += 1;
    step.ta.focus();
  }

  /* ---------------- 焦点跟随与显隐 ---------------- */

  function show() {
    ensureToolbar();
    toolbarEl.hidden = false;
    // v1.2 A2：给页面底部加与工具栏等高的 padding——让「可滚动范围」覆盖到工具栏上方，
    // 用户可以滚到不被遮挡的位置（Claude 方案二选一里的 padding 方案；
    // 上一版 scrollIntoView('nearest') 实测不感知 fixed 遮挡，弃用——见汇报调整 #1）
    applyBodyPadding();
    keepTextareaVisible();
  }
  function hide() {
    if (toolbarEl) toolbarEl.hidden = true;
    currentTa = null;
    undoStack = [];
    document.body.style.paddingBottom = '';
  }

  function applyBodyPadding() {
    if (!toolbarEl || toolbarEl.hidden) return;
    var h = Math.round(toolbarEl.getBoundingClientRect().height);
    document.body.style.paddingBottom = h + 'px';
  }

  /**
   * 显式校正：输入框底边一旦被工具栏（fixed）盖住，就把页面滚到它完整露出为止。
   * 原生聚焦滚动是 nearest 语义，不感知 fixed 遮挡——实测必须自己校正。
   * （body padding 只保证「能滚到」，这里保证「真滚到」。）
   */
  function keepTextareaVisible() {
    if (!currentTa || !toolbarEl || toolbarEl.hidden) return;
    var barTop = toolbarEl.getBoundingClientRect().top;
    var r = currentTa.getBoundingClientRect();
    if (r.bottom > barTop) {
      global.scrollBy(0, Math.ceil(r.bottom - barTop + 8));
    }
  }

  function bindGlobal() {
    document.addEventListener('focusin', function (ev) {
      var t = ev.target;
      // 只挂录题页的三个公式相关输入框（任务书 2.2：作用对象）
      if (t && t.tagName === 'TEXTAREA' && /^(f-stem|f-my|f-correct)$/.test(t.id)) {
        currentTa = t;
        show();
      }
    });
    document.addEventListener('focusout', function (ev) {
      if (ev.target === currentTa) {
        // pointerdown 已 preventDefault，按钮点击不会触发这条；真正点别处才收
        var to = ev.relatedTarget;
        if (!to || !toolbarEl || !toolbarEl.contains(to)) hide();
      }
    });
    global.addEventListener('hashchange', hide); // 切页必收
  }

  /* ---------------- visualViewport 跟随 ---------------- */

  function bindViewportFollow() {
    if (vvBound) return;
    var vv = global.visualViewport;
    if (!vv) return; // 退化：CSS 里默认停在标签栏上方
    vvBound = true;
    var follow = function () {
      if (!toolbarEl || toolbarEl.hidden) return;
      // 软键盘把可视视口顶上去多少，工具栏就抬多少
      var overlap = global.innerHeight - vv.height - vv.offsetTop;
      toolbarEl.style.bottom = Math.max(0, Math.round(overlap)) + 'px';
      // 底部 padding 同步抬高（工具栏 bottom + 自身高度），
      // 保证焦点元素始终能滚到工具栏上方
      applyBodyPadding();
      // 注意：这里只调 padding 不做滚动校正：用户聚焦后有权自由滚动查看别处，
      //    跟着滚事件校正会强行把页面拉回输入框（v1.2 实测踩到）。
      //    校正只在「聚焦瞬间」（show）和「键盘尺寸变化」（resize→onResize）做。
    };
    var onResize = function () {
      if (!toolbarEl || toolbarEl.hidden) return;
      follow();
      keepTextareaVisible(); // 键盘弹出/收起时校正一次
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', follow);
  }

  /* ---------------- 对外接口 ---------------- */

  /**
   * 保存前检查残留占位符（任务书 2.2：保存时若还有 ▮，弹一次确认）。
   * @param {object} payload collect() 的结果（stem / myAnswer / correctAnswer）
   * @returns {boolean} true = 放行
   */
  function guardResidual(payload) {
    var fields = [
      { name: '题干', v: payload.stem },
      { name: '我的答案', v: payload.myAnswer },
      { name: '解析', v: payload.correctAnswer }
    ];
    var bad = fields.filter(function (f) { return QT.symbols.hasResidual(f.v); });
    if (!bad.length) return true;
    return global.confirm('「' + bad.map(function (f) { return f.name; }).join('」「') +
      '」里还有占位符 ▮ 没有填。原样保存吗？');
  }

  // 录题页打开时归零（entry-metrics 每题独立统计工具栏点击）
  function resetTaps() { taps = 0; }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindGlobal);
    } else {
      bindGlobal();
    }
  }

  QT.toolbar = {
    guardResidual: guardResidual,
    resetTaps: resetTaps,
    insert: insert,
    jumpNext: jumpNext,
    undo: undo,
    get taps() { return taps; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
