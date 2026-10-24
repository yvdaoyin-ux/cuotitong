/**
 * storage.js —— 本地存储层（localStorage）+ 数据模型 + 迁移
 *
 * 设计要点（与任务书的偏离，已确认理由）：
 * 1. 【只存事件流，不存派生量】掌握度、稳定度、复习优先级一律由「作答事件」实时算出，
 *    不落盘。若同时存一份「掌握度」，它与事件必然出现不一致，且删除错题后无法回滚。
 * 2. 【录题即答错】错题录入时写入一条 kind='intake'、correct=false 的作答事件。
 *    删除错题时按 mistakeId 连带删除它产生的事件，用户才有纠正误录的机会。
 * 3. 【schemaVersion】任何结构变更都要写迁移，且迁移必须幂等、可重复执行。
 *
 * 存储布局（一个 key 存整棵 JSON，数据量小，简单可靠）：
 *   qt:db  → { schemaVersion, createdAt, kps, mistakes, answers, events }
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});
  var util = QT.util;

  var DB_KEY = 'qt:db';
  var SCHEMA_VERSION = 2;

  /* ---------------- 存储后端 ---------------- */
  // 浏览器用 localStorage；Node 测试可注入内存后端。
  var backend = (function pickBackend() {
    try {
      if (global.localStorage) return global.localStorage;
    } catch (e) {
      // 某些隐私模式下访问 localStorage 会直接抛异常
    }
    var mem = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; }
    };
  })();

  function setBackend(b) { backend = b; }

  /* ---------------- 空库结构 ---------------- */

  function emptyDb() {
    return {
      schemaVersion: SCHEMA_VERSION,
      createdAt: util.nowIso(),
      kps: [],       // 用户自建知识点 [{id, subject, name, builtin:false}]
      mistakes: [],  // 错题 [{id, subject, kpIds, stem, myAnswer, correctAnswer, reason, createdAt, updatedAt}]
      answers: [],   // 作答事件 [{id, mistakeId, kpIds, correct, kind, at}]
      events: []     // 使用记录 [{id, type, at, payload}]
    };
  }

  /* ---------------- 迁移 ---------------- */

  /**
   * 迁移表：从版本 n 升到 n+1。必须幂等（重复执行结果一样）。
   *
   * v1 → v2：知识点体系由「高数/线代/概率（三科）」换成
   *          「数分/高代/概率/高数（四科）」，因此错题上的科目 id 与知识点 id 全部失效。
   * 处理顺序：① 科目做映射 ② 知识点先按旧名找新体系同名项 ③ 找不到则建一条自建知识点
   *          （宁可多一条自建知识点，也不能让错题变成孤儿——那会让它的作答记录算不进任何知识点）。
   */
  var V1_TO_V2_RENAME = {
    // 旧名 → 新体系里的对应名。
    // 原则：只放**真正等价或明确被包含**的映射。名字仍准确但新体系没有对应章的，
    // 不硬塞（见下方 resolveKp：会建一条同名的自建知识点），否则会把知识点归错章。

    // --- calc（旧·高等数学）→ gaoshu（同济高数）---
    '无穷小与连续': '函数与极限',
    '微分中值定理': '微分中值定理与导数应用',
    '洛必达法则': '微分中值定理与导数应用',
    '泰勒公式': '微分中值定理与导数应用',
    '反常积分': '定积分',
    '多元函数微分学': '多元函数微分法及其应用',
    '多元函数极值': '多元函数微分法及其应用',
    '二重积分': '重积分',
    '三重积分': '重积分',
    '曲线积分': '曲线积分与曲面积分',
    '曲面积分': '曲线积分与曲面积分',
    '傅里叶级数': '无穷级数',

    // --- linalg（旧·线性代数）→ alglinalg（北大高代）---
    '逆矩阵': '矩阵的秩与逆矩阵',
    '矩阵的秩': '矩阵的秩与逆矩阵',
    '初等变换': '矩阵的秩与逆矩阵',
    '向量组的线性相关性': '线性空间',
    '向量空间': '线性空间',
    '线性方程组解的结构': '线性方程组',
    '相似矩阵与对角化': '对角化与若尔当标准形',
    '实对称矩阵': '对角化与若尔当标准形',
    '二次型': '二次型与合同变换',
    '施密特正交化': '欧几里得空间',
    '内积与正交性': '欧几里得空间',

    // --- prob（旧·概率）→ prob（浙大概率论）---
    '全概率公式': '全概率公式与贝叶斯公式',
    '贝叶斯公式': '全概率公式与贝叶斯公式',
    '随机变量及其分布': '随机变量',
    '离散型随机变量': '离散型分布',
    '连续型随机变量': '连续型分布',
    '边缘分布': '边缘分布与条件分布',
    '条件分布': '边缘分布与条件分布',
    '样本与统计量': '样本与抽样分布'
  };

  var MIGRATIONS = {
    1: function (db) {
      var map = (QT.data && QT.data.LEGACY_SUBJECT_MAP) || {};
      var legacy = (QT.data && QT.data.LEGACY_KPS) || {};

      // 旧知识点 id → 名称
      var oldIdToName = {};
      Object.keys(legacy).forEach(function (subj) {
        legacy[subj].forEach(function (name, i) {
          oldIdToName['kp_' + subj + '_' + i] = name;
        });
      });

      var customByName = {};
      db.kps.forEach(function (k) {
        // 自建知识点的科目也要跟着迁移，否则会停在已废弃的 calc/linalg 上，
        // 变成任何科目下拉框都选不到的「孤儿知识点」。
        k.subject = map[k.subject] || k.subject;
        customByName[k.subject + '\u0000' + k.name] = k;
      });

      /** 旧知识点 id → 新知识点 id */
      var resolveKp = function (oldId, newSubject) {
        var name = oldIdToName[oldId];
        if (!name) return oldId; // 用户自建的（kp_uid 开头）或未知 id，原样保留
        var target = V1_TO_V2_RENAME[name] || name;
        var hit = QT.data && QT.data.findPreset(newSubject, target);
        if (hit) return hit.id;

        var key = newSubject + '\u0000' + target;
        if (!customByName[key]) {
          customByName[key] = {
            id: util.uid('kpu'), subject: newSubject, name: target, builtin: false
          };
          db.kps.push(customByName[key]);
        }
        return customByName[key].id;
      };

      db.mistakes.forEach(function (m) {
        var newSubject = map[m.subject] || m.subject;
        var mapped = (m.kpIds || []).map(function (id) { return resolveKp(id, newSubject); });
        // 多个旧知识点可能映射到同一个新知识点（如「洛必达法则」「泰勒公式」→「微分中值定理及其应用」），去重
        m.kpIds = mapped.filter(function (id, i) { return mapped.indexOf(id) === i; });
        m.subject = newSubject;
      });

      // 删除孤儿作答事件（指向已不存在的错题）：它们会让统计出现算不进去的噪音
      var liveIds = {};
      db.mistakes.forEach(function (m) { liveIds[m.id] = true; });
      db.answers = db.answers.filter(function (a) { return liveIds[a.mistakeId]; });

      db.answers.forEach(function (a) {
        var m = db.mistakes.filter(function (x) { return x.id === a.mistakeId; })[0];
        // 作答事件的知识点跟着错题走，保证统计口径一致
        a.kpIds = m.kpIds.slice();
      });

      return db;
    }
  };

  function migrate(db) {
    var v = Number(db.schemaVersion) || 0;
    if (v === 0) {
      // 早期数据没有版本号：补齐缺失字段，当作 v1
      db.schemaVersion = 1;
      v = 1;
    }
    while (v < SCHEMA_VERSION) {
      var fn = MIGRATIONS[v];
      if (typeof fn === 'function') db = fn(db);
      v += 1;
      db.schemaVersion = v;
    }
    return db;
  }

  /* ---------------- 读写 ---------------- */

  var cache = null; // 内存镜像，避免每次读都 JSON.parse

  function normalize(db) {
    var base = emptyDb();
    db = db && typeof db === 'object' ? db : {};
    // 注意：这里**不能**兜底成 SCHEMA_VERSION。
    // 早期数据没有版本号（视作 v0），若在此处就写成 2，migrate 会认为已经是最新而跳过迁移。
    db.schemaVersion = Number(db.schemaVersion) || 0;
    db.createdAt = db.createdAt || base.createdAt;
    ['kps', 'mistakes', 'answers', 'events'].forEach(function (k) {
      if (!Array.isArray(db[k])) db[k] = [];
    });
    // 逐条补默认值，防止手工导入的 JSON 缺字段导致界面崩
    db.mistakes.forEach(function (m) {
      m.kpIds = Array.isArray(m.kpIds) ? m.kpIds : [];
      m.myAnswer = m.myAnswer || '';
      m.correctAnswer = m.correctAnswer || '';
      m.reason = m.reason || '';
      m.createdAt = m.createdAt || util.nowIso();
      m.updatedAt = m.updatedAt || m.createdAt;
    });
    db.answers.forEach(function (a) {
      a.kpIds = Array.isArray(a.kpIds) ? a.kpIds : [];
      a.at = a.at || util.nowIso();
      a.correct = !!a.correct;
    });
    return migrate(db);
  }

  /** 读整库（带缓存）。解析失败时返回空库，不抛异常 —— 宁可丢一次显示也不能白屏。
   *
   * ⚠️ 返回的是**内部活引用**，不是快照：
   *   - 任何写入（addMistake / recordAnswer / mutate …）都会**就地修改**这个对象，
   *     你之前持有的引用会跟着变。
   *   - 因此：只在同一个同步流程里用完即弃；需要长期持有或比较「改前/改后」时，
   *     必须用 storage.snapshot()。
   * 这样做是为了性能（避免每次 UI 渲染都深拷贝全库）。
   */
  function load() {
    if (cache) return cache;
    var raw = null;
    try { raw = backend.getItem(DB_KEY); } catch (e) { raw = null; }
    var parsed = null;
    if (raw) {
      try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    }
    cache = normalize(parsed);
    return cache;
  }

  /** 写整库。写失败（配额满 / 隐私模式）抛异常，由调用方提示用户导出备份。 */
  function save(db) {
    db = normalize(db);
    var json = JSON.stringify(db);
    backend.setItem(DB_KEY, json);
    cache = db;
    return db;
  }

  /** 事务式修改：读出 → 改 → 写回，返回改后的值。 */
  function mutate(fn) {
    var db = load();
    var ret = fn(db);
    save(db);
    return ret;
  }

  /* ---------------- 知识点 ---------------- */

  /** 全部知识点 = 预置 + 用户自建。id 重复时以预置为准。 */
  function allKnowledgePoints() {
    var preset = QT.data.presetKnowledgePoints();
    var seen = {};
    preset.forEach(function (k) { seen[k.id] = true; });
    var custom = load().kps.filter(function (k) { return !seen[k.id]; });
    return preset.concat(custom);
  }

  function kpById(id) {
    var all = allKnowledgePoints();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  function kpsBySubject(subject) {
    return allKnowledgePoints().filter(function (k) { return k.subject === subject; });
  }

  /** 新增自定义知识点。同名同科目视为重复，直接返回已有的那个。 */
  function addKnowledgePoint(subject, name) {
    name = String(name || '').trim();
    if (!name) throw new Error('知识点名称不能为空');
    var existing = kpsBySubject(subject).filter(function (k) { return k.name === name; })[0];
    if (existing) return existing;
    return mutate(function (db) {
      var kp = { id: util.uid('kpu'), subject: subject, name: name, builtin: false };
      db.kps.push(kp);
      return kp;
    });
  }

  /* ---------------- 错题 + 作答事件 ---------------- */

  /**
   * 新增错题，同时写入一条「录入即答错」的作答事件。
   * @returns {object} 新建的错题
   */
  function addMistake(input) {
    var kpIds = Array.isArray(input.kpIds) ? input.kpIds.filter(Boolean) : [];
    if (!input.stem || !String(input.stem).trim()) throw new Error('题干不能为空');
    if (!kpIds.length) throw new Error('请至少选择一个知识点');

    return mutate(function (db) {
      // 允许指定创建时间：只有演示数据会用到，用来构造「几天前录的题」这种时间线
      var now = input.createdAt || util.nowIso();
      var m = {
        id: util.uid('m'),
        subject: input.subject,
        kpIds: kpIds,
        stem: String(input.stem).trim(),
        myAnswer: String(input.myAnswer || '').trim(),
        correctAnswer: String(input.correctAnswer || '').trim(),
        reason: input.reason || '',
        createdAt: now,
        updatedAt: now
      };
      // 演示数据标记：用于「一键清除示例」与「导出时排除示例」
      if (input.isSample) m.isSample = true;
      db.mistakes.push(m);
      db.answers.push({
        id: util.uid('a'),
        mistakeId: m.id,
        kpIds: kpIds.slice(),
        correct: false,
        kind: 'intake',
        at: now,
        // 事件也带标记，导出时才能连同作答一起排除
        isSample: input.isSample ? true : undefined
      });
      return m;
    });
  }

  /** 编辑错题。知识点变化时，历史事件不改写（那是当时的事实）。 */
  function updateMistake(id, patch) {
    return mutate(function (db) {
      var m = null;
      for (var i = 0; i < db.mistakes.length; i++) {
        if (db.mistakes[i].id === id) { m = db.mistakes[i]; break; }
      }
      if (!m) throw new Error('错题不存在');
      if (patch.stem != null) m.stem = String(patch.stem).trim();
      if (patch.myAnswer != null) m.myAnswer = String(patch.myAnswer).trim();
      if (patch.correctAnswer != null) m.correctAnswer = String(patch.correctAnswer).trim();
      if (patch.reason != null) m.reason = patch.reason;
      if (patch.subject != null) m.subject = patch.subject;
      if (Array.isArray(patch.kpIds)) m.kpIds = patch.kpIds.filter(Boolean);
      m.updatedAt = util.nowIso();
      return m;
    });
  }

  /**
   * 删除错题，并连带删除它产生的全部作答事件。
   * 这是「可纠错」的关键：否则误录一道题会永久压低该知识点的掌握度。
   */
  function deleteMistake(id) {
    return mutate(function (db) {
      var before = db.mistakes.length;
      db.mistakes = db.mistakes.filter(function (m) { return m.id !== id; });
      db.answers = db.answers.filter(function (a) { return a.mistakeId !== id; });
      // 注意：使用记录 events 不清除，它统计的是「用户做过什么」，与数据删改无关
      return before !== db.mistakes.length;
    });
  }

  function listMistakes(filter) {
    filter = filter || {};
    return load().mistakes.filter(function (m) {
      if (filter.subject && m.subject !== filter.subject) return false;
      if (filter.kpId && m.kpIds.indexOf(filter.kpId) < 0) return false;
      if (filter.reason && m.reason !== filter.reason) return false;
      return true;
    }).sort(function (a, b) {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
  }

  function getMistake(id) {
    var list = load().mistakes;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /**
   * 记录一次作答（组卷 / 复习 / 其它）。
   * 知识点取「此刻错题上的知识点」，而不是历史快照——避免知识点改了以后权重错乱。
   *
   * @param {string} mistakeId
   * @param {boolean} correct 自评对错
   * @param {string} kind     'quiz' | 'review' | 'intake'
   * @param {string} [note]   本次作答写的解法，可为空。存在事件里而不是覆盖错题的 myAnswer，
   *                          因为 myAnswer 记录的是「当初那次做错的答案」，两者语义不同。
   * @param {string} [at]     作答时刻，默认当前时间。仅演示数据与导入时才会指定。
   */
  function recordAnswer(mistakeId, correct, kind, note, at) {
    return mutate(function (db) {
      var m = null;
      for (var i = 0; i < db.mistakes.length; i++) {
        if (db.mistakes[i].id === mistakeId) { m = db.mistakes[i]; break; }
      }
      if (!m) throw new Error('错题不存在');
      var a = {
        id: util.uid('a'),
        mistakeId: mistakeId,
        kpIds: m.kpIds.slice(),
        correct: !!correct,
        kind: kind || 'quiz',
        note: String(note || '').trim(),
        at: at || util.nowIso()
      };
      // 示例题的作答也打标记：导出时按事件自身就能排除，
      // 不必依赖「错题还在库里」这一前提（错题被删时事件也会被删，但不做假设更稳）。
      if (m.isSample) a.isSample = true;
      db.answers.push(a);
      return a;
    });
  }

  function listAnswers() {
    return load().answers.slice();
  }

  /* ---------------- 使用记录 ---------------- */

  /** 记录一条使用事件。失败不抛异常（埋点不应该影响主流程）。 */
  function logEvent(type, payload) {
    try {
      return mutate(function (db) {
        var e = { id: util.uid('e'), type: type, at: util.nowIso(), payload: payload || {} };
        db.events.push(e);
        return e;
      });
    } catch (e) {
      return null;
    }
  }

  function listEvents() {
    return load().events.slice();
  }

  /* ---------------- 导入 / 导出 ---------------- */

  /**
   * 取一份**深拷贝快照**。
   * load() 返回内部活引用（写入会就地改动），所以要比较「改前/改后」
   * 或需要长期持有时必须用这个，否则两边会一起变。
   */
  function snapshot() {
    return JSON.parse(JSON.stringify(load()));
  }

  function exportJson() {
    return JSON.stringify(load(), null, 2);
  }

  /**
   * 导入备份：整体替换。先校验结构，再写入。
   * 不做「合并」——合并两份数据的语义很难向用户解释清楚，替换更可预期。
   */
  function importJson(text) {
    var obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error('不是合法的 JSON 文件'); }
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.mistakes)) {
      throw new Error('文件结构不对：缺少 mistakes 数组');
    }
    return save(normalize(obj));
  }

  /** 清空全部数据（设置页用，需二次确认）。 */
  function resetAll() {
    try { backend.removeItem(DB_KEY); } catch (e) { /* ignore */ }
    cache = null;
    return load();
  }

  QT.storage = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    DB_KEY: DB_KEY,
    emptyDb: emptyDb,
    normalize: normalize,
    migrate: migrate,
    load: load,
    save: save,
    mutate: mutate,
    setBackend: setBackend,
    allKnowledgePoints: allKnowledgePoints,
    kpById: kpById,
    kpsBySubject: kpsBySubject,
    addKnowledgePoint: addKnowledgePoint,
    addMistake: addMistake,
    updateMistake: updateMistake,
    deleteMistake: deleteMistake,
    listMistakes: listMistakes,
    getMistake: getMistake,
    recordAnswer: recordAnswer,
    listAnswers: listAnswers,
    logEvent: logEvent,
    listEvents: listEvents,
    exportJson: exportJson,
    importJson: importJson,
    snapshot: snapshot,
    resetAll: resetAll
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
