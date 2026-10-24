/**
 * tests/render.test.js —— 公式渲染与转义顺序的单元测试
 *
 * 运行：cd 03-错题通 && node tests/render.test.js
 *
 * 背景（这是踩过的真实 bug）：
 * 早期实现是「先 esc() 全文字，再交给 KaTeX」。结果 `$x>0$` 里的 `>` 被转成 `&gt;`，
 * KaTeX 不认识这个 HTML 实体，整个公式退化成源码，页面上直接显示
 * `y=x^{x}\ (x&gt;0)`。含 < 和 > 的不等式公式在数学里极常见，所以必须锁死。
 */
'use strict';

const assert = require('node:assert');
const path = require('node:path');

global.QT = {};
require(path.join(__dirname, '..', 'js', 'util.js'));
// util.renderRichText 现已委托给 mathtext.renderRich，测试里必须加载它，
// 否则会走「只转义不渲染」的兜底分支
require(path.join(__dirname, '..', 'js', 'mathtext.js'));

// 加载真实的 KaTeX（与浏览器里用的是同一份文件），确保测的是真行为
const katex = require(path.join(__dirname, '..', 'lib', 'katex.min.js'));
globalThis.katex = katex;

const util = globalThis.QT.util;

/** 去掉 KaTeX 的 <annotation>（它故意保留原始 LaTeX 供复制/无障碍用），
 *  否则「有没有残留源码」这类断言会被它误伤。 */
function stripAnnotation(html) {
  return html.replace(/<annotation[^>]*>[\s\S]*?<\/annotation>/g, '');
}

/** 是否真的被 KaTeX 渲染了（而不是退化成源码）。 */
function isTypeset(html) {
  return html.indexOf('class="katex') >= 0;
}

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

/* ---------------- 核心：不等式不应退化 ---------------- */

group('🔴 回归 · 含 < > 的公式必须正常渲染', () => {
  test('$x>0$ 被渲染成 KaTeX，而不是退化为源码', () => {
    const html = util.renderRichText('$x>0$');
    assert.ok(isTypeset(html), '应包含 class="katex"，实际：' + html.slice(0, 120));
    // 去掉 annotation 后不应残留 LaTeX 源码（$x>0$ 本身）
    const bare = stripAnnotation(html);
    assert.ok(bare.indexOf('x&gt;0') < 0, '不应把 &gt; 当公式内容交给 KaTeX');
  });

  test('$a<b$ 的小于号同样正确', () => {
    const html = util.renderRichText('$a<b$');
    assert.ok(isTypeset(html), '实际：' + html.slice(0, 120));
    assert.ok(stripAnnotation(html).indexOf('a&lt;b') < 0);
  });

  test('题干里的 $y=x^{x}\\ (x>0)$ 完整渲染（真实踩坑样本）', () => {
    const html = util.renderRichText('求 $y=x^{x}\\ (x>0)$ 的导数。');
    assert.ok(isTypeset(html), '应渲染成公式');
    // 关键：公式外的文字保留，且公式没退化成源码残留在可见文本里
    assert.ok(html.indexOf('的导数') >= 0, '公式外的文字应保留');
    const visible = stripAnnotation(html);
    assert.ok(visible.indexOf('x&gt;0') < 0, '不应出现 HTML 实体形式的公式内容');
  });

  test('$p \\le 1$ 与 $-1<x<1$ 都正常', () => {
    ['$p \\le 1$', '$-1<x<1$', '$A \\subset B$'].forEach((s) => {
      assert.ok(isTypeset(util.renderRichText(s)), s + ' 应渲染');
    });
  });

  test('$$ 块级公式里的不等号也正常', () => {
    const html = util.renderRichText('$$\\frac{a}{b} > 0$$');
    assert.ok(isTypeset(html));
    assert.ok(html.indexOf('katex-display') >= 0, '块级公式应有 katex-display');
  });
});

/* ---------------- 安全：普通文本必须转义 ---------------- */

group('🔴 安全 · 非公式部分必须转义', () => {
  test('HTML 标签被转义，不会执行', () => {
    const html = util.renderRichText('<script>alert(1)</script>');
    assert.ok(html.indexOf('<script>') < 0, '不应出现未转义的 script 标签');
    assert.ok(html.indexOf('&lt;script&gt;') >= 0, '应转义');
  });

  test('引号被转义', () => {
    const html = util.renderRichText('他说"答对了"');
    assert.ok(html.indexOf('"') < 0 || html.indexOf('&quot;') >= 0);
  });

  test('公式外的 < 也被安全转义（同时不影响公式内的）', () => {
    const html = util.renderRichText('注意 <b>这里</b> 有 $x>1$');
    assert.ok(html.indexOf('<b>') < 0, '公式外的标签必须转义');
    assert.ok(html.indexOf('katex') >= 0, '公式仍要渲染');
  });

  test('ampersand 被转义', () => {
    const html = util.renderRichText('A & B');
    assert.ok(html.indexOf('&amp;') >= 0);
  });
});

/* ---------------- 边界 ---------------- */

group('边界 · 空值与不完整公式', () => {
  test('null / undefined / 空串不抛异常', () => {
    [null, undefined, ''].forEach((v) => {
      assert.doesNotThrow(() => util.renderRichText(v));
    });
  });

  test('只有一个 $ 时不崩，也不吃掉后面的文字', () => {
    const html = util.renderRichText('价格是 $100 元');
    assert.ok(html.indexOf('100') >= 0);
  });

  test('美元符号成对出现才当作公式', () => {
    const html = util.renderRichText('两个 $x$ 一个 $y$');
    assert.ok(html.indexOf('katex') >= 0);
  });

  test('换行转成 <br>', () => {
    const html = util.renderRichText('第一行\n第二行');
    assert.ok(html.indexOf('<br>') >= 0);
  });

  test('公式里的反斜杠命令不被 HTML 转义破坏', () => {
    const html = util.renderRichText('$\\frac{1}{2}$');
    assert.ok(html.indexOf('katex') >= 0);
  });

  test('非法 LaTeX 不抛异常（回退为源码）', () => {
    assert.doesNotThrow(() => util.renderRichText('$\\undefinedcmd{x}$'));
  });

  test('数字与中文混排', () => {
    const html = util.renderRichText('第 3 题：求 $\\pi$ 的值');
    assert.ok(html.indexOf('第 3 题') >= 0);
    assert.ok(html.indexOf('katex') >= 0);
  });
});

/* ---------------- esc 本身 ---------------- */

group('工具 · esc', () => {
  test('五个字符都被转义', () => {
    const out = util.esc('<>&"\'');
    assert.strictEqual(out, '&lt;&gt;&amp;&quot;&#39;');
  });

  test('null 返回空串', () => {
    assert.strictEqual(util.esc(null), '');
    assert.strictEqual(util.esc(undefined), '');
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
