/**
 * ui-entry-photo.js —— 录题页的拍照 / 相册卡（阶段 3 核心）
 *
 * 交互（任务书 3.1 + AGENTS.md 阶段 3 约束）：
 *   - 极速模式下照片是首选路径：拍完立即原位显示缩略图，点缩略图可重拍或删除
 *   - 每题最多 3 张（任务书规定）
 *   - 「保存并继续」之后照片清空，其余保留（与文本字段一致）
 *   - IndexedDB 不可用时隐藏按钮，显示「当前环境不支持保存图片」提示，不影响其他功能
 *
 * 数据流：
 *   拍照 → compressFile 压缩 → 待提交池（内存，缩略图用 objectURL）
 *   保存错题 → commit(qid)：待提交池写入 IndexedDB（qid 落到真实错题 id），
 *             编辑态里被移除的旧图从库里删除
 *   图片二进制全程不进 localStorage / 不进 qt:db JSON
 *
 * 临时图用 uid('img') 预生成 id 并先写进 draft.imageIds，
 * 这样「只拍照不填字」在保存校验里就算「有内容」。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});
  var util = QT.util;
  var pipeline = QT.imagePipeline;

  /* ---------------- 模块状态（每次 attach 重置） ---------------- */

  var draft = null;        // ui-entry 的 draft（读写 draft.imageIds）
  var store = null;        // ImageStore，降级时保持 null
  var stripEl = null;
  var pending = [];        // [{ id, record:{id,qid:null,w,h,size,createdAt}, blob, url }]
  var removed = [];        // 编辑态里被用户移除的旧图 id，commit 时才真正删除
  var urls = [];           // 本模块创建的全部 objectURL，reset 时统一 revoke
  var existingUrls = {};   // 旧图 id → objectURL（编辑态点开大图用）

  /* ---------------- HTML ---------------- */

  function html(d) {
    return '' +
      '<div class="card" id="photo-card">' +
        '<div class="label">题目图片（可选，最多 ' + pipeline.MAX_PER_MISTAKE + ' 张）</div>' +
        '<div class="photo-actions" id="photo-actions">' +
          '<button type="button" class="btn" id="btn-cam" disabled>📷 拍照</button>' +
          '<button type="button" class="btn" id="btn-album" disabled>🖼️ 相册</button>' +
          '<button type="button" class="btn" id="btn-ocr" hidden>🔍 识别文字</button>' +
          '<input type="file" id="file-cam" accept="image/*" capture="environment" hidden>' +
          '<input type="file" id="file-album" accept="image/*" multiple hidden>' +
        '</div>' +
        '<div class="imgstrip" id="photo-strip"></div>' +
        '<div class="entry-err" id="photo-err" hidden></div>' +
        '<div class="hint" id="photo-hint">拍完自动压缩（长边 1280）后只存在本机，不会上传。</div>' +
      '</div>';
  }

  /* ---------------- 缩略图 ---------------- */

  function trackUrl(blob) {
    var url = URL.createObjectURL(blob);
    urls.push(url);
    return url;
  }

  function renderStrip() {
    if (!stripEl) return;
    var out = '';
    // 先旧图（编辑态），后新拍的——与 draft.imageIds 顺序一致更好，但简单起见分两段展示
    (draft.imageIds || []).forEach(function (id) {
      var p = findPending(id);
      if (p) {
        out += thumbHtml(id, p.url, '新');
      } else if (!isRemoved(id)) {
        // 旧图：url 异步加载后补进 existingUrls，先渲染占位
        out += thumbHtml(id, existingUrls[id] || '', '旧');
      }
    });
    stripEl.innerHTML = out;
    // 占位的旧图去库里取 blob
    (draft.imageIds || []).forEach(function (id) {
      if (findPending(id) || isRemoved(id) || existingUrls[id]) return;
      if (!store) return;
      store.get(id).then(function (rec) {
        if (!rec || !rec.blob) return; // 图缺失（如备份没带图）就安静跳过
        existingUrls[id] = trackUrl(rec.blob);
        var btn = stripEl.querySelector('[data-ephoto="' + id + '"] img');
        if (btn) btn.src = existingUrls[id];
      }).catch(function () { /* 取图失败不影响录题 */ });
    });
  }

  function thumbHtml(id, url, tag) {
    return '<div class="imgthumb-wrap">' +
      '<button type="button" class="imgthumb" data-ephoto="' + util.esc(id) + '" ' +
        'aria-label="查看图片（' + (tag === '新' ? '新拍' : '已有') + '）">' +
        (url ? '<img alt="题目图片" src="' + url + '">' : '<span class="imgthumb__loading">…</span>') +
      '</button>' +
      '<button type="button" class="imgthumb-del" data-edel="' + util.esc(id) + '" ' +
        'aria-label="删除这张图片">✕</button>' +
    '</div>';
  }

  function findPending(id) {
    for (var i = 0; i < pending.length; i++) if (pending[i].id === id) return pending[i];
    return null;
  }
  function isRemoved(id) { return removed.indexOf(id) >= 0; }

  /* ---------------- 拍照 / 相册 ---------------- */

  function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (f) {
      return f && /^image\//.test(f.type);
    });
    if (!files.length) return;
    var room = pipeline.MAX_PER_MISTAKE - (draft.imageIds || []).length;
    if (room <= 0) {
      showErr('每题最多 ' + pipeline.MAX_PER_MISTAKE + ' 张图片，先删掉一张再拍。');
      return;
    }
    if (files.length > room) {
      showErr('最多还能加 ' + room + ' 张，多出的已忽略。');
      files = files.slice(0, room);
    }
    hideErr();

    var chain = Promise.resolve();
    files.forEach(function (file) {
      chain = chain.then(function () {
        return pipeline.compressFile(file).then(function (r) {
          var id = util.uid('img');
          pending.push({
            id: id,
            record: {
              id: id, qid: null,
              blob: r.blob, w: r.w, h: r.h,
              size: r.blob.size, createdAt: util.nowIso()
            },
            blob: r.blob,
            url: trackUrl(r.blob) // 缩略图立刻可见
          });
          draft.imageIds.push(id);
          renderStrip(); // 逐张显示，拍完一张立刻见
        }).catch(function (e) {
          showErr('这张图片处理失败：' + (e.message || e));
        });
      });
    });
  }

  /* ---------------- 删除 / 重拍 ---------------- */

  function removeOne(id) {
    var p = findPending(id);
    if (p) {
      URL.revokeObjectURL(p.url);
      urls = urls.filter(function (u) { return u !== p.url; });
      pending = pending.filter(function (x) { return x.id !== id; });
    } else {
      removed.push(id); // 旧图：commit 时才真正从库里删，取消保存可反悔
    }
    var arr = draft.imageIds;
    var i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    renderStrip();
  }

  function retake(id) {
    removeOne(id);
    var cam = document.getElementById('file-cam');
    if (cam) cam.click(); // 删掉这张立刻补拍
  }

  /**
   * A3：把某张图顺时针旋转 90°。编排逻辑在 photo-rotate.js（第五份任务书拆分），
   * 这里只提供内部状态的最小访问面。
   */
  function rotateOne(id) {
    QT.photoRotate.rotateOne(id, {
      findPending: findPending,
      isRemoved: isRemoved,
      getStore: function () { return store; },
      pipeline: function () { return pipeline; },
      replacePending: function (p, r) {
        URL.revokeObjectURL(p.url);
        p.blob = r.blob;
        p.record.blob = r.blob;
        p.record.w = r.w;
        p.record.h = r.h;
        p.record.size = r.blob.size;
        p.url = trackUrl(r.blob);
        hideErr();
        renderStrip();
      },
      replaceStored: function (oldId, r) {
        removed.push(oldId); // 与删除旧图同规则：要点「保存」才真正生效
        var nid = util.uid('img');
        pending.push({
          id: nid,
          record: { id: nid, qid: null, blob: r.blob, w: r.w, h: r.h, size: r.blob.size, createdAt: util.nowIso() },
          blob: r.blob,
          url: trackUrl(r.blob)
        });
        var arr = draft.imageIds;
        var i = arr.indexOf(oldId);
        if (i >= 0) arr[i] = nid;
        hideErr();
        renderStrip();
      },
      onError: showErr
    });
  }

  /* ---------------- 保存时的提交 ---------------- */

  /**
   * 把待提交池写入图片库，并删除编辑态移除的旧图。
   * @param {string} qid 错题 id（新增时是刚 addMistake 生成的 id）
   * @returns {Promise<{added:string[], failedIds:string[], removedCount:number}>}
   */
  function commit(qid) {
    if (!store) {
      return Promise.resolve({ added: [], failedIds: [], removedCount: 0 });
    }
    var adds = pending.map(function (p) {
      var rec = Object.assign({}, p.record, { qid: qid });
      return store.put(rec).then(
        function () { return { id: p.id, ok: true }; },
        function () { return { id: p.id, ok: false }; }
      );
    });
    var dels = removed.map(function (id) {
      return store.delete(id).then(function () { return 1; }, function () { return 0; });
    });
    return Promise.all(adds).then(function (results) {
      var added = [], failedIds = [];
      results.forEach(function (r) { (r.ok ? added : failedIds).push(r.id); });
      return Promise.all(dels).then(function (ds) {
        return {
          added: added,
          failedIds: failedIds,
          removedCount: ds.reduce(function (a, b) { return a + b; }, 0)
        };
      });
    });
  }

  /**
   * 错题保存后由 ui-entry 调用：提交照片池。
   * 个别图存失败（如配额满）时，把失败 id 从错题记录里摘掉，
   * 避免错题留下指向不存在图片的 imageId。
   */
  function saveFor(qid) {
    return commit(qid).then(function (res) {
      if (res.failedIds.length && QT.storage) {
        var kept = QT.storage.getMistake(qid).imageIds.filter(function (id) {
          return res.failedIds.indexOf(id) < 0;
        });
        QT.storage.updateMistake(qid, { imageIds: kept });
        util.toast('有 ' + res.failedIds.length + ' 张图片保存失败（存储空间不足？）', 'error');
      }
      return res;
    });
  }

  /**
   * 「保存并继续」后清空照片池（与文本字段同待遇）：释放 objectURL、
   * 清空 pending / removed 与 draft.imageIds，并重渲染空缩略图条。
   * store 与页面元素保留，本页继续可用。
   */
  function reset() {
    pending.forEach(function (p) { if (p.url) URL.revokeObjectURL(p.url); });
    urls.forEach(function (u) { URL.revokeObjectURL(u); });
    pending = [];
    removed = [];
    urls = [];
    existingUrls = {};
    if (draft) draft.imageIds = [];
    renderStrip();
  }

  /** 离开录题页（dispose）：在 reset 之上把模块状态彻底清掉。 */
  function dispose() {
    reset();
    draft = null;
    store = null;
    stripEl = null;
  }

  /**
   * OCR（C4）用：取最近一张可识别照片的 Blob——先新拍池（还没入库），
   * 再已入库的旧图（编辑态）。一张都没有 / 库不可用 → resolve(null)。
   * @returns {Promise<Blob|null>}
   */
  function getBlobForOcr() {
    if (pending.length) return Promise.resolve(pending[pending.length - 1].blob);
    var ids = (draft && draft.imageIds) || [];
    if (!ids.length || !store) return Promise.resolve(null);
    return store.get(ids[ids.length - 1]).then(function (rec) {
      return (rec && rec.blob) ? rec.blob : null;
    }).catch(function () { return null; });
  }

  /* ---------------- 错误 / 提示 ---------------- */

  function showErr(msg) {
    var el = document.getElementById('photo-err');
    if (el) { el.textContent = msg; el.hidden = false; }
  }
  function hideErr() {
    var el = document.getElementById('photo-err');
    if (el) el.hidden = true;
  }

  /* ---------------- 绑定 ---------------- */

  function attach(el, d) {
    draft = d;
    // 上一次录题页可能留下未释放的 objectURL，先清干净再重新登记
    urls.forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } });
    pending = [];
    removed = [];
    urls = [];
    existingUrls = {};
    stripEl = el.querySelector('#photo-strip');
    if (!stripEl) return;

    renderStrip();

    var btnCam = el.querySelector('#btn-cam');
    var btnAlbum = el.querySelector('#btn-album');
    var fileCam = el.querySelector('#file-cam');
    var fileAlbum = el.querySelector('#file-album');
    var hint = el.querySelector('#photo-hint');

    btnCam.addEventListener('click', function () { fileCam.click(); });
    btnAlbum.addEventListener('click', function () { fileAlbum.click(); });
    fileCam.addEventListener('change', function () {
      addFiles(fileCam.files);
      fileCam.value = ''; // 允许重复选同一张
    });
    fileAlbum.addEventListener('change', function () {
      addFiles(fileAlbum.files);
      fileAlbum.value = '';
    });

    // OCR（C4）：按钮默认 hidden，由 ui-ocr 视密钥有无决定是否露出；无此模块则一直隐藏
    if (QT.uiOcr) QT.uiOcr.bind(el);

    // 缩略图点击：新图可重拍/删除；旧图可删除（都用带操作按钮的全屏查看器）
    stripEl.addEventListener('click', function (ev) {
      var del = ev.target.closest('[data-edel]');
      if (del) {
        var id0 = del.getAttribute('data-edel');
        if (findPending(id0)) {
          removeOne(id0); // 还没入库，直接删
        } else if (global.confirm('删除这张已保存的图片？保存后生效。')) {
          removeOne(id0);
        }
        return;
      }
      var thumb = ev.target.closest('[data-ephoto]');
      if (!thumb) return;
      var id = thumb.getAttribute('data-ephoto');
      var isPending = !!findPending(id);
      var url = isPending ? findPending(id).url : existingUrls[id];
      if (!url) return;
      var actions = [{ label: '↻ 旋转 90°', fn: function () { rotateOne(id); } }];
      if (isPending) {
        actions.push({ label: '📷 重拍这张', fn: function () { retake(id); } });
      }
      actions.push({ label: '🗑 删除这张', fn: function () { removeOne(id); } });
      QT.imageView.open({ urls: [url], actions: actions });
    });

    // 图片库就绪前按钮保持禁用；不可用则整块降级（任务书 3.5）
    Promise.resolve(QT.imageStoreReady).then(function (s) {
      store = s;
      if (s) {
        btnCam.disabled = false;
        btnAlbum.disabled = false;
        renderStrip(); // 编辑态的旧图现在才能加载
      } else {
        el.querySelector('#photo-actions').hidden = true;
        if (hint) hint.textContent = '当前环境不支持保存图片，请用文字或来源录题。';
        renderStrip();
      }
    });
  }

  QT.entryPhoto = {
    html: html,
    attach: attach,
    addFiles: addFiles,
    commit: commit,
    saveFor: saveFor,
    reset: reset,
    dispose: dispose,
    getBlobForOcr: getBlobForOcr,
    MAX_PER_MISTAKE: pipeline ? pipeline.MAX_PER_MISTAKE : 3
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
