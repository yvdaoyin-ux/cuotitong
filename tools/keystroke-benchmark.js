/**
 * tools/keystroke-benchmark.js —— 按键次数基准（阶段 4.2，任务书 4.2）
 *
 * 用任务书指定的 5 道题，分别计算：
 *   A. 手打 LaTeX：整条题干**每个字符算 1 次按键**（中文也算 1），
 *      其中 `\ { } ^ _ $` 每个再 +1（中文输入法下需要切换到符号键盘）。
 *   B. 工具栏：**用 symbols.js 的 insertAt 真实模拟**每一步操作
 *      （打字 / 点符号 / 跳占位符 / 光标移到文末），不是手工估算。
 *
 * 诚实性保证：每道题的模拟结果与任务书原文**逐字比对**，不一致直接报错退出——
 * 也就是说，表格里的点击数是「真的能拼出这道题」的点击数。
 *
 * 口径（写进 docs/录入效率说明.md，报告会引用）：
 *   - 手打按键数 = 题干字符数 + 题干中 \{}^_$ 的出现次数
 *   - 工具栏侧 = 点击数（sym/jump）+ 必须手打的字符数（含同样的符号键盘 +1 规则）
 *   - 光标移动（end）单列一列：手机上对应「点一下把光标挪到文末」的动作，不计入按键
 *   - 局限：这是**按键/点击次数**，不是用户耗时；中文按 1 键/字是简化口径
 *
 * 运行：cd 03-错题通 && node tools/keystroke-benchmark.js
 */
'use strict';

const path = require('node:path');

global.QT = {};
require(path.join(__dirname, '..', 'js', 'util.js'));
require(path.join(__dirname, '..', 'js', 'mathtext.js'));
require(path.join(__dirname, '..', 'js', 'symbols.js'));

const QT = global.QT;
const S = QT.symbols;

/* ---------------- 任务书 4.2 指定的 5 道题 ---------------- */

const PROBLEMS = [
  '求极限 $\\lim_{x\\to 0}\\frac{\\sin x-x}{x^3}$',
  '计算 $\\int_0^1 x^2e^x\\,dx$',
  '设 $A=\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}$,求 $A^{-1}$ 与 $\\det A$',
  '设 $X\\sim N(\\mu,\\sigma^2)$,求 $P(X>\\mu+\\sigma)$',
  '证明 $\\sum_{n=1}^{\\infty}\\frac{1}{n^2}$ 收敛'
];

/**
 * 每道题的「工具栏操作序列」（recipe）。
 * step: { t:'type', s:'文本' } 打字（在当前选区/光标处输入）
 *       { t:'sym', tip:'按钮名' } 点符号按钮
 *       { t:'jump' } 点「下一个占位」
 *       { t:'end' }  把光标移到全文末尾（手机上=点一下文末）
 *       { t:'right', n:1 } 光标右移 n 字符（跳过闭括号；手机上=点一下屏幕挪光标）
 * 序列由人工编排，但**编排错了模拟结果就对不上原文，脚本会当场报错**，
 * 所以表里的数字都是可复现的真实模拟值。
 */
