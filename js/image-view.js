/**
 * image-view.js —— 图片的展示层：objectURL 生命周期、缩略图注水、全屏查看器
 *
 * 三件事：
 * 1. urlFor(blob)：统一创建 objectURL 并登记，页面切换时 revokeAll() 统一释放
 *    （任务书 3.3：URL.createObjectURL 用完要 revokeObjectURL）。
 * 2. hydrate(root)：把页面上 data-img-ids="a,b" 的占位盒异步填成缩略图。
 *    渲染是同步的、取图是异步的，所以渲染时只留占位，取到再填。
 * 3. 全屏查看器：黑底覆盖层 + 双指缩放 + 双击缩放（任务书：CSS touch-action + 简单实现，不引库）。
 *
 * 本文件在浏览器里才工作；Node 测试不会加载它。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});

  /* ---------------- objectURL 生命周期 ---------------- */

  var liveUrls = [];       // 本页面周期内创建的全部 objectURL
  var urlByImageId = {};   // imageId → objectURL（已取到 blob 的图，供查看器复用）

  function urlFor(blob) {
    var url = URL.createObjectURL(blob);
    liveUrls.push(url);
    return url;
  }

  /** 页面切换时由 dispose() 调用：释放本页所有 objectURL。 */
  function revokeAll() {
    liveUrls.forEach(function (u) {
      try { URL.revokeObjectURL(u); } catch (e) { /* 忽略单个释放失败 */ }
    });
    liveUrls = [];
    urlByImageId = {};
    closeViewer();
  }

  /* ---------------- 缩略图注水 ---------------- */

  /**
   * 把 root 内所有 [data-img-ids] 占位盒填上缩略图。
   * 占位盒由各页面同步渲染时留下，形如：
   *   <div class="imgstrip" data-img-ids="id1,id2"></div>
   * 填充后每个缩略图是 <button class="imgthumb" data-view="i"><img></button>，
   * 点击由本文件的全局委托打开查看器。
   */
  function hydrate(root) {
    if (typeof document === 'undefined' || !root) return Promise.resolve();
    return Promise.resolve(QT.imageStoreReady || null).then(function (store) {
      if (!store) return;
      var boxes = root.querySelectorAll('[data-img-ids]');
      Array.prototype.forEach.call(boxes, function (box) {
        if (box.getAttribute('data-imgs-done')) return; // 防止重复注入
        box.setAttribute('data-imgs-done', '1');
        var ids = box.getAttribute('data-img-ids').split(',').filter(Boolean);
        if (!ids.length) return;
        // 列表模式（.imgstrip--list）：只显示第一张的整宽 contain 预览 + 「共 N 张」角标，
        // 点击仍经全局委托打开查看器翻全部（v1.2 A1：原来 96px cover 裁切看不出是哪道题）
        var listMode = box.classList.contains('imgstrip--list');
        var chain = Promise.resolve();
        ids.forEach(function (id, i) {
          if (listMode && i > 0) return; // 列表只取第一张
          chain = chain.then(function () {
            return store.get(id).then(function (rec) {
              if (!rec || !rec.blob) return; // 图片缺失（如导入的备份没带图）时安静跳过
              urlByImageId[id] = urlFor(rec.blob);
              var btn = document.createElement('button');
              btn.type = 'button';
              btn.className = listMode ? 'imgthumb imgthumb--wide' : 'imgthumb';
              btn.setAttribute('data-view', id);
              btn.setAttribute('aria-label', '查看第 ' + (i + 1) + ' 张图片');
              var img = document.createElement('img');
              img.alt = '题目图片';
              img.src = urlByImageId[id];
              btn.appendChild(img);
              if (listMode && ids.length > 1) {
                var badge = document.createElement('span');
                badge.className = 'imgthumb__count';
                badge.textContent = '共 ' + ids.length + ' 张';
                btn.appendChild(badge);
              }
              box.appendChild(btn);
            });
          });
        });
      });
    });
  }

  /* ---------------- 全屏查看器 ---------------- */

  var viewerEl = null;

  function ensureViewer() {
    if (viewerEl) return viewerEl;
    viewerEl = document.createElement('div');
    viewerEl.className = 'imgview';
    viewerEl.hidden = true;
    viewerEl.innerHTML =
      '<button type="button" class="imgview__close" aria-label="关闭">✕</button>' +
      '<div class="imgview__stage"><img class="imgview__img" alt="题目图片大图"></div>' +
      '<div class="imgview__bar"></div>';
    document.body.appendChild(viewerEl);

    // ✕ 与遮罩空白处点击关闭（点图片本体不关，方便缩放操作）
    viewerEl.querySelector('.imgview__close').addEventListener('click', closeViewer);
    viewerEl.addEventListener('click', function (ev) {
      if (ev.target === viewerEl || ev.target.classList.contains('imgview__stage')) closeViewer();
    });

    bindZoom(viewerEl.querySelector('.imgview__stage'), viewerEl.querySelector('.imgview__img'));
    return viewerEl;
  }

  /**
   * 双指捏合缩放 + 双击切换 1x/2x。
   * 实现：监听 touch 事件改 CSS transform，用 touch-action:none 交给 JS 全权处理。
   */
  function bindZoom(stage, img) {
    var scale = 1;
    var startDist = 0;
    var startScale = 1;

    function apply() {
      img.style.transform = 'scale(' + scale + ')';
    }
    function reset() {
      scale = 1;
      apply();
    }

    stage.addEventListener('touchstart', function (ev) {
      if (ev.touches.length === 2) {
        startDist = touchDist(ev);
        startScale = scale;
      }
    }, { passive: true });
    stage.addEventListener('touchmove', function (ev) {
      if (ev.touches.length === 2 && startDist > 0) {
        ev.preventDefault();
        scale = Math.min(5, Math.max(1, startScale * touchDist(ev) / startDist));
        apply();
      }
    });
    stage.addEventListener('touchend', function () { startDist = 0; });

    var lastTap = 0;
    stage.addEventListener('touchend', function (ev) {
      var now = Date.now();
      if (ev.touches.length === 0 && now - lastTap < 300) {
        scale = scale > 1 ? 1 : 2;
        apply();
      }
      lastTap = now;
    });

    // 桌面：滚轮缩放（真机没有鼠标，此为开发调试便利）
    stage.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      scale = Math.min(5, Math.max(1, scale + (ev.deltaY < 0 ? 0.25 : -0.25)));
      apply();
    });

    stage.addEventListener('transitionend', function () { /* 保留钩子 */ });
    reset();
  }

  function touchDist(ev) {
    var a = ev.touches[0];
    var b = ev.touches[1];
    var dx = a.clientX - b.clientX;
    var dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * 打开全屏查看器。
   * @param {object} opts
   *   ids:      [imageId] 要看的图片 id 列表（会先经 urlByImageId，未取到的跳过）
   *   urls:     [string]  或者直接给 objectURL（录题页还没入库的临时图）
   *   index:    初始下标，默认 0
   *   actions:  [{label, fn}] 底部操作按钮（如「删除这张」「重拍这张」），可省略
   */
  function openViewer(opts) {
    opts = opts || {};
    var v = ensureViewer();
    var img = v.querySelector('.imgview__img');
    var bar = v.querySelector('.imgview__bar');

    var urls = (opts.urls || []).slice();
    var idList = opts.ids || [];
    if (idList.length && !urls.length) {
      urls = idList.map(function (id) { return urlByImageId[id]; }).filter(Boolean);
    }
    if (!urls.length) return;

    var index = Math.min(Number(opts.index) || 0, urls.length - 1);

    function show() {
      img.src = urls[index];
      img.style.transform = 'scale(1)';
      // 多图时左右切换；单图隐藏
      var nav = v.querySelector('.imgview__nav');
      if (nav) nav.remove();
      if (urls.length > 1) {
        var el = document.createElement('div');
        el.className = 'imgview__nav';
        el.innerHTML = '<button type="button" class="imgview__navbtn" data-nav="-1">‹</button>' +
          '<span class="imgview__pos">' + (index + 1) + '/' + urls.length + '</span>' +
          '<button type="button" class="imgview__navbtn" data-nav="1">›</button>';
        el.addEventListener('click', function (ev) {
          var b = ev.target.closest('[data-nav]');
          if (!b) return;
          index = (index + Number(b.getAttribute('data-nav')) + urls.length) % urls.length;
          show();
        });
        v.appendChild(el);
      }
    }

    // 底部操作按钮（重拍 / 删除等），点完自动收起查看器
    bar.innerHTML = '';
    (opts.actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn imgview__act';
      b.textContent = a.label;
      b.addEventListener('click', function () {
        closeViewer();
        if (typeof a.fn === 'function') a.fn();
      });
      bar.appendChild(b);
    });

    show();
    v.hidden = false;
  }

  function closeViewer() {
    if (viewerEl && !viewerEl.hidden) {
      viewerEl.hidden = true;
      viewerEl.querySelector('.imgview__img').src = '';
    }
  }

  /* ---------------- 全局点击委托：点缩略图 → 打开查看器 ---------------- */

  function bindGlobalDelegation() {
    document.addEventListener('click', function (ev) {
      var btn = ev.target.closest && ev.target.closest('[data-view]');
      if (!btn) return;
      var box = btn.closest('[data-img-ids]');
      if (!box) return;
      var ids = box.getAttribute('data-img-ids').split(',').filter(Boolean);
      openViewer({ ids: ids, index: Math.max(0, ids.indexOf(btn.getAttribute('data-view'))) });
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindGlobalDelegation);
    } else {
      bindGlobalDelegation();
    }
  }

  QT.imageView = {
    urlFor: urlFor,
    revokeAll: revokeAll,
    hydrate: hydrate,
    open: openViewer,
    close: closeViewer,
    urlOf: function (id) { return urlByImageId[id] || null; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
