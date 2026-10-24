/**
 * stats.js —— 三个统计模型（本项目的科学核心）
 *
 * 全部为纯函数 + 一个显式配置对象，不碰 DOM、不碰存储，因此可在 Node 里直接测试：
 *     node tests/stats.test.js
 *
 * 三个模型：
 *   3.1 掌握度   Beta(α, β) 贝叶斯平滑，中文档给出点估计与 95% 可信区间
 *   3.2 遗忘曲线 R = exp(-t / S)，稳定度 S 随作答成败伸缩
 *   3.3 组卷抽样 按「复习优先级 + ε」加权、无放回，同知识点不超过总题数 40%
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});

  /* ============================================================
   * 配置：所有魔数集中在这里，方便报告里说明「为什么取这个值」
   * ============================================================ */
  var CONFIG = {
    // --- 掌握度 ---
    priorAlpha: 1,          // Beta 先验 α0
    priorBeta: 1,           // Beta 先验 β0（先验均值 0.5，等价「一无所知」）
    confidence: 0.95,       // 可信区间置信水平
    // 有效样本量低于此值 → 界面显示「数据不足」。
    // 取 5：Beta(6,1) 的下界才第一次超过 0.5，之前区间宽到无法下结论。
    minSamples: 5,

    // --- 遗忘曲线 ---
    initialStability: 1,    // 初始稳定度 S0（天）
    stabilityUpFactor: 2,   // 答对 S ×= 2
    stabilityDownFactor: 0.5, // 答错 S ×= 0.5
    minStability: 0.5,      // S 下限（天），防止连错后 R 归零、题目永远黏住

    // --- 组卷 ---
    epsilon: 0.05,          // 权重小常数，保证冷门题也有机会
    maxSameKpRatio: 0.4,    // 同一知识点最多占总题数的比例
    quizSizes: [5, 10, 15, 20]
  };

  if (typeof global.QT_STATS_CONFIG === 'undefined') {
    // 仅供测试时覆盖，业务代码不要改它
    global.QT_STATS_CONFIG = null;
  }

  function cfg() {
    return global.QT_STATS_CONFIG || CONFIG;
  }

  /* ============================================================
   * 3.1 掌握度：Beta(α, β) 贝叶斯平滑
   * ------------------------------------------------------------
   * 建模：把某知识点的「答对」看作伯努利试验，正确率 p 的先验取 Beta(1,1)（均匀分布）。
   *       共答对 a 次、答错 b 次后，后验为 Beta(α0+a, β0+b)。
   * 点估计：掌握度 = α / (α + β)，即后验均值 —— 就是带平滑的准确率。
   * 为什么必须平滑：直接算 对/(对+错)，答 1 题答对就是 100%、答 1 题答错就是 0%，
   *       极端值会让组卷权重和诊断结论完全失真。先验把估计拉回 0.5 附近，样本越多拉得越松。
   *
   * 区间：用 Beta 的精确分位数（正态近似在 α、β 很小时严重失真，
   *       例如 Beta(2,1) 的真实 95% 区间下界是 0.094，正态近似会给出负数）。
   *       分位数用连分式求逆正则不完全 Beta 函数，精度 1e-10。
   * ============================================================ */

  /** ln Γ(x)，Lanczos 近似，x > 0。 */
  var LANCZOS = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7
  ];

  function lnGamma(x) {
    if (x < 0.5) {
      // 反射公式 Γ(x)Γ(1-x) = π / sin(πx)
      return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
    }
    x -= 1;
    var a = 0.99999999999980993;
    for (var i = 0; i < LANCZOS.length; i++) a += LANCZOS[i] / (x + i + 1);
    var t = x + LANCZOS.length - 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }

  /** 连分式展开，用于不完全 Beta 函数（Numerical Recipes 6.4 的 betacf）。 */
  function betacf(a, b, x) {
    var MAXIT = 300, EPS = 1e-12, FPMIN = 1e-300;
    var qab = a + b, qap = a + 1, qam = a - 1;
    var c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    var h = d;
    for (var m = 1; m <= MAXIT; m++) {
      var m2 = 2 * m;
      var aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      var del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  /** 正则化不完全 Beta 函数 I_x(a, b)，即 Beta(a,b) 的 CDF。 */
  function betaIncomplete(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var lbeta = lnGamma(a + b) - lnGamma(a) - lnGamma(b);
    var front = Math.exp(lbeta + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return front * betacf(a, b, x) / a;
    return 1 - front * betacf(b, a, 1 - x) / b;
  }

  /** Beta(a,b) 的 p 分位数：二分法反解 CDF。a,b ≥ 0.5 时单调光滑，二分足够稳。 */
  function betaQuantile(p, a, b) {
    var lo = 0, hi = 1, mid = 0.5;
    for (var i = 0; i < 200; i++) {
      mid = (lo + hi) / 2;
      var cdf = betaIncomplete(a, b, mid);
      if (Math.abs(cdf - p) < 1e-12) break;
      if (cdf < p) lo = mid; else hi = mid;
    }
    return mid;
  }

  /**
   * 单知识点掌握度。
   * @param {number} correct 答对次数
   * @param {number} wrong   答错次数
   * @returns {{alpha,beta,posteriorMean,low,high,n,sufficient}}
   */
  function mastery(correct, wrong) {
    var c = Math.max(0, Number(correct) || 0);
    var w = Math.max(0, Number(wrong) || 0);
    var a = cfg().priorAlpha + c;
    var b = cfg().priorBeta + w;
    var n = c + w;
    var conf = cfg().confidence;
    var tail = (1 - conf) / 2;
    return {
      alpha: a,
      beta: b,
      posteriorMean: a / (a + b),
      low: n === 0 ? 0 : betaQuantile(tail, a, b),
      high: n === 0 ? 1 : betaQuantile(1 - tail, a, b),
      n: n,
      sufficient: n >= cfg().minSamples
    };
  }

  /* ============================================================
   * 3.2 遗忘曲线：R = exp(-t / S)
   * ------------------------------------------------------------
   * Ebbinghaus 式指数遗忘：距今 t 天时，记忆留存率 R = exp(-t / S)。
   * S（稳定度，单位「天」）表示「遗忘到 1/e 所需的天数」，越大忘得越慢。
   * 更新规则：答对 S ← S×2；答错 S ← max(S_min, S×0.5)。
   * 新错题的 S 从 1 天起算，所以第二天 R≈0.37，第三天 R≈0.05，与「隔天复习」的直觉一致。
   * ============================================================ */

  /** 由一串作答事件（时间升序）递推稳定度。 */
  function stabilityFromEvents(events) {
    var c = cfg();
    var S = c.initialStability;
    var list = (events || []).slice().sort(function (x, y) {
      return String(x.at).localeCompare(String(y.at));
    });
    for (var i = 0; i < list.length; i++) {
      if (list[i].correct) S = S * c.stabilityUpFactor;
      else S = Math.max(c.minStability, S * c.stabilityDownFactor);
    }
    return S;
  }

  /** 记忆留存率。t 单位为天，负值按 0 处理。 */
  function retention(days, stability) {
    var S = Math.max(cfg().minStability, Number(stability) || cfg().initialStability);
    var t = Math.max(0, Number(days) || 0);
    return Math.exp(-t / S);
  }

  /**
   * 复习优先级 = (1 - R) × (1 - 掌握度)。
   * 越忘得厉害（R 小）、掌握度越低，越该先复习。取值范围 [0, 1)。
   */
  function reviewPriority(days, stability, masteryValue) {
    var R = retention(days, stability);
    var m = Math.max(0, Math.min(1, Number(masteryValue)));
    return (1 - R) * (1 - m);
  }

  /**
   * 汇总某个知识点此刻的状态。
   * @param {Array} events 该知识点的作答事件 [{correct, at}]
   * @param {string} nowIso 参考时刻
   */
  function kpState(events, nowIso) {
    var list = events || [];
    var correct = 0, wrong = 0, lastAt = null;
    list.forEach(function (e) {
      if (e.correct) correct += 1; else wrong += 1;
      if (!lastAt || String(e.at) > String(lastAt)) lastAt = e.at;
    });
    var m = mastery(correct, wrong);
    var S = stabilityFromEvents(list);
    var days = lastAt ? daysSince(lastAt, nowIso) : 0;
    var R = retention(days, S);
    return {
      correct: correct,
      wrong: wrong,
      mastery: m.posteriorMean,
      low: m.low,
      high: m.high,
      n: m.n,
      sufficient: m.sufficient,
      stability: S,
      lastAt: lastAt,
      daysSinceLast: days,
      retention: R,
      priority: reviewPriority(days, S, m.posteriorMean)
    };
  }

  function daysSince(iso, nowIso) {
    var a = new Date(iso).getTime();
    var b = new Date(nowIso || Date.now()).getTime();
    if (isNaN(a) || isNaN(b)) return 0;
    return Math.max(0, (b - a) / 86400000);
  }

  /* ============================================================
   * 3.3 组卷：加权无放回抽样 + 知识点配额
   * ------------------------------------------------------------
   * 每题权重 = 其各知识点复习优先级的均值 + ε。
   *   ε 的作用：优先级可能为 0（刚答对且掌握度很高），加 ε 后仍有被抽中的机会，
   *   否则强者恒强、弱者永远不复习到，这违背「查漏补缺」的目标。
   * 知识点配额：任一知识点被抽中的题目数 ≤ ceil(总题数 × 40%)，防止一张卷全是同一章。
   * ============================================================ */

  /**
   * 加权无放回抽样。
   * @param {Array<{id:string, weight:number, kpIds:string[]}>} candidates
   * @param {number} k 抽几道
   * @param {object} [opts] {rng, maxPerKp}
   * @returns {Array} 抽中的候选（保持输入顺序无关）
   */
  function weightedSample(candidates, k, opts) {
    opts = opts || {};
    var rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    var pool = (candidates || []).slice();
    var n = Math.min(Math.max(0, Math.floor(k)), pool.length);
    if (n === 0) return [];

    var c = cfg();
    var perKpCap = opts.maxPerKp != null
      ? opts.maxPerKp
      : Math.max(1, Math.ceil(n * c.maxSameKpRatio));

    var picked = [];
    var kpCount = {};
    // 放宽配额的两轮策略：先按配额抽，抽不满再放宽到「至少 1 道」，
    // 保证「选了 10 道题但错题本只有 3 章」这种真实情况下也能凑够题。
    var cap = perKpCap;
    var relaxTried = 0;

    while (picked.length < n && pool.length > 0) {
      // 过滤掉会超配额的候选
      var eligible = pool.filter(function (m) {
        return (m.kpIds || []).every(function (id) { return (kpCount[id] || 0) < cap; });
      });
      if (eligible.length === 0) {
        if (relaxTried >= 2) break; // 已经放宽两级，凑不满就返回实际的数目
        relaxTried += 1;
        cap += Math.max(1, perKpCap); // 逐级放宽
        continue;
      }

      var totalW = 0;
      var i;
      for (i = 0; i < eligible.length; i++) {
        totalW += Math.max(0, Number(eligible[i].weight) || 0) + c.epsilon;
      }
      var r = rng() * totalW;
      var acc = 0;
      var chosenIdx = 0;
      for (i = 0; i < eligible.length; i++) {
        acc += Math.max(0, Number(eligible[i].weight) || 0) + c.epsilon;
        if (r <= acc) { chosenIdx = i; break; }
        chosenIdx = i;
      }
      var chosen = eligible[chosenIdx];
      picked.push(chosen);
      (chosen.kpIds || []).forEach(function (id) {
        kpCount[id] = (kpCount[id] || 0) + 1;
      });
      // 从池中移除（按 id 去重）
      pool = pool.filter(function (m) { return m.id !== chosen.id; });
    }

    return picked;
  }

  /**
   * 从错题列表构建组卷候选。
   * @param {Array} mistakes 错题
   * @param {object} statesByKp  {kpId: kpState}
   */
  function buildCandidates(mistakes, statesByKp) {
    return (mistakes || []).map(function (m) {
      var kpIds = m.kpIds || [];
      var sum = 0, cnt = 0;
      kpIds.forEach(function (id) {
        var st = statesByKp[id];
        if (st) { sum += st.priority; cnt += 1; }
      });
      return {
        id: m.id,
        kpIds: kpIds.slice(),
        // 没有任何状态（理论上不该发生）时给 0.5，视为中等优先级
        weight: cnt > 0 ? sum / cnt : 0.5
      };
    });
  }

  /* ============================================================
   * 便捷聚合：从「错题 + 作答事件」算出每个知识点的状态
   * ------------------------------------------------------------
   * 这是 storage 与 stats 之间唯一的胶水函数，UI 一律用它。
   * ============================================================ */

  function computeStates(mistakes, answers, nowIso) {
    var byKp = {};
    (answers || []).forEach(function (a) {
      (a.kpIds || []).forEach(function (kpId) {
        (byKp[kpId] = byKp[kpId] || []).push(a);
      });
    });
    var out = {};
    Object.keys(byKp).forEach(function (kpId) {
      out[kpId] = kpState(byKp[kpId], nowIso);
    });
    // 有错题但还没有作答事件的知识点（正常不会出现，防守式补齐）
    (mistakes || []).forEach(function (m) {
      (m.kpIds || []).forEach(function (kpId) {
        if (!out[kpId]) out[kpId] = kpState([], nowIso);
      });
    });
    return out;
  }

  /**
   * 今日复习队列：错题级别的优先级排序。
   *
   * 与组卷的区别：组卷是「按薄弱度随机抽」，复习是「按到期程度确定性排序」。
   * 同一道题的各知识点优先级取均值（与组卷权重口径一致），
   * 再过滤掉还「新鲜」的题（留存率 ≥ 阈值），否则每次都会看到刚做过的题。
   *
   * @param {Array} mistakes 错题
   * @param {Array} answers  作答事件
   * @param {string} nowIso  参考时刻
   * @param {object} [opts]  {limit, freshThreshold}
   * @returns {Array} [{mistake, priority, retention, daysSince, mastery, kpIds}]
   */
  function buildReviewQueue(mistakes, answers, nowIso, opts) {
    opts = opts || {};
    var limit = opts.limit == null ? 10 : opts.limit;
    var fresh = opts.freshThreshold == null ? 0.9 : opts.freshThreshold;
    var states = computeStates(mistakes, answers, nowIso);

    var rows = (mistakes || []).map(function (m) {
      var kpIds = m.kpIds || [];
      var prio = 0, ret = 0, mastered = 0, n = 0, days = 0;
      kpIds.forEach(function (id) {
        var st = states[id];
        if (!st) return;
        prio += st.priority;
        ret += st.retention;
        mastered += st.mastery;
        days = Math.max(days, st.daysSinceLast);
        n += 1;
      });
      return {
        mistake: m,
        // 词组名称由调用方解析：本文件不依赖存储层，才能单独在 Node 里测
        kpIds: kpIds.slice(),
        priority: n ? prio / n : 0,
        retention: n ? ret / n : 1,
        mastery: n ? mastered / n : 0.5,
        daysSince: days
      };
    });

    // 只保留「确实该复习了」的：留存率低于阈值，且优先级为正
    var due = rows.filter(function (r) {
      return r.priority > 0 && r.retention < fresh;
    });
    due.sort(function (a, b) { return b.priority - a.priority; });
    return due.slice(0, limit);
  }

  QT.stats = {
    CONFIG: CONFIG,
    // 数学工具（也导出，便于测试与调试）
    lnGamma: lnGamma,
    betaIncomplete: betaIncomplete,
    betaQuantile: betaQuantile,
    // 3.1
    mastery: mastery,
    // 3.2
    stabilityFromEvents: stabilityFromEvents,
    retention: retention,
    reviewPriority: reviewPriority,
    kpState: kpState,
    daysSince: daysSince,
    // 3.3
    weightedSample: weightedSample,
    buildCandidates: buildCandidates,
    // 聚合
    computeStates: computeStates,
    buildReviewQueue: buildReviewQueue
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
