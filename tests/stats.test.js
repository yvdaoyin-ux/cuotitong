/**
 * tests/stats.test.js —— 统计模块单元测试
 *
 * 运行：cd 03-错题通 && node tests/stats.test.js
 * 不依赖任何测试框架，只用 node:assert —— 现场演示不需要 npm install。
 *
 * 覆盖任务书第 3 节要求的四条：
 *   ① 全答对时掌握度上升且小于 1
 *   ② 样本少时区间宽
 *   ③ t 越大 R 越小
 *   ④ 抽样结果不重复且数量正确
 * 另加数学正确性校验（Beta 分位数 vs 已知值）与边界情况。
 */
'use strict';

const assert = require('node:assert');
const path = require('node:path');

// stats.js 挂在 globalThis.QT 上，直接 require 即可（不需要 browser 环境）
require(path.join(__dirname, '..', 'js', 'stats.js'));

const S = globalThis.QT.stats;

/* ---------------- 极简测试框架 ---------------- */

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ✓ ' + name);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    console.log('  ✗ ' + name);
    console.log('    ' + String(err.message).split('\n').join('\n    '));
  }
}

function group(name, fn) {
  console.log('\n' + name);
  fn();
}

/** 近似相等，用于浮点比较。 */
function close(actual, expected, tol, msg) {
  tol = tol || 1e-6;
  assert.ok(
    Math.abs(actual - expected) <= tol,
    (msg || '') + ' 期望 ' + expected + '±' + tol + '，实际 ' + actual
  );
}

/* ============================================================
 * 数学工具：先证明分位数实现是对的，否则上层结论不可信
 * ============================================================ */

group('数学工具 · Beta 分位数', () => {
  test('Beta(1,1) 是均匀分布，中位数 0.5', () => {
    close(S.betaQuantile(0.5, 1, 1), 0.5, 1e-6);
  });

  test('Beta(1,1) 的 2.5% 分位数 ≈ 0.025', () => {
    close(S.betaQuantile(0.025, 1, 1), 0.025, 1e-6);
  });

  // Beta(2,1) 的密度是 f(x)=2x，故 CDF 为 F(x)=x²，分位数有闭式解 x=√p
  // 用它做独立对照，比硬编码常数更能发现实现错误
  test('Beta(2,1) 的分位数 = √p（闭式解对照）', () => {
    [0.025, 0.5, 0.975].forEach((p) => {
      close(S.betaQuantile(p, 2, 1), Math.sqrt(p), 1e-6, 'p=' + p);
    });
  });

  test('Beta(2,1) 的 95% 区间下界 ≈ 0.158（正态近似会给出负数，故选精确分位数）', () => {
    const q = S.betaQuantile(0.025, 2, 1);
    close(q, 0.158113883008419, 1e-9);
    assert.ok(q > 0, '下界不应为负 —— 这正是放弃正态近似的原因');
  });

  test('Beta(6,2) 与已知 CDF 自洽：CDF(中位数) ≈ 0.5', () => {
    const q = S.betaQuantile(0.5, 6, 2);
    close(S.betaIncomplete(6, 2, q), 0.5, 1e-8);
  });

  test('区间端点单调：low < mean < high', () => {
    [1, 3, 10, 50].forEach((n) => {
      const m = S.mastery(n, n);
      assert.ok(m.low < m.posteriorMean, n + ' 次的 low 应小于均值');
      assert.ok(m.posteriorMean < m.high, n + ' 次的 high 应大于均值');
    });
  });
});

/* ============================================================
 * 3.1 掌握度
 * ============================================================ */

