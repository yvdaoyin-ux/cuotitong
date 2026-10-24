/**
 * app.js —— 路由与外壳（最后加载）
 *
 * 路由用 hash，形如 #/list?subject=calc。
 * 每个页面模块注册成 QT.pages[名字] = { title, render(el, query), after?(el, query) }
 * render 只负责产出 DOM；需要绑事件的放在 after，避免 render 被重复调用时重复绑定。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});
  var util = QT.util;

  QT.pages = QT.pages || {};

  /** 标签栏定义：5 个主入口。设置页从首页进入。 */
  var TABS = [
    { key: 'home', label: '主页', icon: '🏠' },
    { key: 'list', label: '错题本', icon: '📚' },
    { key: 'entry', label: '录错题', icon: '✏️' },
    { key: 'diag', label: '诊断', icon: '📊' },
    { key: 'quiz', label: '组卷', icon: '🎯' }
  ];

  var DEFAULT_KEY = 'home';

  /** 解析 "#/list?subject=calc" → { key:'list', query:{subject:'calc'} } */
  function parseHash() {
    var raw = String(global.location && global.location.hash || '').replace(/^#\/?/, '');
    if (!raw) return { key: DEFAULT_KEY, query: {} };
    var qIdx = raw.indexOf('?');
    var key = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
    var query = {};
    if (qIdx >= 0) {
      raw.slice(qIdx + 1).split('&').forEach(function (pair) {
        if (!pair) return;
        var eq = pair.indexOf('=');
        var k = eq >= 0 ? pair.slice(0, eq) : pair;
        var v = eq >= 0 ? pair.slice(eq + 1) : '';
        try { query[decodeURIComponent(k)] = decodeURIComponent(v); }
        catch (e) { query[k] = v; }
      });
    }
    return { key: key || DEFAULT_KEY, query: query };
  }

  function renderTabbar(activeKey) {
    var bar = document.getElementById('tabbar');
    if (!bar) return;
    bar.innerHTML = TABS.map(function (t) {
      var on = t.key === activeKey ? ' tabbar__btn--on' : '';
      return '<button class="tabbar__btn' + on + '" data-tab="' + util.esc(t.key) + '"' +
        ' aria-current="' + (t.key === activeKey ? 'page' : 'false') + '">' +
        '<span class="tabbar__icon">' + t.icon + '</span>' +
        '<span>' + util.esc(t.label) + '</span></button>';
    }).join('');
  }

  var currentKey = null;
  var currentPage = null;

  function render() {
    var route = parseHash();
    var page = QT.pages[route.key];
    if (!page) {
      // 未知路由回主页，而不是白屏
      global.location.hash = '#/' + DEFAULT_KEY;
      return;
    }
    var el = document.getElementById('view');
    if (!el) return;

    // 切页前让上一页释放资源（诊断页的 ECharts 实例必须销毁，否则 resize 会失效、内存泄漏）
    if (currentPage && typeof currentPage.dispose === 'function') {
      try { currentPage.dispose(); } catch (e) { /* 释放失败不应阻断导航 */ }
    }
    currentPage = page;

    renderTabbar(route.key);
    document.title = (page.title ? page.title + ' · ' : '') + '错题通';

    try {
      el.innerHTML = page.render ? page.render(route.query) || '' : '';
      if (page.after) page.after(el, route.query);
    } catch (err) {
      // 单页崩掉不应让整个应用白屏：把错误显示出来，用户能截图反馈
      el.innerHTML = '<div class="card"><div class="placeholder__title">页面出错了</div>' +
        '<div class="muted">' + util.esc(err && err.message || String(err)) + '</div>' +
        '<p><button class="btn btn--sm" onclick="location.reload()">重新加载</button></p></div>';
    }

    // 录题成功后需要把页面滚回顶部
    if (currentKey !== route.key) global.scrollTo(0, 0);
    currentKey = route.key;
  }

  /** 页面内跳转。所有按钮统一走这里，避免各处写 location.hash 拼接出错。 */
  function go(key, query) {
    var qs = '';
    if (query) {
      var parts = [];
      Object.keys(query).forEach(function (k) {
        if (query[k] == null || query[k] === '') return;
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(query[k]));
      });
      if (parts.length) qs = '?' + parts.join('&');
    }
    global.location.hash = '#/' + key + qs;
  }

  function bindEvents() {
    document.addEventListener('click', function (ev) {
      var tab = ev.target.closest && ev.target.closest('[data-tab]');
      if (tab) { go(tab.getAttribute('data-tab')); return; }
      var nav = ev.target.closest && ev.target.closest('[data-go]');
      if (nav) { go(nav.getAttribute('data-go')); }
    });
    global.addEventListener('hashchange', render);
  }

  /**
   * 图片库初始化（阶段 3）：
   * - 结果挂 QT.imageStoreReady（各页面 await 它；null 表示当前环境不支持图片）
   * - 打不开绝不阻塞主界面，也绝不 reject
   * - 打开后：申请持久存储（失败不报错）+ 清理孤儿图片（指向已删错题的图）
   */
  function initImageStore() {
    var lib = QT.imageStoreLib;
    if (!lib) return Promise.resolve(null);
    return lib.openImageStore().then(function (store) {
      QT.imageStore = store;
      if (store) {
        try {
          if (global.navigator && navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().catch(function () { /* 拒绝就算了 */ });
          }
        } catch (e) { /* ignore */ }
        var live = {};
        QT.storage.load().mistakes.forEach(function (m) { live[m.id] = true; });
        lib.cleanupOrphans(store, live).catch(function () { /* 下次启动再试 */ });
      }
      return store;
    }).catch(function () { return null; });
  }

  function boot() {
    bindEvents();
    QT.imageStoreReady = initImageStore();
    QT.storage.logEvent('app_open');
    render();
  }

  QT.app = { go: go, render: render, parseHash: parseHash, TABS: TABS };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
