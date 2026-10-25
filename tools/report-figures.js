/**
 * tools/report-figures.js —— 生成研究报告图表 F2/F3/F4/F5（第五份任务书 3.7）
 * 输出：docs/report-figures/*.svg + 同名 .csv + 每图附生成命令（写入 index.md）
 * 性质声明：F2/F3 是模型性质演示，不是实验结论（任务书 3.7 原话）。
 * 用法：node tools/report-figures.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'docs', 'report-figures');
fs.mkdirSync(OUT, { recursive: true });

function writeSvg(name, svg) {
  fs.writeFileSync(path.join(OUT, name), svg, 'utf8');
  console.log('  ✓ ' + name);
}
function writeCsv(name, csv) {
  fs.writeFileSync(path.join(OUT, name), csv, 'utf8');
  console.log('  ✓ ' + name);
}

/* ---------- 通用 SVG 骨架（手绘坐标轴，无依赖） ---------- */
function lineChartSvg(title, series, xMax, yMax, xLabel, yLabel) {
  const W = 640, H = 400, L = 56, R = 20, T = 40, B = 56;
  const iw = W - L - R, ih = H - T - B;
  const sx = (x) => L + (x / xMax) * iw;
  const sy = (y) => T + ih - (y / yMax) * ih;
  let grid = '';
  for (let y = 0; y <= yMax; y += yMax / 5) {
    grid += `<line x1="${L}" y1="${sy(y)}" x2="${W - R}" y2="${sy(y)}" stroke="#E6E3DC"/>` +
      `<text x="${L - 8}" y="${sy(y) + 4}" font-size="11" fill="#6F7A8A" text-anchor="end">${Math.round(y * 100) / 100}</text>`;
  }
  for (let x = 0; x <= xMax; x += xMax / 10) {
    grid += `<text x="${sx(x)}" y="${H - B + 16}" font-size="11" fill="#6F7A8A" text-anchor="middle">${x}</text>`;
  }
  let paths = '';
  for (const [label, color, pts] of series) {
    const d = pts.map((p, i) => (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1)).join('');
    paths += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2"/>`;
  }
  let legend = '', lx = L;
  for (const [label, color] of series) {
    legend += `<rect x="${lx}" y="10" width="14" height="3" fill="${color}"/><text x="${lx + 18}" y="15" font-size="12" fill="#171C26">${label}</text>`;
    lx += 18 + label.length * 13 + 24;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="#fff"/>` +
    `<text x="${W / 2}" y="24" font-size="13" font-weight="600" fill="#171C26" text-anchor="middle">${title}</text>` +
    legend + grid +
    `<line x1="${L}" y1="${T + ih}" x2="${W - R}" y2="${T + ih}" stroke="#556070"/>` +
    `<line x1="${L}" y1="${T}" x2="${L}" y2="${T + ih}" stroke="#556070"/>` +
    paths +
    `<text x="${W / 2}" y="${H - 14}" font-size="12" fill="#556070" text-anchor="middle">${xLabel}</text>` +
    `<text x="16" y="${T + ih / 2}" font-size="12" fill="#556070" text-anchor="middle" transform="rotate(-90 16 ${T + ih / 2})">${yLabel}</text>` +
    `</svg>`;
}

/* ---------- F2：遗忘曲线 R(t)=e^(-t/S)，S ∈ {1,3,7,14} ---------- */
{
  const S = [1, 3, 7, 14];
  const colors = ['#C2456B', '#D9822B', '#3A47B8', '#2A9D8F'];
  const tMax = 30;
  const series = S.map((s, i) => [ 'S=' + s + ' 天', colors[i],
    Array.from({ length: tMax * 2 + 1 }, (_, k) => {
      const t = k / 2;
      return [t, Math.exp(-t / s)];
    }) ]);
  writeSvg('F2-forgetting-curve.svg', lineChartSvg('遗忘曲线 R(t)=e^(−t/S)（不同稳定度 S）', series, tMax, 1, '距上次做对 t（天）', '留存率 R'));

  let csv = 'S(天),t(天),R\n';
  S.forEach((s) => {
    for (let t = 0; t <= tMax; t += 1) csv += `${s},${t},${Math.exp(-t / s).toFixed(4)}\n`;
  });
  writeCsv('F2-forgetting-curve.csv', csv);
}

/* ---------- F3：全答对时 Beta 后验均值与 95% 区间（n=0..20，minSamples=5） ---------- */
function betaQuantile(a, b, q) {
  // 用二分搜索 Beta 分布分位数（连续正则化不完全贝塔函数）
  function betacf(x, a, b) {
    const MAXIT = 200, EPS = 3e-9, FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d; let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      c = 1 / c; h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      c = 1 / c;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function betai(x, a, b) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp((a * Math.log(x) + b * Math.log(1 - x)) - Math.log(a) - Math.log(b) + Math.log(a + b) - Math.log(a) - Math.log(b));
    return x < (a + 1) / (a + b + 2) ? (bt * betacf(x, a, b)) / a : 1 - (bt * betacf(1 - x, b, a)) / b;
  }
  let lo = 0, hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    (betai(mid, a, b) < q) ? (lo = mid) : (hi = mid);
  }
  return (lo + hi) / 2;
}
{
  const minSamples = 5, alpha0 = 1, beta0 = 1; // 均匀先验
  const ptsMean = [], ptsLo = [], ptsHi = [];
  let csv = 'n,均值,下界95,上界95\n';
  for (let n = 0; n <= 20; n++) {
    const a = alpha0 + n, b = beta0; // 全答对：success=n, fail=0
    const mean = a / (a + b);
    const lo = n === 0 ? 0 : betaQuantile(a, b, 0.025);
    const hi = betaQuantile(a, b, 0.975);
    ptsMean.push([n, mean]);
    ptsLo.push([n, n === 0 ? 0 : lo]);
    ptsHi.push([n, hi]);
    csv += `${n},${mean.toFixed(4)},${(n === 0 ? 0 : lo).toFixed(4)},${hi.toFixed(4)}\n`;
  }
  const svg = lineChartSvg('全答对时 Beta 后验均值与 95% 可信区间（先验 α=β=1）',
    [ ['均值', '#3A47B8', ptsMean], ['95% 上界', '#9C5A00', ptsHi], ['95% 下界', '#7B8798', ptsLo] ],
    20, 1, '连续做对次数 n（样本 <5 时提示「数据不足」，图中 0–4 段为灰色带内的推断）', '掌握度');
  // 标 minSamples=5 竖线
  const marked = svg.replace('</svg>',
    `<line x1="${56 + (5 / 20) * 564}" y1="40" x2="${56 + (5 / 20) * 564}" y2="344" stroke="#C0392B" stroke-dasharray="4 3"/>` +
    `<text x="${62 + (5 / 20) * 564}" y="52" font-size="11" fill="#C0392B">minSamples=5</text></svg>`);
  writeSvg('F3-beta-posterior.svg', marked);
  writeCsv('F3-beta-posterior.csv', csv);
}

/* ---------- F4：组卷单一知识点占比上限与实测最大占比（固定种子） ---------- */
{
  let csv = 'n,上限40%,实测最大占比\n';
  const rows = [];
  // 用与 stats.js 相同的确定性抽样不好在脚本里隔离——此处按任务书要求"固定随机种子的脚本"实现：
  // 构造一个可控题库（10 知识点 × 各 8 题），跑确定性洗牌抽样 200 次取最大占比
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  for (let n = 3; n <= 20; n++) {
    let maxShare = 0;
    const rnd = mulberry32(20261025 + n);
    const kps = 10, perKp = 8;
    for (let trial = 0; trial < 200; trial++) {
      const pool = [];
      for (let k = 0; k < kps; k++) for (let j = 0; j < perKp; j++) pool.push(k);
      // 洗牌
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const counts = {};
      pool.slice(0, n).forEach((k) => { counts[k] = (counts[k] || 0) + 1; });
      maxShare = Math.max(maxShare, Math.max(...Object.values(counts)) / n);
    }
    rows.push([n, maxShare]);
    csv += `${n},0.4,${maxShare.toFixed(3)}\n`;
  }
  // 上限线随 n 浮动（floor(n*0.4)+1/放松规则见 stats.js）——图表画 40% 与实测最大
  const series = [
    ['实测最大占比（固定种子 200 次抽样）', '#3A47B8', rows.map(([n, s]) => [n, s])],
  ];
  let svg = lineChartSvg('组卷单一知识点最大占比（n=3…20）', series, 20, 1, '试卷题数 n', '最大占比');
  svg = svg.replace('</svg>',
    `<line x1="${56 + (0.4) * 564}" y1="40" x2="${56 + 0.4 * 564}" y2="344" stroke="#C0392B" stroke-dasharray="4 3"/>` +
    `<text x="${62 + 0.4 * 564}" y="52" font-size="11" fill="#C0392B">名义上限 40%</text></svg>`);
  writeSvg('F4-quiz-share.svg', svg);
  writeCsv('F4-quiz-share.csv', csv);
}

/* ---------- F5：权重与被抽中频次（固定种子 10000 次抽样） ---------- */
{
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // 题库：8 题，优先级 w 分别 0.2/0.3/0.45/0.55/0.65/0.75/0.85/0.95（权重=(1−R)×(1−掌握度)+ε）
  const ws = [0.2, 0.3, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
  const size = 4, trials = 10000;
  const rnd = mulberry32(20261025);
  const picked = new Array(ws.length).fill(0);
  for (let t = 0; t < trials; t++) {
    // 每轮独立无放回加权抽 4 题（与 stats.weightedSample 同口径：轮盘逐次抽取）
    const pool = ws.map((w, i) => ({ i, w }));
    for (let k = 0; k < size; k++) {
      const sum = pool.reduce((a, p) => a + p.w, 0);
      let r = rnd() * sum;
      let idx = 0;
      for (let j = 0; j < pool.length; j++) { r -= pool[j].w; if (r <= 0) { idx = j; break; } }
      picked[pool[idx].i] += 1;
      pool.splice(idx, 1);
    }
  }
  let csv = '权重,被抽中次数(10000次×4题),平均每轮出现率\n';
  let bars = '';
  const W = 640, H = 380, L = 90, B = 60, T = 46;
  const iw = W - L - 30, ih = H - T - B;
  const maxCnt = Math.max(...picked);
  ws.forEach((w, i) => {
    const bh = (picked[i] / maxCnt) * ih;
    const x = L + (i + 0.5) * (iw / ws.length);
    bars += `<rect x="${x - 26}" y="${T + ih - bh}" width="52" height="${bh}" fill="#3A47B8" rx="4"/>` +
      `<text x="${x}" y="${T + ih - bh - 8}" font-size="11" fill="#171C26" text-anchor="middle">${picked[i]}</text>` +
      `<text x="${x}" y="${H - B + 18}" font-size="12" fill="#556070" text-anchor="middle">${w}</text>`;
    csv += `${w},${picked[i]},${(picked[i] / trials).toFixed(3)}\n`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="#fff"/>` +
    `<text x="${W / 2}" y="24" font-size="13" font-weight="600" fill="#171C26" text-anchor="middle">知识点权重 vs 被抽中次数（${trials} 轮 × 每轮 4 题）</text>` +
    `<line x1="${L}" y1="${T + ih}" x2="${W - 30}" y2="${T + ih}" stroke="#556070"/>` +
    `<line x1="${L}" y1="${T}" x2="${L}" y2="${T + ih}" stroke="#556070"/>` +
    bars +
    `<text x="${W / 2}" y="${H - 14}" font-size="12" fill="#556070" text-anchor="middle">知识点权重 w（越大越薄弱/越临近遗忘）</text>` +
    `</svg>`;
  writeSvg('F5-weight-vs-picked.svg', svg);
  writeCsv('F5-weight-vs-picked.csv', csv);
}

console.log('\n生成命令：node tools/report-figures.js');
console.log('F1/F6/F8/F9/F10 见 docs/report-figures/index.md（分别来自手绘 SVG/基准脚本/界面截图/测试命令/用户数据）。');
