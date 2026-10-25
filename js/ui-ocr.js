/**
 * ui-ocr.js —— 录题页「识别成文字」（C4 最小集成 + 第四份任务书 A1/A2/C 收口）
 *
 * 密钥来源（按优先级）：
 *   1. window.QT_OCR_KEY —— 本地打包注入（make-dist.js --ocr-key-file），发单文件用；
 *   2. localStorage qt:ocrKey —— 用户在页面里用口令解锁得到（见下方 C 部分）；
 *   3. 两者都无但存在密文包（window.QT_OCR_VAULT，仓库/线上版）→ 按钮变「解锁识别」；
 *   4. 全都没有 → 按钮整体隐藏（A0 的全局 [hidden] 规则 + 内联双保险），功能等于不存在。
 *
 * A1：识别成功自动展开「详细填写」并把题干滚到可视区——极速模式下识别结果曾落在
 *     隐藏折叠区（docs/ocr-验证-问题1-*.png 实测），用户看不见。
 * A2：题干非空时页面内弹层三选一（追加 / 覆盖 / 取消），不用 confirm；题干为空直接填。
 * B3：本模块维护本页会话的识别计数（clicks/ok/msTotal/chars），entry-metrics 保存时取走。
 * C ：解锁入口要求 crypto.subtle（安全上下文）；没有则隐藏入口并说明，不崩溃。
 *
 * 降级原则不变：OCR 任何失败只弹提示，照片已存，录题不受影响；结果由用户检查删改。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});
  var util = QT.util;
  var ocr = QT.ocr;

  var BTN_READY = '识别文字';
  var BTN_UNLOCK = '解锁识别';

  var busy = false;
  var metrics = { clicks: 0, ok: 0, msTotal: 0, chars: 0 };

  /* ---------------- 小工具 ---------------- */

  function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) { /* 写不进只影响本机 */ } }

  function todayStr() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function readQuota() {
    var raw = lsGet('qt:ocr');
    if (!raw) return {};
    try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
  }

  /** 当前生效的识别密钥：注入优先，其次用户口令解锁后本机保存的。 */
  function currentKey() {
    return global.QT_OCR_KEY || lsGet('qt:ocrKey') || null;
  }

  /** 线上版是否有可解锁的密文包（且环境支持 WebCrypto）。 */
  function canUnlock() {
    return !!(global.QT_OCR_VAULT && QT.ocrUnlock && QT.ocrUnlock.subtleAvailable());
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result)); };
      fr.onerror = function () { reject({ friendly: '图片读取失败，请重拍。' }); };
      fr.readAsDataURL(blob);
    });
  }

  /* ---------------- 页面内弹层（不用 confirm，可输入可三选） ---------------- */

  function openOverlay(innerHtml) {
    var wrap = document.createElement('div');
    wrap.className = 'ocr-overlay';
    wrap.innerHTML = '<div class="ocr-dialog">' + innerHtml + '</div>';
    document.body.appendChild(wrap);
    return wrap;
  }

  function closeOverlay(wrap) { if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap); }

  /**
   * A2：题干非空时三选一。resolve('append' | 'overwrite' | 'cancel')。
   */
  function askPlacement() {
    return new Promise(function (resolve) {
      var wrap = openOverlay(
        '<div class="ocr-dialog__title">题干已有内容</div>' +
        '<div class="ocr-dialog__text">识别结果要怎么放？</div>' +
        '<div class="ocr-dialog__btns">' +
          '<button type="button" class="btn" data-ocr-ch="append">追加</button>' +
          '<button type="button" class="btn" data-ocr-ch="overwrite">覆盖</button>' +
          '<button type="button" class="btn" data-ocr-ch="cancel">取消</button>' +
        '</div>');
      wrap.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-ocr-ch]');
        if (!b) return;
        closeOverlay(wrap);
        resolve(b.getAttribute('data-ocr-ch'));
      });
    });
  }

  /** C：口令解锁弹层（密码框 + 解锁 / 取消）。resolve(口令 | null)。 */
  function askPassphrase() {
    return new Promise(function (resolve) {
      var wrap = openOverlay(
        '<div class="ocr-dialog__title">解锁识别</div>' +
        '<div class="ocr-dialog__text">输入发布者告知的口令（只存在本机，不上传）。</div>' +
        '<input type="password" class="ocr-input" id="ocr-pass" autocomplete="off">' +
        '<div class="ocr-dialog__btns">' +
          '<button type="button" class="btn" data-ocr-act="go">解锁</button>' +
          '<button type="button" class="btn" data-ocr-act="cancel">取消</button>' +
        '</div>');
      var input = wrap.querySelector('#ocr-pass');
      input.focus();
      function finish(val) { closeOverlay(wrap); resolve(val); }
      wrap.addEventListener('click', function (ev) {
        var b = ev.target.closest('[data-ocr-act]');
        if (!b) return;
        finish(b.getAttribute('data-ocr-act') === 'go' ? input.value : null);
      });
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') finish(input.value);
      });
    });
  }

  /* ---------------- A1：展开折叠区 + 把题干滚到可视区 ---------------- */

  function expandAndReveal() {
    var panel = document.getElementById('detail-panel');
    var toggle = document.getElementById('toggle-detail');
    if (panel && panel.hidden && toggle) toggle.click(); // 复用 ui-entry 的展开逻辑（含按钮文案）
    var stem = document.getElementById('f-stem');
    if (stem && document.getElementById('detail-panel') && !document.getElementById('detail-panel').hidden) {
      try { stem.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      catch (e) { try { stem.scrollIntoView(); } catch (e2) { /* 极老浏览器忽略 */ } }
    }
  }

  /**
   * A1 + A2：识别结果落进题干。
   * 题干为空 → 直接填；非空 → 三选一（追加/覆盖/取消）。
   * 然后（除取消外）自动展开折叠区并滚动定位，让用户立刻看得见、改得着。
   * @returns {Promise<boolean>} 是否真的写入了
   */
  function applyRecognition(md) {
    var stem = document.getElementById('f-stem');
    if (!stem) return Promise.resolve(false);
    var write = function (text) {
      stem.value = text;
      try { stem.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { /* 忽略 */ }
      expandAndReveal();
      return true;
    };
    var cur = stem.value;
    if (!cur.trim()) return Promise.resolve(write(md));
    return askPlacement().then(function (choice) {
      if (choice === 'append') return write(cur.replace(/\s*$/, '\n') + md);
      if (choice === 'overwrite') return write(md);
      return false; // 取消：不动题干
    });
  }

  /* ---------------- 主流程 ---------------- */

  function setBtn(btn, disabled, label) {
    if (!btn) return;
    btn.disabled = disabled;
    btn.textContent = label;
  }

  function onOcr() {
    if (busy) return;
    var btn = document.getElementById('btn-ocr');
    var KEY = currentKey();
    if (!KEY) return;
    metrics.clicks += 1; // B3：所有真实点击都算（含被额度拦下的），反映需求强度

    // ① 额度护栏：先于一切网络行为
    var chk = ocr.quotaCheck(readQuota(), todayStr());
    if (!chk.allowed) {
      util.toast('今日 ' + ocr.DAILY_LIMIT + ' 次识别额度已用完，明天再来。', 'error');
      return;
    }

    // ② 同意门：上传涉及外部服务器，第一次明确问一次
    if (lsGet('qt:ocrConsent') !== '1') {
      var yes = global.confirm(
        '「识别成文字」需要联网：当前照片会发送到智谱开放平台的服务器完成识别，' +
        '智谱如何处理该图片以其隐私政策为准；应用本身不会在本地之外另存副本。\n\n' +
        '每天最多 ' + ocr.DAILY_LIMIT + ' 次；识别结果插入题干，由你检查修改（识别可能有错）。\n\n' +
        '继续并记住选择？'
      );
      if (!yes) return;
      lsSet('qt:ocrConsent', '1');
    }

    // ③ 拿最近一张照片 → data URL → 请求
    busy = true;
    setBtn(btn, true, '… 识别中');
    var t0 = Date.now();

    Promise.resolve(QT.entryPhoto.getBlobForOcr()).then(function (blob) {
      if (!blob) throw { friendly: '先拍一张照片，再点识别。' };
      return blobToDataUrl(blob);
    }).then(function (dataUrl) {
      var ctrl = (typeof global.AbortController === 'function') ? new global.AbortController() : null;
      var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) { /* 已结束 */ } }, 30000) : null;
      var body = ocr.buildRequestBody(dataUrl); // data URL 校验在这里，非法直接走 reject
      return fetch(ocr.ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': KEY }, // 裸 key，探针实测可用
        body: body,
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        return res.text().then(function (text) {
          if (timer) clearTimeout(timer);
          return { parsed: ocr.parseResponseText(text, res.status), ms: Date.now() - t0 };
        });
      }, function (err) {
        if (timer) clearTimeout(timer);
        throw {
          friendly: (err && err.name === 'AbortError')
            ? '识别超时（30 秒），请重试。'
            : '网络请求失败：' + ((err && err.message) || '未知')
        };
      });
    }).then(function (r) {
      busy = false;
      setBtn(btn, false, BTN_READY);
      if (!r.parsed.ok) {
        util.toast('识别失败：' + ocr.friendlyError(r.parsed.code, r.parsed.message), 'error');
        return;
      }
      // ④ 成功才计数（失败不消耗用户额度）；字数只记个数，绝无文本
      lsSet('qt:ocr', JSON.stringify(ocr.quotaRecord(readQuota(), todayStr())));
      metrics.ok += 1;
      metrics.msTotal += r.ms;
      metrics.chars += String(r.parsed.md || '').length;
      if (!r.parsed.md) {
        util.toast('没识别出文字。试试拍得近一点、文字摆正。', 'error');
        return;
      }
      applyRecognition(r.parsed.md).then(function (written) {
        util.toast(written
          ? '已插入题干（' + (r.ms / 1000).toFixed(1) + ' 秒），识别可能有错，请对照照片检查删改。'
          : '已取消，未改动题干。');
      });
    }).catch(function (e) {
      busy = false;
      setBtn(btn, false, BTN_READY);
      var msg = (e && e.friendly) ? e.friendly : '识别失败：' + ((e && e.message) || '未知错误');
      util.toast(msg, 'error');
    });
  }

  /** C：口令解锁 → 解出的密钥只存本机（qt:ocrKey），按钮切换为识别模式。 */
  function onUnlock() {
    if (busy) return;
    var vault = global.QT_OCR_VAULT;
    if (!vault || !QT.ocrUnlock) return;
    askPassphrase().then(function (pass) {
      if (pass == null || pass === '') return; // 取消
      QT.ocrUnlock.decryptVault(vault, pass).then(function (key) {
        if (!key) throw new Error('empty');
        lsSet('qt:ocrKey', key);
        refreshButton();
        util.toast('解锁成功，可以识别了（本机有效）。');
      }).catch(function () {
        util.toast('解锁失败：口令不对，或密文/环境异常。', 'error');
      });
    });
  }

  /* ---------------- 绑定 ---------------- */

  /** 按当前密钥状态决定按钮形态（bind 与解锁成功后都会走这里）。 */
  function refreshButton() {
    var btn = document.getElementById('btn-ocr');
    if (!btn) return;
    if (currentKey()) {
      btn.style.display = '';
      btn.hidden = false;
      btn.disabled = false;
      btn.textContent = BTN_READY;
      btn.onclick = onOcr;
      var hint = document.getElementById('photo-hint');
      if (hint) {
        hint.textContent = '拍完自动压缩（长边 1280）后只存在本机；点「识别文字」才会上传当前照片到智谱服务器识别（每日限 ' + ocr.DAILY_LIMIT + ' 次）。';
      }
      return;
    }
    if (canUnlock()) {
      btn.style.display = '';
      btn.hidden = false;
      btn.disabled = false;
      btn.textContent = BTN_UNLOCK;
      btn.onclick = onUnlock;
      var hint2 = document.getElementById('photo-hint');
      if (hint2) {
        hint2.textContent = '识别功能已内置（口令加密）。点「解锁识别」输入发布者告知的口令，口令只存本机。';
      }
      return;
    }
    // 无密钥且无可解锁密文包：按钮彻底不可见（A0 全局规则 + 内联双保险）
    btn.hidden = true;
    btn.style.display = 'none';
  }

  /** 由 ui-entry-photo.attach 调用。 */
  function bind(el) {
    var btn = el.querySelector('#btn-ocr');
    if (!btn) return;
    refreshButton();
  }

  /* ---------------- B3：给 entry-metrics 取的会话计数 ---------------- */

  function metricsSnapshot() {
    return {
      used: metrics.ok > 0,
      clicks: metrics.clicks,
      okCount: metrics.ok,
      msTotal: metrics.msTotal,
      chars: metrics.chars
    };
  }
  function resetMetrics() {
    metrics = { clicks: 0, ok: 0, msTotal: 0, chars: 0 };
  }

  QT.uiOcr = {
    bind: bind,
    refreshButton: refreshButton,
    applyRecognition: applyRecognition, // 暴露给无头冒烟：不联网也能验证 A1/A2
    metrics: metricsSnapshot,
    resetMetrics: resetMetrics
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
