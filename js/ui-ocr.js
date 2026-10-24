/**
 * ui-ocr.js —— 录题页「识别成文字」按钮（C4 最小集成，2026-10-24 Go 后实现）
 *
 * 设计（任务书 C4 + docs/识别尝试记录.md 第五节安全声明）：
 *   - 密钥来自 window.QT_OCR_KEY：只有本地打包（make-dist.js --ocr-key-file）的单文件里有；
 *     仓库 / GitHub Pages / zip 版保持 null → 按钮整个隐藏，功能不存在
 *   - 同意门：第一次点击明确告知「照片会上传到智谱服务器」，同意后记住（localStorage）
 *   - 额度护栏：每设备每天 30 次成功识别（qt:ocr，跨天自动重置）
 *   - 降级：任何失败（无网/超时/额度/服务端错误）都只弹提示，照片已在库里，录题不受影响
 *   - 识别结果整体插入题干，由用户检查删改——识别可能有错，绝不静默覆盖已有内容
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});
  var util = QT.util;
  var ocr = QT.ocr;
  var KEY = global.QT_OCR_KEY || null;

  var BTN_LABEL = '🔍 识别文字';
  var busy = false;

  /* ---------------- 小工具 ---------------- */

  function enabled() { return !!(KEY && ocr && util); }

  function todayStr() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) { /* 写不进只影响本机护栏 */ } }

  function readQuota() {
    var raw = lsGet('qt:ocr');
    if (!raw) return {};
    try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result)); };
      fr.onerror = function () { reject({ friendly: '图片读取失败，请重拍。' }); };
      fr.readAsDataURL(blob);
    });
  }

  /* ---------------- 主流程 ---------------- */

  function setBtn(btn, disabled, label) {
    if (!btn) return;
    btn.disabled = disabled;
    btn.textContent = label;
  }

  /**
   * 把识别结果插入题干：已有内容时追加到末尾（绝不覆盖），
   * 并派发 input 让公式预览刷新。
   * @returns {boolean} 是否插入成功
   */
  function insertIntoStem(md) {
    var ta = document.getElementById('f-stem');
    if (!ta) return false;
    var cur = ta.value;
    ta.value = cur ? cur.replace(/\s*$/, '\n') + md : md;
    try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) { /* 老浏览器忽略 */ }
    return true;
  }

  function onOcr() {
    if (busy) return;
    var btn = document.getElementById('btn-ocr');

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
      setBtn(btn, false, BTN_LABEL);
      if (!r.parsed.ok) {
        util.toast('识别失败：' + ocr.friendlyError(r.parsed.code, r.parsed.message), 'error');
        return;
      }
      // ④ 成功才计数（失败不消耗用户额度）
      lsSet('qt:ocr', JSON.stringify(ocr.quotaRecord(readQuota(), todayStr())));
      if (!r.parsed.md) {
        util.toast('没识别出文字。试试拍得近一点、文字摆正。', 'error');
        return;
      }
      insertIntoStem(r.parsed.md);
      util.toast('已插入题干（' + (r.ms / 1000).toFixed(1) + ' 秒），识别可能有错，请检查删改。');
    }).catch(function (e) {
      busy = false;
      setBtn(btn, false, BTN_LABEL);
      var msg = (e && e.friendly) ? e.friendly
        : '识别失败：' + ((e && e.message) || '未知错误');
      util.toast(msg, 'error');
    });
  }

  /* ---------------- 绑定 ---------------- */

  /**
   * 由 ui-entry-photo.attach 调用。无密钥（仓库/线上/zip 版）时按钮保持隐藏。
   */
  function bind(el) {
    var btn = el.querySelector('#btn-ocr');
    if (!btn) return;
    if (!enabled()) { btn.hidden = true; return; }
    btn.hidden = false;
    btn.textContent = BTN_LABEL;
    btn.addEventListener('click', onOcr);
    var hint = el.querySelector('#photo-hint');
    if (hint) {
      hint.textContent = '拍完自动压缩（长边 1280）后只存在本机；点「识别文字」才会上传当前照片到智谱服务器识别（每日限 ' + ocr.DAILY_LIMIT + ' 次）。';
    }
  }

  QT.uiOcr = { bind: bind, enabled: enabled };
})(typeof globalThis !== 'undefined' ? globalThis : this);
