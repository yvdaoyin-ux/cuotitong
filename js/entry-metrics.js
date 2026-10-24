/**
 * entry-metrics.js —— 录入耗时与方式埋点（阶段 4.1，任务书 4.1）
 *
 * 两个事件（追加进现有 EventLog，不改旧事件）：
 *   entry_open                       打开录题页
 *   entry_save  载荷 { ms, mode:'quick'|'full'|'continue', toolbarTaps,
 *                      usedPhoto, photoCount, pasted, stemLen, hasSource }
 *
 * 🔴 口径（任务书原文）：
 *   - ms = 从录题页首次获得焦点到点保存的时间
 *   - 页面不可见（visibilitychange）累计超过 5 分钟、或总时长 > 30 分钟的**丢弃不记录**
 *     （任务书没写清 5 分钟是单次还是累计，按累计实现——「宁可少记也不能错记」）
 *   - 载荷里**不得包含题干、答案、来源的任何文本**，只能是长度和计数
 *   - isSample 数据产生的事件继续在导出时排除（export-usage 已有机制）
 *
 * 实现说明：本模块自己绑监听（focusin 捕获首次焦点、paste 标记、visibilitychange
 * 累计隐藏时长），ui-entry 只在 after() 里调 opened()、保存成功后调 saved()，
 * 两个调用点共 3 行，守住 ui-entry.js ≤500 行的约束。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});

  var HIDDEN_DISCARD_MS = 5 * 60 * 1000;  // 不可见累计 >5 分钟丢弃
  var TOTAL_DISCARD_MS = 30 * 60 * 1000;  // 总时长 >30 分钟丢弃

  var state = {
    armed: false,        // 本次录题会话是否在统计
    firstFocusAt: 0,     // 首次获得焦点的时间戳
    openedAt: 0,
    hiddenMs: 0,         // 页面不可见累计毫秒
    hiddenAt: 0,         // 进入隐藏的时刻（0 = 当前可见）
    pasted: false
  };

  function onFormFocus() {
    if (!state.firstFocusAt) state.firstFocusAt = Date.now();
  }

  function onPaste() {
    state.pasted = true;
  }

  function onVisibility() {
    if (typeof document === 'undefined') return;
    if (document.hidden) {
      state.hiddenAt = Date.now();
    } else if (state.hiddenAt) {
      state.hiddenMs += Date.now() - state.hiddenAt;
      state.hiddenAt = 0;
    }
  }

  function unbind(form) {
    if (form) form.removeEventListener('focusin', onFormFocus, true);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
  }

  /**
   * 录题页 after() 时调用：开始统计 + 记 entry_open。
   * @param {Element} el 页面根元素（找 #entry-form 与三个输入框）
   */
  function opened(el) {
    var form = el && el.querySelector ? el.querySelector('#entry-form') : null;
    if (!form) return; // 错题不存在的占位页没有表单，不算一次录题

    state.armed = true;
    state.firstFocusAt = 0;
    state.openedAt = Date.now();
    state.hiddenMs = 0;
    state.hiddenAt = document && document.hidden ? Date.now() : 0;
    state.pasted = false;

    form.addEventListener('focusin', onFormFocus, true);
    ['f-stem', 'f-my', 'f-correct'].forEach(function (id) {
      var t = el.querySelector('#' + id);
      if (t) t.addEventListener('paste', onPaste);
    });
    document.addEventListener('visibilitychange', onVisibility);

    if (QT.toolbar) QT.toolbar.resetTaps();
    if (QT.uiOcr && QT.uiOcr.resetMetrics) QT.uiOcr.resetMetrics(); // B3：识别计数按本次录题会话归零
    QT.storage.logEvent('entry_open');
  }

  /**
   * 保存成功后调用（存储层写成功才算，失败不记）。
   * @param {object} payload collect() 的结果
   * @param {string} mode 'quick' | 'full' | 'continue'
   */
  function saved(payload, mode) {
    if (!state.armed) return;
    unbind();

    var now = Date.now();
    var ms = state.firstFocusAt ? now - state.firstFocusAt : 0;

    // 丢弃规则：不可见累计 >5 分钟，或从打开到保存 >30 分钟 → 宁可不记也不能记错
    if (state.hiddenMs > HIDDEN_DISCARD_MS || (now - state.openedAt) > TOTAL_DISCARD_MS) {
      state.armed = false;
      return;
    }

    var photoCount = Array.isArray(payload.imageIds) ? payload.imageIds.length : 0;
    // B3（第四份任务书）：识别埋点——只有计数与耗时，绝无识别文字
    var om = (QT.uiOcr && QT.uiOcr.metrics) ? QT.uiOcr.metrics() : null;
    QT.storage.logEvent('entry_save', {
      ms: ms,
      mode: mode === 'continue' ? 'continue' : (mode === 'quick' ? 'quick' : 'full'),
      toolbarTaps: QT.toolbar ? QT.toolbar.taps : 0,
      usedPhoto: photoCount > 0,
      photoCount: photoCount,
      pasted: state.pasted,
      stemLen: String(payload.stem == null ? '' : payload.stem).trim().length,
      hasSource: !!String(payload.source == null ? '' : payload.source).trim(),
      ocrUsed: !!(om && om.used),
      ocrClicks: om ? om.clicks : 0,
      ocrOkCount: om ? om.okCount : 0,
      ocrMsTotal: om ? om.msTotal : 0,
      ocrChars: om ? om.chars : 0
    });
    state.armed = false;
  }

  QT.entryMetrics = { opened: opened, saved: saved };
})(typeof globalThis !== 'undefined' ? globalThis : this);