const RECIPES = [
  // 1. 求极限 $\lim_{x\to 0}\frac{\sin x-x}{x^3}$
  [
    { t: 'type', s: '求极限 ' },
    { t: 'sym', tip: '极限' },            // 自动包 $：$\lim_{x\to ▮}$
    { t: 'type', s: '0' },                 // ▮ 填完即消失；光标停在 } 之前
    { t: 'right', n: 1 },                  // 🔴 移出下标闭括号——真实成本，模拟如实计入
    { t: 'sym', tip: '分数' },             // 此时光标在公式内：\frac{▮}{▮}
    { t: 'type', s: '\\sin x-x' },
    { t: 'jump' },                         // 跳到分母 ▮
    { t: 'type', s: 'x^3' }
  ],
  // 2. 计算 $\int_0^1 x^2e^x\,dx$
  //    按钮产出 \int_{0}^{1}（带花括号），与原文 \int_0^1 写法不同但渲染等价，
  //    校验走 KaTeX 渲染比对（见下），表格里标「渲染等价」
  [
    { t: 'type', s: '计算 ' },
    { t: 'sym', tip: '定积分' },           // $\int_{▮}^{▮}$
    { t: 'type', s: '0' },
    { t: 'jump' },
    { t: 'type', s: '1' },
    { t: 'right', n: 1 },                  // 🔴 移出上标闭括号
    { t: 'type', s: 'x^2e^x\\,dx' }
  ],
  // 3. 设 $A=\begin{pmatrix}1&2\\3&4\end{pmatrix}$,求 $A^{-1}$ 与 $\det A$
  [
    { t: 'type', s: '设 ' },
    { t: 'sym', tip: '包成行内公式 $…$' },  // $▮$
    { t: 'type', s: 'A=' },
    { t: 'sym', tip: '2×2 矩阵（圆括号）' }, // 已在公式内，不包 $
    { t: 'type', s: '1' },
    { t: 'jump' }, { t: 'type', s: '2' },
    { t: 'jump' }, { t: 'type', s: '3' },
    { t: 'jump' }, { t: 'type', s: '4' },
    { t: 'end' },
    { t: 'type', s: ',求 ' },
    { t: 'sym', tip: '包成行内公式 $…$' },
    { t: 'type', s: 'A' },
    { t: 'sym', tip: '上标' },              // ^{▮}
    { t: 'type', s: '-1' },
    { t: 'end' },
    { t: 'type', s: ' 与 ' },
    { t: 'sym', tip: '包成行内公式 $…$' },
    { t: 'sym', tip: '行列式 det' },
    { t: 'type', s: ' A' }
  ],
  // 4. 设 $X\sim N(\mu,\sigma^2)$,求 $P(X>\mu+\sigma)$
  [
    { t: 'type', s: '设 ' },
    { t: 'sym', tip: '包成行内公式 $…$' },
    { t: 'type', s: 'X' },
    { t: 'sym', tip: '服从于 ~' },
    { t: 'type', s: ' ' },                 // 🔴 字母命令后手补空格，防止 \simN 粘连
    { t: 'sym', tip: '正态分布 N(μ,σ²)' },
    { t: 'end' },
    { t: 'type', s: ',求 ' },
    { t: 'sym', tip: '包成行内公式 $…$' },
    { t: 'sym', tip: '概率 P(·)' },
    { t: 'type', s: 'X>' },
    { t: 'sym', tip: 'mu μ' },
    { t: 'type', s: '+' },
    { t: 'sym', tip: 'sigma σ' }
  ],
  // 5. 证明 $\sum_{n=1}^{\infty}\frac{1}{n^2}$ 收敛
  [
    { t: 'type', s: '证明 ' },
    { t: 'sym', tip: '级数求和' },          // $\sum_{n=1}^{\infty}$
    { t: 'sym', tip: '分数' },
    { t: 'type', s: '1' },
    { t: 'jump' },
    { t: 'type', s: 'n^2' },
    { t: 'end' },
    { t: 'type', s: ' 收敛' }
  ]
];

/* ---------------- 模拟器 ---------------- */

const PENALTY = /[\\{}^_$]/g; // 中文输入法需切换符号键盘的字符

function penaltyCount(s) {
  const m = String(s || '').match(PENALTY);
  return m ? m.length : 0;
}

/** 在选区处打字（替换选区），光标落在打完之后。 */
function typeAt(st, s) {
  st.text = st.text.slice(0, st.selStart) + s + st.text.slice(st.selEnd);
  st.selStart = st.selStart + s.length;
  st.selEnd = st.selStart;
  return st;
}

/**
 * 渲染等价判定：splitMath 切段 → 文本段逐字相同 + 公式段 KaTeX 渲染相同。
 * KaTeX 本身不认 $ 分隔符，必须切段（也不要把中文丢进 math mode）。
 */
function renderEquivalent(a, b) {
  const K = require(path.join(__dirname, '..', 'lib', 'katex.min.js'));
  const sa = QT.mathtext.splitMath(a);
  const sb = QT.mathtext.splitMath(b);
  if (sa.length !== sb.length) return false;
  for (let i = 0; i < sa.length; i++) {
    if (sa[i].type !== sb[i].type) return false;
    if (sa[i].type === 'text') {
      if (sa[i].value !== sb[i].value) return false;
    } else {
      let ha, hb;
      try {
        ha = K.renderToString(sa[i].value, { throwOnError: true });
        hb = K.renderToString(sb[i].value, { throwOnError: true });
      } catch (e) {
        return false;
      }
      if (ha !== hb) return false;
    }
  }
  return true;
}

