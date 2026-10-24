/**
 * ocr.js —— 拍照识别（OCR）纯逻辑层（C4 最小集成，2026-10-24 Go 后实现）
 *
 * 接口事实全部来自 2026-10-24 的探针实测（docs/识别尝试记录.md）：
 *   - 端点：POST https://open.bigmodel.cn/api/paas/v4/layout_parsing
 *   - model 固定 glm-ocr；file 字段【必须】是 data URL（带 data:image/…;base64, 前缀），
 *     纯 base64 一律 HTTP 400——这个教训直接编码进 buildRequestBody
 *   - 成功响应：md_results（$…$ / $$…$$ LaTeX）+ layout_details + usage
 *   - 鉴权头：Authorization: <裸 key>（无 Bearer 前缀，探针实测可用）
 *   - CORS：浏览器直连放行（curl 预检 + 正式响应均带 Access-Control-Allow-Origin）
 *
 * 额度护栏：每设备每天最多 DAILY_LIMIT 次「成功」识别（localStorage 由 ui-ocr 读写）。
 * 降级原则：OCR 任何环节失败都不影响录题本身——照片已存，文字可以手打。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});

  var ENDPOINT = 'https://open.bigmodel.cn/api/paas/v4/layout_parsing';
  var MODEL = 'glm-ocr';
  var DAILY_LIMIT = 30;

  /* ---------------- 请求 ---------------- */

  /**
   * 构造请求体。实测（2026-10-24）：纯 base64 被 HTTP 400 拒绝，
   * 只有 data URL 写法可用——所以这里直接拒绝非 data URL 输入，不留给调用方犯错的机会。
   * @param {string} dataUrl 以 data:image/ 开头的完整 data URL
   * @returns {string} JSON 字符串
   * @throws {Error} 输入不是 data URL
   */
  function buildRequestBody(dataUrl) {
    var s = String(dataUrl == null ? '' : dataUrl);
    if (!/^data:image\//.test(s)) {
      throw new Error('OCR 请求必须用 data URL 形式（data:image/…;base64,…），纯 base64 会被服务端 400 拒绝（2026-10-24 实测）');
    }
    return JSON.stringify({ model: MODEL, file: s });
  }

  /* ---------------- 响应 ---------------- */

  /**
   * 解析响应文本。
   * @param {string} text 响应原文
   * @param {number} [status] HTTP 状态码（知道就传，非 2xx 直接判失败）
   * @returns {{ok:true, md:string, blocks:Array, usage:Object|null}|
   *           {ok:false, code:string, message:string}}
   */
  function parseResponseText(text, status) {
    var json = null;
    var parseFailed = false;
    try {
      json = JSON.parse(String(text == null ? '' : text));
    } catch (e) {
      parseFailed = true;
    }
    // 服务端的错误 body 是标准 {"error":{code,message}}（401 实测过）——
    // 即使 HTTP 状态非 2xx 也优先透出它，比笼统的「HTTP 401」更有用
    if (json && json.error) {
      return {
        ok: false,
        code: String(json.error.code || 'UNKNOWN'),
        message: String(json.error.message || '服务端返回错误')
      };
    }
    if (parseFailed) {
      return { ok: false, code: 'BAD_JSON', message: '响应不是 JSON（可能是网络劫持页或网关错误）' };
    }
    if (typeof status === 'number' && (status < 200 || status >= 300)) {
      return { ok: false, code: 'HTTP_' + status, message: '服务器返回 HTTP ' + status };
    }
    // 兼容两种包法：顶层 或 data 包一层
    var inner = (json && json.data) ? json.data : json;
    var md = (inner && typeof inner.md_results === 'string') ? inner.md_results : '';
    var blocks = (inner && inner.layout_details && typeof inner.layout_details.length === 'number')
      ? inner.layout_details : [];
    var usage = (json && json.usage) ? json.usage : ((inner && inner.usage) ? inner.usage : null);
    return { ok: true, md: md, blocks: blocks, usage: usage };
  }

  /* ---------------- 额度护栏（纯函数，状态由调用方持久化） ---------------- */

  /**
   * 检查今天还允不允许识别。
   * @param {{date?:string, used?:number}} state 持久化的计数状态（可能为空对象）
   * @param {string} dateStr 本地日期 YYYY-MM-DD
   * @param {number} [limit] 每日上限，默认 DAILY_LIMIT
   * @returns {{allowed:boolean, used:number, remaining:number}}
   */
  function quotaCheck(state, dateStr, limit) {
    var cap = (typeof limit === 'number' && limit > 0) ? limit : DAILY_LIMIT;
    var used = (state && state.date === dateStr && typeof state.used === 'number' && state.used >= 0)
      ? state.used : 0;
    return { allowed: used < cap, used: used, remaining: Math.max(0, cap - used) };
  }

  /**
   * 记一次成功识别，返回【新】状态对象（不改入参——测试锁定不可变性）。
   * 跨天自动归 1。
   */
  function quotaRecord(state, dateStr) {
    var used = (state && state.date === dateStr && typeof state.used === 'number' && state.used >= 0)
      ? state.used : 0;
    return { date: String(dateStr), used: used + 1 };
  }

  /* ---------------- 错误文案 ---------------- */

  /**
   * 把错误变成人话。code 1000（身份验证失败）是 2026-10-24 用假 key 实测确认的；
   * 其余 code 不瞎猜含义，把服务端原文透出（服务端 message 本身是中文且可读）。
   */
  function friendlyError(code, message) {
    if (code === '1000') return '密钥无效或格式不对（code 1000）';
    var c = code ? 'code ' + code : '';
    var m = message ? String(message) : '';
    if (c && m) return c + ' ' + m;
    if (m) return m;
    return c || '未知错误';
  }

  QT.ocr = {
    ENDPOINT: ENDPOINT,
    MODEL: MODEL,
    DAILY_LIMIT: DAILY_LIMIT,
    buildRequestBody: buildRequestBody,
    parseResponseText: parseResponseText,
    quotaCheck: quotaCheck,
    quotaRecord: quotaRecord,
    friendlyError: friendlyError
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