group('3.1 掌握度 · 贝叶斯平滑', () => {
  test('零样本时掌握度 = 先验均值 0.5，且标记为数据不足', () => {
    const m = S.mastery(0, 0);
    close(m.posteriorMean, 0.5, 1e-9);
    assert.strictEqual(m.sufficient, false);
    assert.strictEqual(m.n, 0);
  });

  test('全答对时掌握度上升，且严格小于 1（任务书必测项 ①）', () => {
    let prev = 0.5;
    for (let n = 1; n <= 30; n++) {
      const m = S.mastery(n, 0);
      assert.ok(m.posteriorMean > prev, 'n=' + n + ' 时应比 n-1 更大');
      assert.ok(m.posteriorMean < 1, 'n=' + n + ' 时应严格小于 1');
      prev = m.posteriorMean;
    }
  });

  test('全答对时掌握度收敛到 1（30 次后 > 0.95）', () => {
    assert.ok(S.mastery(30, 0).posteriorMean > 0.95);
  });

  test('全答错时掌握度下降，且严格大于 0', () => {
    let prev = 0.5;
    for (let n = 1; n <= 30; n++) {
      const m = S.mastery(0, n);
      assert.ok(m.posteriorMean < prev, 'n=' + n + ' 时应比 n-1 更小');
      assert.ok(m.posteriorMean > 0, 'n=' + n + ' 时应严格大于 0');
      prev = m.posteriorMean;
    }
  });

  test('样本少时区间宽，样本多时区间窄（任务书必测项 ②）', () => {
    const widths = [1, 3, 10, 50, 200].map((n) => {
      const m = S.mastery(n, n);
      return m.high - m.low;
    });
    for (let i = 1; i < widths.length; i++) {
      assert.ok(widths[i] < widths[i - 1],
        'n=' + [1, 3, 10, 50, 200][i] + ' 的区间应比上一档更窄');
    }
    // 1 次作答时区间极宽（> 0.5），这是「数据不足」的量化依据
    assert.ok(widths[0] > 0.5, '单次作答的区间宽度应 > 0.5，实际 ' + widths[0]);
  });

  test('4 次以内标记数据不足，5 次起给结论', () => {
    assert.strictEqual(S.mastery(4, 0).sufficient, false);
    assert.strictEqual(S.mastery(5, 0).sufficient, true);
  });

  test('区间下界不会小于 0、上界不会大于 1', () => {
    [[1, 0], [0, 1], [3, 1], [1, 3]].forEach(([c, w]) => {
      const m = S.mastery(c, w);
      assert.ok(m.low >= 0 && m.low <= 1, 'low 越界：' + m.low);
      assert.ok(m.high >= 0 && m.high <= 1, 'high 越界：' + m.high);
    });
  });

  test('平滑效果：答对 1 次不等于 100%（对比朴素准确率）', () => {
    const m = S.mastery(1, 0);
    assert.ok(m.posteriorMean < 0.8, '答对 1 次应被拉回 0.67 附近');
    close(m.posteriorMean, 2 / 3, 1e-9);
  });
});

/* ============================================================
 * 3.2 遗忘曲线
 * ============================================================ */