/** 模拟一道题，返回 { text, taps, typed, penalty, cursorMoves }。 */
function simulate(recipe) {
  const st = { text: '', selStart: 0, selEnd: 0 };
  const out = { taps: 0, typed: 0, penalty: 0, cursorMoves: 0 };
  recipe.forEach((step) => {
    if (step.t === 'type') {
      typeAt(st, step.s);
      out.typed += step.s.length;
      out.penalty += penaltyCount(step.s);
    } else if (step.t === 'sym') {
      const item = S.SYMBOLS.filter((x) => x.tip === step.tip)[0];
      if (!item) throw new Error('符号表里找不到按钮: ' + step.tip);
      const inside = QT.mathtext.isInsideMath(st.text, st.selStart);
      const r = S.insertAt(st.text, st.selStart, st.selEnd, item.insert, inside);
      st.text = r.text; st.selStart = r.selStart; st.selEnd = r.selEnd;
      out.taps += 1;
    } else if (step.t === 'jump') {
      const ph = S.nextPlaceholder(st.text, st.selEnd);
      if (!ph) throw new Error('没有占位符可跳');
      st.selStart = ph.start; st.selEnd = ph.end;
      out.taps += 1;
    } else if (step.t === 'end') {
      st.selStart = st.selEnd = st.text.length;
      out.cursorMoves += 1;
    } else if (step.t === 'right') {
      st.selStart = st.selEnd = Math.min(st.text.length, st.selEnd + (Number(step.n) || 1));
      out.cursorMoves += (Number(step.n) || 1);
    } else {
      throw new Error('未知 step: ' + JSON.stringify(step));
    }
  });
  out.text = st.text;
  return out;
}

/* ---------------- 主流程 ---------------- */

function fmtRow(cols, widths) {
  return cols.map((c, i) => String(c).padEnd(widths[i], ' ')).join(' | ');
}

function main() {
  const widths = [4, 10, 8, 8, 12, 10, 10, 4];
  const head = ['题号', '手打按键', '点击数', '须手打', '其中切键盘', '光标移动', '串校验', '供图'];
  const lines = [];
  lines.push(fmtRow(head, widths));
  lines.push(widths.map((w) => '-'.repeat(w)).join('-+-'));

  let sumHand = 0, sumTaps = 0, sumTyped = 0, sumPenalty = 0, sumMove = 0;
  const detail = [];

  PROBLEMS.forEach((target, i) => {
    const r = simulate(RECIPES[i]);
    // 🔴 校验：优先逐字一致；写法不同（如 \int_{0}^{1} vs \int_0^1）时
    //    用 splitMath 切段后逐段比对——文本段必须逐字相同，
    //    公式段用 KaTeX 渲染比对（渲染等价也算通过，表格标「渲染等价」）
    let verdict;
    if (r.text === target) {
      verdict = '✓ 逐字一致';
    } else if (renderEquivalent(target, r.text)) {
      verdict = '≈ 渲染等价';
    } else {
      console.error('题 ' + (i + 1) + ' 模拟结果与原文既不逐字一致、渲染也不等价：');
      console.error('  期望: ' + JSON.stringify(target));
      console.error('  实际: ' + JSON.stringify(r.text));
      process.exit(1);
    }
    const hand = target.length + penaltyCount(target);
    sumHand += hand; sumTaps += r.taps; sumTyped += r.typed; sumPenalty += r.penalty; sumMove += r.cursorMoves;
    lines.push(fmtRow(
      [i + 1, hand, r.taps, r.typed, r.penalty, r.cursorMoves, verdict, ''],
      widths
    ));
    detail.push({ no: i + 1, target, taps: r.taps, typed: r.typed, penalty: r.penalty, moves: r.cursorMoves });
  });

  lines.push(widths.map((w) => '-'.repeat(w)).join('-+-'));
  lines.push(fmtRow(
    ['合计', sumHand, sumTaps, sumTyped, sumPenalty, sumMove, '', ''],
    widths
  ));

  console.log('按键次数基准（tools/keystroke-benchmark.js 实际输出）');
  console.log('口径：手打=整题每字符1键 + \\{}^_$ 每处再+1（切符号键盘）；工具栏=点击数+必须手打的字符；光标移动单列');
  console.log('');
  console.log(lines.join('\n'));
  console.log('');
  console.log('结论文案（报告可直接引用）：');
  console.log('  5 道题合计：手打 LaTeX 需 ' + sumHand + ' 次按键；' +
    '用工具栏只需 ' + sumTaps + ' 次点击 + ' + sumTyped + ' 次普通字符输入' +
    '（其中 ' + sumPenalty + ' 次需切符号键盘），另加 ' + sumMove + ' 次光标移动。');
  console.log('  平均每题：手打 ' + Math.round(sumHand / 5 * 10) / 10 + ' 键 vs 工具栏 ' +
    Math.round((sumTaps + sumTyped) / 5 * 10) / 10 + ' 次操作。');
}

main();
