/**
 * export-usage.js —— 导出「匿名使用数据」，供作者做报告里的「应用情况」统计
 *
 * ============================================================
 * 🔴 本文件的第一原则：绝不泄露用户内容
 * ============================================================
 * 用户可能把手机号、姓名、私事写进题干或「我的作答」里。
 * 因此导出采用**白名单**，而不是「排除某些字段」的黑名单：
 *   黑名单漏一个字段就泄一次密；白名单漏了最多是少导一列。
 *
 * 明确**永不导出**的内容：
 *   - mistakes[].stem / myAnswer / correctAnswer      （题目与作答内容）
 *   - answers[].note                                  （用户手写的解法）
 *   - 自建知识点的 name                                （用户自己起的名字）
 *   - 任何 id 之外的自由文本
 *
 * 允许导出的内容：
 *   - 事件类型、时间戳（精确到分钟）
 *   - 数值型 payload（题数、对错数、耗时类）
 *   - 科目 id（枚举）、错因 id（枚举）、知识点 id（不含名称，且预置 id 是公开教材章节编号）
 *   - 聚合后的计数
 *
 * 本模块是**纯函数**，不碰 DOM 与 localStorage，可在 Node 里测试（见 tests/export.test.js）。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});

  var APP_VERSION = '0.2.0';

  /**
   * payload 字段白名单。只有列在这里的键才会被导出，且值必须是 number / boolean / 短字符串枚举。
   * 新增埋点时若忘了加进来，导出会直接丢掉它 —— 这是刻意的「默认不导出」。
   */
  var PAYLOAD_ALLOW = {
    subject: 'enum',   // 科目 id
    kpCount: 'number', // 知识点个数
    size: 'number',    // 请求题数
    got: 'number',     // 实际抽到题数
    total: 'number',   // 本次共答题数
    correct: 'number',
    skipped: 'number',
    count: 'number',
    // —— 阶段 4.1 录入埋点（只有长度与计数，绝无文本）——
    ms: 'number',          // 录入耗时毫秒（首次焦点 → 保存）
    mode: 'enum',          // quick | full | continue
    toolbarTaps: 'number', // 工具栏点击次数
    usedPhoto: 'boolean',  // 是否用了拍照
    photoCount: 'number',  // 照片张数
    pasted: 'boolean',     // 是否有粘贴动作
    stemLen: 'number',     // 题干字数（非内容本身）
    hasSource: 'boolean',  // 是否填了来源
    // —— 第四份任务书 B3：识别埋点（只有计数与耗时，绝无识别文字）——
    ocrUsed: 'boolean',    // 本次录题是否用过识别
    ocrClicks: 'number',   // 识别按钮点击次数（含被额度拦下的）
    ocrOkCount: 'number',  // 识别成功次数
    ocrMsTotal: 'number',  // 识别耗时合计毫秒
    ocrChars: 'number'     // 识别结果字数（非内容本身）
  };

  /** 事件类型白名单。未知类型直接丢弃，避免未来误加的高危埋点被带出去。 */
  var EVENT_ALLOW = {
    app_open: true,
    mistake_add: true,
    mistake_update: true,
    mistake_delete: true,
    quiz_draw: true,
    quiz_finish: true,
    review_start: true,
    review_finish: true,
    backup_export: true,
    backup_import: true,
    print_sheet: true,
    sample_load: true,
    sample_clear: true,
    entry_open: true,
    entry_save: true
  };

  /** 只保留白名单字段，且做类型收敛。 */
  function cleanPayload(payload) {
    var out = {};
    if (!payload || typeof payload !== 'object') return out;
    Object.keys(payload).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(PAYLOAD_ALLOW, k)) return;
      var kind = PAYLOAD_ALLOW[k];
      var v = payload[k];
      if (kind === 'number') {
        if (typeof v === 'number' && isFinite(v)) out[k] = v;
      } else if (kind === 'enum') {
        // 枚举值必须是短字符串，且只含字母数字下划线连字符（科目 id 就是这个形态）
        if (typeof v === 'string' && /^[a-zA-Z0-9_-]{1,24}$/.test(v)) out[k] = v;
      } else if (kind === 'boolean') {
        if (typeof v === 'boolean') out[k] = v;
      }
    });
    return out;
  }

  /** 时间戳截断到分钟，降低「精确到秒」的可识别性。 */
  function trimTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /** 计数工具。 */
  function bump(obj, key) {
    if (key == null) return;
    obj[key] = (obj[key] || 0) + 1;
  }

  /**
   * 生成匿名使用数据（对象形态）。
   * @param {object} db QT.storage 的整库对象
   * @param {string} nowIso
   */
  function buildAnonymous(db, nowIso) {
    db = db || {};
    var mistakes = Array.isArray(db.mistakes) ? db.mistakes : [];
    var answers = Array.isArray(db.answers) ? db.answers : [];
    var events = Array.isArray(db.events) ? db.events : [];

    // 🔴 排除演示数据：示例题是我为了让用户看懂界面而内置的，
    // 若计入，报告里的「应用情况」就成了我编的数字，属于造假。
    // 判据：错题带 isSample 标记 → 连同它的作答一起排除。
    var sampleIds = {};
    mistakes.forEach(function (m) { if (m.isSample) sampleIds[m.id] = true; });
    var realMistakes = mistakes.filter(function (m) { return !m.isSample; });
    var realAnswers = answers.filter(function (a) { return !sampleIds[a.mistakeId] && !a.isSample; });

    mistakes = realMistakes;
    answers = realAnswers;

    // —— 聚合统计 ——
    var bySubject = {};
    mistakes.forEach(function (m) {
      // 只记科目 id 与知识点个数，不记任何文本
      bump(bySubject, m.subject);
    });

    var byReason = {};
    mistakes.forEach(function (m) { bump(byReason, m.reason || '(none)'); });

    var byAnswerKind = {};
    answers.forEach(function (a) { bump(byAnswerKind, a.kind || '(none)'); });

    // 每道错题被作答次数分布（衡量用户是否真的在复习）
    var perMistake = {};
    answers.forEach(function (a) {
      if (a.kind === 'intake') return; // 录入那次不算复习
      perMistake[a.mistakeId] = (perMistake[a.mistakeId] || 0) + 1;
    });
    var reviewDepth = { '0': 0, '1': 0, '2-4': 0, '5+': 0 };
    mistakes.forEach(function (m) {
      var n = perMistake[m.id] || 0;
      if (n === 0) reviewDepth['0'] += 1;
      else if (n === 1) reviewDepth['1'] += 1;
      else if (n <= 4) reviewDepth['2-4'] += 1;
      else reviewDepth['5+'] += 1;
    });

    var byEventType = {};
    events.forEach(function (e) { bump(byEventType, e.type); });

    // 活跃天数（按事件日期去重）
    var daySet = {};
    events.forEach(function (e) {
      var t = trimTime(e.at);
      if (t) daySet[t.slice(0, 10)] = true;
    });
    var activeDays = Object.keys(daySet).length;

    // —— 事件明细（白名单过滤）——
    var cleanEvents = [];
    events.forEach(function (e) {
      if (!e || !EVENT_ALLOW[e.type]) return;
      cleanEvents.push({
        type: e.type,
        at: trimTime(e.at),
        payload: cleanPayload(e.payload)
      });
    });

    // —— 作答明细（只留对错与类型，无 note）——
    var cleanAnswers = answers.map(function (a) {
      return {
        correct: !!a.correct,
        kind: a.kind || 'quiz',
        kpCount: Array.isArray(a.kpIds) ? a.kpIds.length : 0,
        at: trimTime(a.at)
      };
    });

    // 作答正确率
    var nQuiz = 0, nCorrect = 0;
    answers.forEach(function (a) {
      if (a.kind === 'intake') return;
      nQuiz += 1;
      if (a.correct) nCorrect += 1;
    });

    return {
      meta: {
        app: '错题通',
        appVersion: APP_VERSION,
        schemaVersion: db.schemaVersion || 0,
        exportedAt: trimTime(nowIso || new Date().toISOString()),
        // 明确写上「这份文件里没有什么」，用户自己也能看懂
        privacy: '不含题干、答案、解析、用户手写解法与自建知识点名称',
        notice: '生成于用户本机；是否发送由用户自己决定'
      },
      summary: {
        mistakeCount: mistakes.length,
        answerCount: answers.length,
        customKpCount: Array.isArray(db.kps) ? db.kps.length : 0,
        activeDays: activeDays,
        quizAnswers: nQuiz,
        quizCorrect: nCorrect,
        // 保留三位小数，避免无意义精度
        quizAccuracy: nQuiz ? Math.round(nCorrect / nQuiz * 1000) / 1000 : null
      },
      bySubject: bySubject,
      byReason: byReason,
      byAnswerKind: byAnswerKind,
      reviewDepth: reviewDepth,
      byEventType: byEventType,
      events: cleanEvents,
      answers: cleanAnswers
    };
  }

  /** CSV 转义：含逗号/引号/换行时加引号，内部引号翻倍。 */
  function csvCell(v) {
    if (v == null) return '';
    var s = String(v);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /**
   * 生成事件级 CSV（供 Excel / 统计软件直接读）。
   * 阶段 4.1 起新增录入埋点列（只有耗时/计数/布尔，无任何文本），
   * 旧事件这些列留空 —— 列固定，Excel 透视不受影响。
   */
  function buildEventsCsv(db) {
    var events = (db && Array.isArray(db.events)) ? db.events : [];
    var lines = ['时间,事件类型,科目,题数,答对,答错,耗时ms,模式,工具栏点击,拍照,粘贴,题干字数,有来源,识别用过,识别点击,识别成功,识别耗时ms,识别字数'];
    events.forEach(function (e) {
      if (!e || !EVENT_ALLOW[e.type]) return;
      var p = cleanPayload(e.payload);
      var total = p.total != null ? p.total : '';
      var correct = p.correct != null ? p.correct : '';
      var wrong = '';
      if (p.total != null && p.correct != null) {
        wrong = Math.max(0, p.total - p.correct - (p.skipped || 0));
      }
      var bool = function (v) { return v === true ? '1' : (v === false ? '0' : ''); };
      lines.push([
        csvCell(trimTime(e.at)),
        csvCell(e.type),
        csvCell(p.subject || ''),
        csvCell(total),
        csvCell(correct),
        csvCell(wrong),
        csvCell(p.ms != null ? p.ms : ''),
        csvCell(p.mode || ''),
        csvCell(p.toolbarTaps != null ? p.toolbarTaps : ''),
        csvCell(bool(p.usedPhoto)),
        csvCell(bool(p.pasted)),
        csvCell(p.stemLen != null ? p.stemLen : ''),
        csvCell(bool(p.hasSource)),
        csvCell(bool(p.ocrUsed)),
        csvCell(p.ocrClicks != null ? p.ocrClicks : ''),
        csvCell(p.ocrOkCount != null ? p.ocrOkCount : ''),
        csvCell(p.ocrMsTotal != null ? p.ocrMsTotal : ''),
        csvCell(p.ocrChars != null ? p.ocrChars : '')
      ].join(','));
    });
    return lines.join('\r\n');
  }

  /**
   * 生成作答级 CSV。
   * 每行一次作答，用于算「复习了多少次才掌握」这类指标。
   */
  function buildAnswersCsv(db) {
    var answers = (db && Array.isArray(db.answers)) ? db.answers : [];
    var lines = ['时间,是否答对,作答类型,涉及知识点数'];
    answers.forEach(function (a) {
      lines.push([
        csvCell(trimTime(a.at)),
        a.correct ? '1' : '0',
        csvCell(a.kind || 'quiz'),
        Array.isArray(a.kpIds) ? a.kpIds.length : 0
      ].join(','));
    });
    return lines.join('\r\n');
  }

  QT.exportUsage = {
    APP_VERSION: APP_VERSION,
    PAYLOAD_ALLOW: PAYLOAD_ALLOW,
    EVENT_ALLOW: EVENT_ALLOW,
    cleanPayload: cleanPayload,
    trimTime: trimTime,
    buildAnonymous: buildAnonymous,
    buildEventsCsv: buildEventsCsv,
    buildAnswersCsv: buildAnswersCsv
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