group('3.2 遗忘曲线', () => {
  test('t=0 时留存率 1', () => {
    close(S.retention(0, 1), 1, 1e-12);
  });

  test('t 越大留存率越小（任务书必测项 ③）', () => {
    let prev = 1.0001;
    for (let t = 0; t <= 30; t += 0.5) {
      const r = S.retention(t, 1);
      assert.ok(r < prev, 't=' + t + ' 时应比 t-0.5 更小');
      assert.ok(r > 0, '留存率应始终大于 0');
      prev = r;
    }
  });

  test('稳定度 1 天时，1 天后 R = 1/e ≈ 0.368', () => {
    close(S.retention(1, 1), Math.exp(-1), 1e-12);
  });

  test('稳定度越大忘得越慢', () => {
    assert.ok(S.retention(3, 8) > S.retention(3, 1));
  });

  test('曲线在 t = S 处恰为 1/e（定义一致性）', () => {
    [1, 2, 5, 16].forEach((s) => {
      close(S.retention(s, s), Math.exp(-1), 1e-12);
    });
  });

  test('稳定度递推：答对 ×2、答错 ×0.5', () => {
    const t0 = '2026-10-01T00:00:00Z';
    const at = (d) => new Date(Date.parse(t0) + d * 86400000).toISOString();

    // 初始 1 → 答对 2 → 答对 4 → 答错 2
    const S1 = S.stabilityFromEvents([
      { correct: true, at: at(0) },
      { correct: true, at: at(1) },
      { correct: false, at: at(2) }
    ]);
    close(S1, 2, 1e-9, '1→2→4→2');
  });

  test('稳定度不会被连续答错压到 0.5 以下', () => {
    const evs = [];
    for (let i = 0; i < 20; i++) {
      evs.push({ correct: false, at: new Date(Date.parse('2026-10-01T00:00:00Z') + i * 3600000).toISOString() });
    }
    close(S.stabilityFromEvents(evs), S.CONFIG.minStability, 1e-9);
  });

  test('大量答对后稳定度指数增长（20 次 → 2^20）', () => {
    const evs = [];
    for (let i = 0; i < 20; i++) {
      evs.push({ correct: true, at: new Date(Date.parse('2026-10-01T00:00:00Z') + i * 3600000).toISOString() });
    }
    close(S.stabilityFromEvents(evs), Math.pow(2, 20), 1e-3);
  });

  test('复习优先级 = (1−R)×(1−掌握度)', () => {
    const p = S.reviewPriority(1, 1, 0.5);
    close(p, (1 - Math.exp(-1)) * 0.5, 1e-12);
  });

  test('复习优先级随掌握度升高而降低', () => {
    assert.ok(S.reviewPriority(1, 1, 0.9) < S.reviewPriority(1, 1, 0.1));
  });

  test('复习优先级随遗忘加剧而升高', () => {
    assert.ok(S.reviewPriority(5, 1, 0.5) > S.reviewPriority(0, 1, 0.5));
  });

  test('kpState 汇总：3 对 2 错 → 掌握度 4/7', () => {
    const now = '2026-10-10T00:00:00Z';
    const evs = [];
    for (let i = 0; i < 3; i++) evs.push({ correct: true, at: '2026-10-0' + (1 + i) + 'T00:00:00Z' });
    for (let i = 0; i < 2; i++) evs.push({ correct: false, at: '2026-10-0' + (6 + i) + 'T00:00:00Z' });
    const st = S.kpState(evs, now);
    close(st.mastery, 4 / 7, 1e-9);   // (1+3) / (1+3 + 1+2)
    assert.strictEqual(st.correct, 3);
    assert.strictEqual(st.wrong, 2);
    assert.strictEqual(st.n, 5);
    assert.strictEqual(st.sufficient, true);
    assert.strictEqual(st.lastAt, '2026-10-07T00:00:00Z');
    close(st.daysSinceLast, 3, 1e-9);
  });
});

/* ============================================================
 * 3.3 组卷抽样
 * ============================================================ */

