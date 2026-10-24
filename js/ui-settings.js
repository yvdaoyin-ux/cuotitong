/**
 * ui-settings.js —— 设置：导出/导入备份、导出使用数据、关于
 *
 * D1-2 阶段先把备份导出/导入和清空做出来（用户必须能自救），
 * 使用数据导出与问卷位在 D6 补。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});
  var util = QT.util;

  function render() {
    var db = QT.storage.load();
    var sampleCount = (QT.sampleData && QT.sampleData.countSample(db)) || 0;
    return '' +
      '<h1 class="page-title">设置</h1>' +

      '<div class="card">' +
        '<div class="label">数据概况</div>' +
        '<p class="muted" style="margin:0">' +
          '错题 ' + db.mistakes.length + ' 道 · 作答记录 ' + db.answers.length + ' 条 · ' +
          '自建知识点 ' + db.kps.length + ' 个 · 数据版本 v' + db.schemaVersion +
          '<br>创建于 ' + util.esc(util.fmtDate(db.createdAt)) + '</p>' +
      '</div>' +

      '<div class="card">' +
        '<div class="label">图片存储</div>' +
        '<p class="muted" style="margin:0" id="img-usage">统计中…</p>' +
        '<p class="muted" id="img-warn" hidden style="color:var(--danger);margin:6px 0 0">' +
          '⚠️ 浏览器数据占用已超过 100MB，建议删掉不需要的错题（会连带删图）。</p>' +
      '</div>' +

      '<div class="card">' +
        '<div class="label">备份</div>' +
        '<p class="muted" style="margin:0 0 10px">数据只存在本机浏览器里。' +
          '清理浏览器数据、换手机都会丢，建议每周导出一次。</p>' +
        '<div style="display:grid;gap:8px">' +
          '<button class="btn btn--primary btn--block" id="btn-export">⬇️ 导出备份（JSON）</button>' +
          '<label class="print-opt" style="display:flex;gap:8px;align-items:center">' +
            '<input type="checkbox" id="exp-imgs">' +
            '<span style="font-size:14px">连同图片一起备份（体积大、生成慢，默认不含图片）</span>' +
          '</label>' +
          '<button class="btn btn--block" id="btn-import">⬆️ 从备份恢复</button>' +
          '<input type="file" id="file-import" accept=".json,application/json" hidden>' +
        '</div>' +
        '<div class="hint">恢复会**整体替换**当前数据，不是合并。含图片的备份会自动识别。</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="label">导出使用数据（帮我们改进）</div>' +
        '<p class="muted" style="margin:0 0 8px">如果你愿意，可以导出一份**匿名**使用数据发给开发者。' +
          '它只包含计数与时间，用于写统计报告。</p>' +
        '<div style="background:var(--brand-weak);border-radius:10px;padding:10px 12px;margin-bottom:10px">' +
          '<div style="font-size:14px;line-height:1.7">' +
            '<strong>这份文件里没有：</strong><br>' +
            '· 你的题干、我的答案、正确答案与解析<br>' +
            '· 你在作答框里手写的任何解法<br>' +
            '· 你自己新增的知识点名称<br>' +
            '<strong>它只有：</strong>科目、错因、题数、对错数、时间（精确到分钟）' +
          '</div>' +
        '</div>' +
        '<div style="display:grid;gap:8px">' +
          '<button class="btn btn--block" id="btn-usage-json">📄 导出使用数据（JSON）</button>' +
          '<button class="btn btn--block" id="btn-usage-csv">📊 导出事件表（CSV，可用 Excel 打开）</button>' +
        '</div>' +
        '<div class="hint">导出前你可以在手机/电脑上直接打开文件核对一遍，确认无误再发送。' +
          '不发也完全不影响使用。</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="label">危险操作</div>' +
        '<button class="btn btn--danger btn--block" id="btn-reset">清空全部数据</button>' +
        '<div class="hint">清空后无法恢复，除非你导出过备份。</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="label">演示数据</div>' +
        '<p class="muted" style="margin:0 0 10px">想先看看工具能做什么？可以载入一套示例错题' +
          '（12 道，覆盖四科）。每道都带「示例」角标，' +
          '<strong>会参与诊断与组卷（这样才能演示效果），但绝不会被导出</strong>。' +
          '试完点「清除」即可，你自己的题不受影响。</p>' +
        '<div style="display:grid;gap:8px">' +
          '<button class="btn btn--block" id="btn-sample-load">📥 载入示例数据</button>' +
          '<button class="btn btn--block" id="btn-sample-clear"' +
            (sampleCount ? '' : ' disabled') + '>🧹 清除示例数据' +
            (sampleCount ? '（' + sampleCount + ' 道）' : '（当前没有）') + '</button>' +
        '</div>' +
        '<div class="hint">「清除」只删带示例标记的题，你自己录的一道都不会动。</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="label">反馈</div>' +
        (QT.config && QT.config.FEEDBACK_URL
          ? '<p class="muted" style="margin:0 0 10px">用了一周后，欢迎告诉我哪里难用。</p>' +
            '<a class="btn btn--primary btn--block" href="' + util.esc(QT.config.FEEDBACK_URL) +
              '" target="_blank" rel="noopener">📝 填写反馈问卷</a>'
          : '<p class="muted" style="margin:0">反馈问卷链接待补充。' +
            '有意见可以直接告诉发链接给你的同学。</p>') +
      '</div>' +

      '<div class="card">' +
        '<div class="label">关于</div>' +
        '<p class="muted" style="margin:0">错题通 v' +
          util.esc((QT.exportUsage && QT.exportUsage.APP_VERSION) || '0.2.0') +
          ' · 纯前端，无账号，无服务器。' +
          '<br>掌握度用 Beta 后验均值，复习优先级 = (1−R)×(1−掌握度)。</p>' +
      '</div>' +

      '<div style="text-align:center;margin-top:8px">' +
        '<button class="btn btn--sm" data-go="home">← 返回主页</button>' +
      '</div>';
  }

  /** 触发浏览器下载。用 Blob + a[download]，兼容移动端与桌面。 */
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function stamp() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
      p(d.getHours()) + p(d.getMinutes());
  }

  /* ---------------- 含图片备份（阶段 3，任务书 3.4） ---------------- */

  var IMAGE_BACKUP_WARN = 20 * 1024 * 1024; // 超过 20MB 先问一声（任务书规定）

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result)); };
      fr.onerror = function () { reject(new Error('读取图片失败')); };
      fr.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    var comma = dataUrl.indexOf(',');
    var mime = /data:([^;]+)/.exec(dataUrl.slice(0, comma));
    var bin = atob(dataUrl.slice(comma + 1));
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime ? mime[1] : 'image/jpeg' });
  }

  /**
   * 构建备份 JSON。默认只含 qt:db；勾选「含图片」时把图片库逐张转 base64 附上。
   * @returns {Promise<string>}
   */
  async function buildBackup(withImages) {
    var obj = JSON.parse(QT.storage.exportJson());
    if (!withImages) return JSON.stringify(obj);
    var store = await Promise.resolve(QT.imageStoreReady);
    if (!store) throw new Error('当前环境不支持图片存储，无法生成含图片备份');
    var recs = await store.getAll();
    var images = [];
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (!r || !r.blob) continue;
      images.push({
        id: r.id, qid: r.qid, w: r.w, h: r.h, size: r.size,
        createdAt: r.createdAt, data: await blobToDataUrl(r.blob)
      });
    }
    obj.images = images;
    return JSON.stringify(obj);
  }

  /** 导入含图片备份：先清空图片库，再逐张 base64 还原。返回成功张数。 */
  async function restoreImages(store, imgs) {
    await store.clear();
    var n = 0;
    for (var i = 0; i < imgs.length; i++) {
      var r = imgs[i];
      if (!r || typeof r.id !== 'string' || !r.id) continue;
      if (typeof r.data !== 'string' || r.data.slice(0, 5) !== 'data:') continue;
      try {
        var blob = dataUrlToBlob(r.data);
        await store.put({
          id: r.id, qid: r.qid || null, blob: blob,
          w: r.w || 0, h: r.h || 0, size: r.size || blob.size,
          createdAt: r.createdAt || util.nowIso()
        });
        n += 1;
      } catch (e) { /* 单张坏图跳过，不拖垮整份恢复 */ }
    }
    return n;
  }

  function fmtMB(bytes) {
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function after(el) {
    // —— 图片占用统计（任务书 3.2：navigator.storage.estimate，>100MB 提示）——
    Promise.resolve(QT.imageStoreReady).then(function (store) {
      var usageEl = el.querySelector('#img-usage');
      var warnEl = el.querySelector('#img-warn');
      if (!usageEl) return;
      if (!store) { usageEl.textContent = '当前环境不支持图片存储（拍照已停用）。'; return; }
      store.count().then(function (n) {
        var est = (navigator.storage && navigator.storage.estimate)
          ? navigator.storage.estimate() : null;
        return Promise.resolve(est).then(function (e) {
          usageEl.textContent = '已存图片 ' + n + ' 张 · 浏览器数据总占用约 ' +
            (e && e.usage != null ? fmtMB(e.usage) : '未知');
          if (warnEl) warnEl.hidden = !(e && e.usage > 100 * 1024 * 1024);
        });
      }).catch(function () {
        usageEl.textContent = '图片占用统计失败（不影响使用）。';
      });
    });

    // —— 导出备份（默认不含图片；勾选后含图片，>20MB 先确认）——
    el.querySelector('#btn-export').addEventListener('click', async function () {
      try {
        var withImages = el.querySelector('#exp-imgs').checked;
        var json = await buildBackup(withImages);
        if (withImages && json.length > IMAGE_BACKUP_WARN) {
          if (!global.confirm('含图片备份约 ' + fmtMB(json.length) +
            '，生成与恢复都会比较慢。确定继续？')) return;
        }
        download('错题通备份-' + stamp() + '.json', json);
        QT.storage.logEvent('backup_export');
        util.toast(withImages ? '已导出含图片备份' : '已导出备份文件');
      } catch (e) {
        util.toast('导出失败：' + (e.message || e), 'error');
      }
    });

    var file = el.querySelector('#file-import');
    el.querySelector('#btn-import').addEventListener('click', function () {
      file.click();
    });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = async function () {
        try {
          if (!global.confirm('导入会替换当前全部数据，确定继续？')) return;
          var text = String(reader.result || '');
          // 预解析：含图片备份在 qt:db 之外还带一个 images 数组，
          // 必须先摘出来单独还原，不能让它混进业务数据
          var obj = null;
          try { obj = JSON.parse(text); } catch (e) { /* 交给 importJson 报错 */ }
          var imgs = (obj && Array.isArray(obj.images)) ? obj.images : null;
          if (obj && imgs) delete obj.images;
          QT.storage.importJson(obj ? JSON.stringify(obj) : text);
          var n = 0;
          var store = await Promise.resolve(QT.imageStoreReady);
          if (imgs && store) {
            n = await restoreImages(store, imgs);
          }
          QT.storage.logEvent('backup_import');
          if (imgs && !store) {
            util.toast('已恢复数据，但当前环境不支持图片，备份里的图片未恢复', 'error');
          } else {
            util.toast(imgs ? '已恢复备份（含图片 ' + n + ' 张）' : '已恢复备份');
          }
          QT.app.go('home');
        } catch (e) {
          util.toast('恢复失败：' + (e.message || e), 'error');
        }
      };
      reader.onerror = function () { util.toast('读取文件失败', 'error'); };
      reader.readAsText(f);
      file.value = '';
    });

    // —— 匿名使用数据导出 ——
    var usageJson = el.querySelector('#btn-usage-json');
    if (usageJson) {
      usageJson.addEventListener('click', function () {
        try {
          var out = QT.exportUsage.buildAnonymous(QT.storage.load(), util.nowIso());
          download('错题通-匿名使用数据-' + stamp() + '.json',
            JSON.stringify(out, null, 2));
          QT.storage.logEvent('backup_export');
          util.toast('已导出。建议先自己打开核对一遍再发送。');
        } catch (e) {
          util.toast('导出失败：' + (e.message || e), 'error');
        }
      });
    }

    var usageCsv = el.querySelector('#btn-usage-csv');
    if (usageCsv) {
      usageCsv.addEventListener('click', function () {
        try {
          var csv = QT.exportUsage.buildEventsCsv(QT.storage.load());
          // 加 UTF-8 BOM，Excel 打开中文不乱码
          download('错题通-事件表-' + stamp() + '.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
          QT.storage.logEvent('backup_export');
          util.toast('已导出事件表');
        } catch (e) {
          util.toast('导出失败：' + (e.message || e), 'error');
        }
      });
    }

    // —— 演示数据 ——
    var sampleLoad = el.querySelector('#btn-sample-load');
    if (sampleLoad) {
      sampleLoad.addEventListener('click', function () {
        if (QT.sampleData.countSample() > 0) {
          if (!global.confirm('已经载入过示例数据，重新载入会先清掉旧的示例题。继续？')) return;
        }
        var r = QT.sampleData.load();
        if (r.added === 0) {
          util.toast('载入失败：没有匹配到知识点', 'error');
          return;
        }
        util.toast('已载入 ' + r.added + ' 道示例题' +
          (r.skipped ? '（跳过 ' + r.skipped + ' 道）' : ''));
        QT.app.go('list');
      });
    }

    var sampleClear = el.querySelector('#btn-sample-clear');
    if (sampleClear) {
      sampleClear.addEventListener('click', function () {
        var n = QT.sampleData.countSample();
        if (!n) { util.toast('当前没有示例数据'); return; }
        if (!global.confirm('会删除这 ' + n + ' 道示例题（含它们的作答记录），你自己录的题不受影响。继续？')) return;
        var removed = QT.sampleData.clear();
        util.toast('已清除 ' + removed + ' 道示例题');
        QT.app.go('settings');
      });
    }

    el.querySelector('#btn-reset').addEventListener('click', function () {
      if (!global.confirm('这会删除全部错题与作答记录，且无法撤销。确定清空？')) return;
      if (!global.confirm('再次确认：真的要清空吗？建议先导出备份。')) return;
      QT.storage.resetAll();
      // 图片库一并清空（错题都没了，图留着只会变孤儿）
      Promise.resolve(QT.imageStoreReady).then(function (s) {
        if (s) return s.clear();
      }).catch(function () { /* 交给下次启动的孤儿清理兜底 */ });
      util.toast('已清空');
      QT.app.go('home');
    });
  }

  QT.pages.settings = { title: '设置', render: render, after: after };
})(typeof globalThis !== 'undefined' ? globalThis : this);
