/**
 * sample-data.js —— 演示数据：一键加载 / 一键清除
 *
 * ============================================================
 * 🔴 这些数据只能用于演示和测试，**不能当真实使用数据写进报告**
 * ============================================================
 * 为此每条错题都带 `isSample: true` 标记：
 *   1. 错题本会给它们打「示例」角标，用户一眼能分辨
 *   2. 一键清除只删带标记的数据，绝不碰用户自己录的题
 *   3. **导出匿名使用数据时，示例数据被整体排除**（见 export-usage.js）
 *      —— 否则报告里的「应用情况」会掺进我编的数字，属于造假
 *
 * ============================================================
 * 为什么要带「历史作答记录」
 * ============================================================
 * 只录题不答，每个知识点只有 1 次作答 → 诊断页全是「数据不足」、
 * 雷达图画不出来，用户载入示例后看到的是一个空壳，演示不出任何东西。
 * 所以给每道题配一条 `history`（距今天数 + 当时对错），
 * 模拟「一个真实用了十来天的人」，这样：
 *   - 掌握度能拉开差距（有的 71%，有的 29%）
 *   - 遗忘曲线有真实的 t，复习队列能挑出到期题
 *   - 雷达图有 ≥3 个达标知识点，画得出来
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});

  /**
   * 演示题。字段说明：
   *   subject  科目 id
   *   kps      知识点名称数组（必须是该科目预置知识点里存在的名字）
   *   stem     题干
   *   my       当初写错的答案
   *   answer   正确答案/解析
   *   reason   错因 id
   *   ago      距今天数，这一天的「录入」就是这个时间（录题即答错）
   *   history  后续作答 [{d: 距今天数, c: 是否答对}]
   *            d 越小越新；同一天里按数组顺序
   */
  var SAMPLE_MISTAKES = [
    /* ---------- 数学分析 ---------- */
    {
      subject: 'matan',
      kps: ['数项级数'],
      ago: 9,
      stem: '判断级数 $\\sum_{n=1}^{\\infty}\\frac{1}{n^{3/2}}$ 的敛散性。',
      my: '发散',
      answer: '收敛。这是 $p$-级数，$p=\\frac{3}{2}>1$，故收敛。' +
        '记忆要点：$p>1$ 收敛，$p\\le 1$ 发散。',
      reason: 'concept',
      history: [{ d: 7, c: false }, { d: 5, c: true }, { d: 3, c: true }, { d: 1, c: true }]
    },
    {
      subject: 'matan',
      kps: ['幂级数'],
      ago: 8,
      stem: '求幂级数 $\\sum_{n=1}^{\\infty}\\frac{x^{n}}{n}$ 的收敛半径与收敛域。',
      my: '$R=1$，收敛域为 $(-1,1)$',
      answer: '$R=1$。端点单独判：$x=1$ 时为调和级数 $\\sum\\frac1n$，发散；' +
        '$x=-1$ 时为交错调和级数，收敛。故收敛域为 $[-1,1)$。' +
        '易错点：收敛区间不等于收敛域，端点必须单独验。',
      reason: 'reading',
      history: [{ d: 6, c: false }, { d: 4, c: false }, { d: 2, c: true }, { d: 0.5, c: false }]
    },
    {
      subject: 'matan',
      kps: ['重积分'],
      ago: 7,
      stem: '计算 $\\iint_{D}(x^{2}+y^{2})\\,\\mathrm{d}\\sigma$，其中 $D:x^{2}+y^{2}\\le 1$。',
      my: '$\\pi$',
      answer: '用极坐标：$\\int_{0}^{2\\pi}\\!\\!\\int_{0}^{1} r^{2}\\cdot r\\,\\mathrm{d}r\\,\\mathrm{d}\\theta' +
        ' = 2\\pi\\cdot\\frac{1}{4}=\\frac{\\pi}{2}$。' +
        '易错点：面积元 $\\mathrm{d}\\sigma = r\\,\\mathrm{d}r\\,\\mathrm{d}\\theta$ 别漏了那个 $r$。',
      reason: 'formula',
      history: [{ d: 5, c: true }, { d: 3, c: true }, { d: 1, c: true }, { d: 0.2, c: true }]
    },
    {
      subject: 'matan',
      kps: ['隐函数定理及其应用'],
      ago: 6,
      stem: '设 $x^{2}+y^{2}+z^{2}=1$ 确定 $z=z(x,y)$，求 $\\frac{\\partial z}{\\partial x}$。',
      my: '$2x$',
      answer: '令 $F=x^{2}+y^{2}+z^{2}-1$，则 $z_{x}=-\\frac{F_{x}}{F_{z}}=-\\frac{2x}{2z}=-\\frac{x}{z}$' +
        '（需 $z\\ne 0$）。易错点：别把 $z$ 当常数，它对 $x$ 有依赖。',
      reason: 'method',
      history: [{ d: 4, c: false }, { d: 2, c: true }, { d: 0.5, c: true }, { d: 0.1, c: false }]
    },
    {
      subject: 'matan',
      kps: ['函数列与函数项级数'],
      ago: 5,
      stem: '讨论 $f_{n}(x)=x^{n}$ 在 $[0,1]$ 上是否一致收敛。',
      my: '是，因为逐点收敛到 0',
      answer: '不一致收敛。极限函数 $f(x)=0\\ (x<1),\\ f(1)=1$，不连续；' +
        '而一致收敛会保持连续性，矛盾。逐点收敛不蕴含一致收敛。',
      reason: 'concept',
      history: [{ d: 3, c: false }, { d: 1, c: true }, { d: 0.3, c: true }, { d: 0.05, c: true }]
    },
    {
      subject: 'matan',
      kps: ['微分中值定理及其应用'],
      ago: 10,
      stem: '设 $f(x)$ 在 $[0,1]$ 上连续、$(0,1)$ 内可导，且 $f(0)=f(1)=0$。' +
        '证明：存在 $\\xi\\in(0,1)$ 使 $f\'(\\xi)=f(\\xi)$。',
      my: '直接对 $f$ 用罗尔定理',
      answer: '构造辅助函数 $F(x)=e^{-x}f(x)$。则 $F(0)=F(1)=0$，' +
        '由罗尔定理存在 $\\xi$ 使 $F\'(\\xi)=e^{-\\xi}\\big(f\'(\\xi)-f(\\xi)\\big)=0$，' +
        '即 $f\'(\\xi)=f(\\xi)$。要点：见 $f\'-f$ 就乘 $e^{-x}$。',
      reason: 'method',
      history: [
        { d: 8, c: false }, { d: 6, c: true }, { d: 4, c: true },
        { d: 2, c: true }, { d: 0.5, c: true }
      ]
    },

    /* ---------- 高等代数 ---------- */
    {
      subject: 'alglinalg',
      kps: ['行列式'],
      ago: 9,
      stem: '计算 $\\begin{vmatrix}1&2&3\\\\4&5&6\\\\7&8&9\\end{vmatrix}$。',
      my: '$0$（猜的）',
      answer: '答案为 $0$。观察可知第三行 = 第二行 × 2 − 第一行，' +
        '即行向量线性相关，故行列式为 $0$。用观察法比硬算更快。',
      reason: 'calc',
      history: [{ d: 7, c: true }, { d: 5, c: true }, { d: 3, c: true }, { d: 1, c: true }]
    },
    {
      subject: 'alglinalg',
      kps: ['矩阵的秩与逆矩阵'],
      ago: 8,
      stem: '设 $A$ 为 $3$ 阶矩阵，$|A|=2$，求 $|2A^{-1}|$。',
      my: '$2\\cdot\\frac{1}{2}=1$',
      answer: '$|2A^{-1}|=2^{3}\\cdot|A^{-1}|=8\\cdot\\frac{1}{2}=4$。' +
        '易错点：$|kA|=k^{n}|A|$，别忘了 $n$ 次方。',
      reason: 'formula',
      history: [{ d: 6, c: false }, { d: 4, c: false }, { d: 2, c: true }, { d: 0.5, c: false }]
    },
    {
      subject: 'alglinalg',
      kps: ['特征值与特征向量'],
      ago: 6,
      stem: '设 $A$ 的特征值为 $1,2,3$，求 $|A^{2}-A+I|$。',
      my: '不确定',
      answer: '$A^{2}-A+I$ 的特征值为 $\\lambda^{2}-\\lambda+1$，' +
        '分别代入得 $1,\\ 3,\\ 7$，故行列式为 $1\\times3\\times7=21$。' +
        '要点：多项式变换直接作用于特征值。',
      reason: 'method',
      history: [{ d: 4, c: false }, { d: 2, c: true }, { d: 0.5, c: true }, { d: 0.1, c: true }]
    },

    /* ---------- 概率论与数理统计 ---------- */
    {
      subject: 'prob',
      kps: ['全概率公式与贝叶斯公式'],
      ago: 7,
      stem: '甲箱有 2 红 3 白，乙箱有 3 红 2 白。先从甲箱随机取一球放入乙箱，' +
        '再从乙箱取一球，求取到红球的概率。',
      my: '$\\frac{3}{6}=\\frac12$',
      answer: '用全概率公式：$P=\\frac{2}{5}\\cdot\\frac{4}{6}+\\frac{3}{5}\\cdot\\frac{3}{6}' +
        '=\\frac{8}{30}+\\frac{9}{30}=\\frac{17}{30}\\approx 0.567$。' +
        '要点：先按「第一步取到什么」分情况，再分别算条件概率。',
      reason: 'method',
      history: [{ d: 5, c: false }, { d: 3, c: false }, { d: 1, c: true }, { d: 0.2, c: true }]
    },
    {
      subject: 'prob',
      kps: ['数学期望'],
      ago: 5,
      stem: '设 $X\\sim N(\\mu,\\sigma^{2})$，求 $E(|X-\\mu|)$。',
      my: '$\\sigma$',
      answer: '$E(|X-\\mu|)=\\sigma\\sqrt{\\frac{2}{\\pi}}\\approx 0.798\\sigma$。' +
        '推导：标准化后 $E|Z|=\\int_{-\\infty}^{\\infty}|z|\\varphi(z)dz' +
        '=2\\int_0^{\\infty}z\\varphi(z)dz=\\sqrt{\\frac{2}{\\pi}}$。' +
        '易错点：$E|X-\\mu|$ 不等于 $\\sigma$，别和标准差混淆。',
      reason: 'formula',
      history: [{ d: 3, c: false }, { d: 1, c: false }, { d: 0.3, c: true }]
    },

    /* ---------- 高等数学 ---------- */
    {
      subject: 'gaoshu',
      kps: ['导数与微分'],
      ago: 4,
      stem: '求 $y=x^{x}\\ (x>0)$ 的导数。',
      my: '$x\\cdot x^{x-1}=x^{x}$',
      answer: '取对数：$\\ln y=x\\ln x$，两边求导 $\\frac{y\'}{y}=\\ln x+1$，' +
        '故 $y\'=x^{x}(\\ln x+1)$。' +
        '要点：底数与指数都含 $x$ 时必须取对数，不能套幂函数公式。',
      reason: 'concept',
      history: [{ d: 2, c: false }, { d: 0.5, c: true }, { d: 0.1, c: false }]
    }
  ];

  /** 按名称找预置知识点的 id；找不到说明写错了，直接跳过而不是崩掉。 */
  function resolveKpIds(kps, subject, names) {
    var out = [];
    (names || []).forEach(function (name) {
      for (var i = 0; i < kps.length; i++) {
        if (kps[i].subject === subject && kps[i].name === name) {
          out.push(kps[i].id);
          return;
        }
      }
      // 找不到时在控制台留痕，方便我排查写错的知识点名
      if (typeof console !== 'undefined') {
        console.warn('[sample-data] 预置知识点里没有「' + name + '」（科目 ' + subject + '），已跳过');
      }
    });
    return out;
  }

  /** 距今天数 → ISO 时间。 */
  function daysAgoIso(d) {
    return new Date(Date.now() - Number(d) * 86400000).toISOString();
  }

  /** 统计当前库里的示例题数量。 */
  function countSample(db) {
    db = db || QT.storage.load();
    return (db.mistakes || []).filter(function (m) { return m.isSample; }).length;
  }

  /**
   * 加载演示数据。
   * 已存在示例数据时先清掉，避免重复点两次变成两份。
   * @returns {{added:number, skipped:number, answers:number}}
   */
  function load() {
    var kps = QT.storage.allKnowledgePoints();
    var added = 0;
    var skipped = 0;
    var answers = 0;

    clear({ silent: true });

    SAMPLE_MISTAKES.forEach(function (item) {
      var kpIds = resolveKpIds(kps, item.subject, item.kps);
      if (!kpIds.length) { skipped += 1; return; }
      try {
        // 回溯录入时间：这样遗忘曲线的 t 是真实跨度，而不是「全部刚刚」
        var m = QT.storage.addMistake({
          subject: item.subject,
          kpIds: kpIds,
          stem: item.stem,
          myAnswer: item.my,
          correctAnswer: item.answer,
          reason: item.reason,
          createdAt: daysAgoIso(item.ago),
          isSample: true
        });
        added += 1;

        // 补历史作答，让掌握度/留存率有真实分布
        (item.history || []).forEach(function (h) {
          try {
            QT.storage.recordAnswer(m.id, !!h.c, h.c ? 'review' : 'quiz', '', daysAgoIso(h.d));
            answers += 1;
          } catch (e) { /* 单条失败不影响整体 */ }
        });
      } catch (e) {
        skipped += 1;
      }
    });

    QT.storage.logEvent('sample_load', { count: added });
    return { added: added, skipped: skipped, answers: answers };
  }

  /**
   * 清除演示数据。只删带 isSample 标记的错题，
   * 连带删除它们产生的作答事件（交给 deleteMistake），用户自己的数据一根毫毛都不动。
   * @returns {number} 删除条数
   */
  function clear(opts) {
    opts = opts || {};
    var db = QT.storage.load();
    var ids = (db.mistakes || [])
      .filter(function (m) { return m.isSample; })
      .map(function (m) { return m.id; });

    ids.forEach(function (id) {
      try { QT.storage.deleteMistake(id); } catch (e) { /* 单条失败不影响其余 */ }
    });

    if (ids.length && !opts.silent) {
      QT.storage.logEvent('sample_clear', { count: ids.length });
    }
    return ids.length;
  }

  QT.sampleData = {
    SAMPLE_MISTAKES: SAMPLE_MISTAKES,
    countSample: countSample,
    load: load,
    clear: clear
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