group('3.3 组卷 · 加权无放回抽样', () => {
  /** 构造 n 个候选，每个带唯一知识点 */
  function makeCandidates(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({ id: 'm' + i, kpIds: ['kp' + i], weight: (i + 1) / n });
    }
    return out;
  }

  test('抽出数量正确且不重复（任务书必测项 ④）', () => {
    const picked = S.weightedSample(makeCandidates(20), 8);
    assert.strictEqual(picked.length, 8);
    const ids = new Set(picked.map((p) => p.id));
    assert.strictEqual(ids.size, 8, '不应有重复题目');
  });

  test('请求数超过候选数时，返回全部候选', () => {
    const picked = S.weightedSample(makeCandidates(5), 20);
    assert.strictEqual(picked.length, 5);
    assert.strictEqual(new Set(picked.map((p) => p.id)).size, 5);
  });

  test('请求 0 道返回空数组', () => {
    assert.strictEqual(S.weightedSample(makeCandidates(5), 0).length, 0);
  });

  test('空候选池返回空数组', () => {
    assert.strictEqual(S.weightedSample([], 5).length, 0);
  });

  test('权重高的更容易被抽中（大样本统计）', () => {
    // 两个候选，权重 0.9 vs 0.1，抽 1 道，重复 2000 次
    const cands = [
      { id: 'hot', kpIds: ['a'], weight: 0.9 },
      { id: 'cold', kpIds: ['b'], weight: 0.1 }
    ];
    let hot = 0;
    for (let i = 0; i < 2000; i++) {
      if (S.weightedSample(cands, 1)[0].id === 'hot') hot += 1;
    }
    // 理论概率 (0.9+0.05)/(1.0+0.1) ≈ 0.864
    const ratio = hot / 2000;
    assert.ok(ratio > 0.78 && ratio < 0.93, '期望约 0.86，实际 ' + ratio.toFixed(3));
  });

  test('同一知识点不超过总题数的 40%（配额生效）', () => {
    // 10 道题全都挂在同一个知识点上，另有 10 章各 1 道
    const cands = [];
    for (let i = 0; i < 10; i++) cands.push({ id: 'same' + i, kpIds: ['big'], weight: 5 });
    for (let i = 0; i < 10; i++) cands.push({ id: 'other' + i, kpIds: ['s' + i], weight: 0.01 });
    const picked = S.weightedSample(cands, 10);
    const bigCount = picked.filter((p) => p.kpIds.indexOf('big') >= 0).length;
    assert.ok(bigCount <= 4, '同一知识点最多 4 道，实际 ' + bigCount);
  });

  test('配额凑不满时放宽而不是返回不足（错题只集中在 2 章的真实场景）', () => {
    const cands = [];
    for (let i = 0; i < 6; i++) cands.push({ id: 'a' + i, kpIds: ['kpA'], weight: 1 });
    for (let i = 0; i < 6; i++) cands.push({ id: 'b' + i, kpIds: ['kpB'], weight: 1 });
    const picked = S.weightedSample(cands, 10);
    assert.strictEqual(picked.length, 10, '应放宽配额凑满 10 道');
    assert.strictEqual(new Set(picked.map((p) => p.id)).size, 10);
  });

  test('多知识点题目：任一知识点超配额即排除', () => {
    const cands = [];
    for (let i = 0; i < 5; i++) cands.push({ id: 'big' + i, kpIds: ['X'], weight: 1 });
    // 这道题同时挂 X 和 Y，X 满额时应被排除
    cands.push({ id: 'both', kpIds: ['X', 'Y'], weight: 100 });
    for (let i = 0; i < 20; i++) cands.push({ id: 'y' + i, kpIds: ['Y' + i], weight: 1 });

    for (let trial = 0; trial < 200; trial++) {
      const picked = S.weightedSample(cands, 10);
      const xCount = picked.filter((p) => p.kpIds.indexOf('X') >= 0).length;
      assert.ok(xCount <= 4, 'X 知识点超配额：' + xCount);
    }
  });

  test('权重为 0 的候选仍有非零机会（ε 的作用）', () => {
    const cands = [
      { id: 'zero', kpIds: ['z'], weight: 0 },
      { id: 'also', kpIds: ['w'], weight: 0 }
    ];
    // 两个权重都是 0，靠 ε 均分，各占 50%
    let zero = 0;
    for (let i = 0; i < 1000; i++) {
      if (S.weightedSample(cands, 1)[0].id === 'zero') zero += 1;
    }
    assert.ok(zero > 420 && zero < 580, '应各约一半，实际 zero=' + zero);
  });

  test('抽样不修改输入的候选数组', () => {
    const cands = makeCandidates(10);
    const snapshot = JSON.parse(JSON.stringify(cands));
    S.weightedSample(cands, 5);
    assert.deepStrictEqual(cands, snapshot);
  });
});

/* ============================================================
 * 聚合与胶水函数
 * ============================================================ */

group('聚合 · buildCandidates / computeStates', () => {
  test('多知识点题目的权重 = 各知识点优先级均值', () => {
    const states = { a: { priority: 0.2 }, b: { priority: 0.6 } };
    const c = S.buildCandidates([{ id: 'm1', kpIds: ['a', 'b'] }], states)[0];
    close(c.weight, 0.4, 1e-12);
  });

  test('computeStates：同一事件计入其所有知识点', () => {
    const mistakes = [
      { id: 'm1', kpIds: ['a', 'b'] },
      { id: 'm2', kpIds: ['b'] }
    ];
    const answers = [
      { mistakeId: 'm1', kpIds: ['a', 'b'], correct: false, at: '2026-10-01T00:00:00Z' },
      { mistakeId: 'm2', kpIds: ['b'], correct: true, at: '2026-10-02T00:00:00Z' }
    ];
    const st = S.computeStates(mistakes, answers, '2026-10-03T00:00:00Z');
    assert.strictEqual(st.a.n, 1);
    assert.strictEqual(st.b.n, 2);
    assert.strictEqual(st.b.correct, 1);
    assert.strictEqual(st.b.wrong, 1);
  });

  test('有错题但无作答事件的知识点，状态为「数据不足」而不是缺失', () => {
    const st = S.computeStates([{ id: 'm1', kpIds: ['x'] }], [], '2026-10-03T00:00:00Z');
    assert.ok(st.x, '应存在该知识点状态');
    assert.strictEqual(st.x.n, 0);
    assert.strictEqual(st.x.sufficient, false);
  });
});

group('复习 · buildReviewQueue', () => {
  const DAY = 86400000;
  const at = (base, days) => new Date(Date.parse(base) + days * DAY).toISOString();
  const BASE = '2026-10-01T00:00:00Z';

  test('刚作答过的题不进入复习队列（留存率还高）', () => {
    const m = { id: 'm1', kpIds: ['k'] };
    const a = [{ mistakeId: 'm1', kpIds: ['k'], correct: true, at: BASE }];
    // 同一时刻，R = 1，高于阈值 0.9
    const q = S.buildReviewQueue([m], a, BASE);
    assert.strictEqual(q.length, 0);
  });

  test('放久了（R 低于阈值）会进入复习队列', () => {
    const m = { id: 'm1', kpIds: ['k'] };
    const a = [{ mistakeId: 'm1', kpIds: ['k'], correct: false, at: BASE }];
    const q = S.buildReviewQueue([m], a, at(BASE, 3));
    assert.strictEqual(q.length, 1);
    assert.strictEqual(q[0].mistake.id, 'm1');
    assert.ok(q[0].retention < 0.9);
  });

  test('优先级高的排在前面（忘得更久 + 掌握度更低）', () => {
    const mk = (id) => ({ id, kpIds: [id] });
    const answers = [
      // A 很早答错一次，之后答对多次（掌握度较高）
      { mistakeId: 'A', kpIds: ['A'], correct: false, at: BASE },
      { mistakeId: 'A', kpIds: ['A'], correct: true, at: at(BASE, 0.1) },
      { mistakeId: 'A', kpIds: ['A'], correct: true, at: at(BASE, 0.2) },
      { mistakeId: 'A', kpIds: ['A'], correct: true, at: at(BASE, 0.3) },
      { mistakeId: 'A', kpIds: ['A'], correct: true, at: at(BASE, 0.4) },
      // B 更早且只答错过
      { mistakeId: 'B', kpIds: ['B'], correct: false, at: BASE }
    ];
    const q = S.buildReviewQueue([mk('A'), mk('B')], answers, at(BASE, 40));
    assert.ok(q.length >= 1);
    // B 掌握度低（0.25 左右）、遗忘充分，应排第一
    assert.strictEqual(q[0].mistake.id, 'B', '掌握度低的应先复习');
  });

  test('limit 生效', () => {
    const ms = [];
    const as = [];
    for (let i = 0; i < 10; i++) {
      ms.push({ id: 'm' + i, kpIds: ['k' + i] });
      as.push({ mistakeId: 'm' + i, kpIds: ['k' + i], correct: false, at: BASE });
    }
    const q = S.buildReviewQueue(ms, as, at(BASE, 30), { limit: 3 });
    assert.strictEqual(q.length, 3);
  });

  test('多知识点题目的优先级取均值', () => {
    const m = { id: 'm1', kpIds: ['a', 'b'] };
    const answers = [
      { mistakeId: 'm1', kpIds: ['a', 'b'], correct: false, at: BASE }
    ];
    const q = S.buildReviewQueue([m], answers, at(BASE, 5));
    const st = S.computeStates([m], answers, at(BASE, 5));
    const expect = (st.a.priority + st.b.priority) / 2;
    close(q[0].priority, expect, 1e-12);
  });

  test('没有任何作答事件的错题不进队列（无从判断到期）', () => {
    const q = S.buildReviewQueue([{ id: 'm1', kpIds: ['k'] }], [], BASE);
    assert.strictEqual(q.length, 0);
  });
});

/* ---------------- 汇总 ---------------- */

console.log('\n' + '-'.repeat(52));
console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
if (failed > 0) {
  console.log('\n失败详情：');
  failures.forEach((f) => {
    console.log('  · ' + f.name);
    console.log('    ' + f.err.message);
  });
  process.exit(1);
}
console.log('全部通过 ✓');
