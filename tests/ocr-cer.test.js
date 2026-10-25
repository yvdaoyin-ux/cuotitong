/**
 * tests/ocr-cer.test.js —— CER 工具（第五份任务书 A2，≥8 项）
 */
'use strict';

const assert = require('node:assert');
const path = require('node:path');

const CER = require(path.join(__dirname, '..', 'tools', 'ocr-cer.js'));

let passed = 0;
let failed = 0;
const failures = [];
const queue = [];

function test(name, fn) { queue.push({ name, fn }); }
function group(name, fn) { queue.push({ name, groupOnly: true }); fn(); }

async function run() {
  for (const item of queue) {
    if (item.groupOnly) { console.log('\n' + item.name); continue; }
    try {
      await item.fn();
      passed += 1;
      console.log('  ✓ ' + item.name);
    } catch (err) {
      failed += 1;
      failures.push({ name: item.name, err });
      console.log('  ✗ ' + item.name);
      console.log('    ' + String(err.message).split('\n').join('\n    '));
    }
  }
  console.log('\n' + '-'.repeat(52));
  console.log('通过 ' + passed + ' 项，失败 ' + failed + ' 项');
  if (failed > 0) {
    console.log('\n失败详情：');
    failures.forEach((f) => console.log('  · ' + f.name));
    process.exit(1);
  }
  console.log('全部通过 ✓');
}

group('A2. CER（编辑距离 / 修正文本长度，空白先去掉）', () => {
  test('两边都空 → CER 0', () => {
    assert.deepStrictEqual(CER.computeCer('', ''), { distance: 0, hypLen: 0, refLen: 0, cer: 0 });
  });

  test('完全相同（含中文与空白差异）→ CER 0', () => {
    const r = CER.computeCer('设 $f(x)=x^2$，求导。\n', '设 $f(x)=x^2$，求导。');
    assert.strictEqual(r.cer, 0);
  });

  test('空白全去：换行/缩进差异不算错误', () => {
    const r = CER.computeCer('a b\nc', 'abc');
    assert.strictEqual(r.cer, 0);
    assert.strictEqual(r.hypLen, 3);
  });

  test('单字替换：1 字错 / 3 字参考 → CER 1/3', () => {
    const r = CER.computeCer('求报限', '求极限');
    assert.strictEqual(r.distance, 1);
    assert.strictEqual(r.cer, 1 / 3);
  });

  test('识别多打一个字（插入）→ 距离 1', () => {
    const r = CER.computeCer('设函数组', '设函数');
    assert.strictEqual(r.distance, 1);
    assert.strictEqual(r.cer, 1 / 3);
  });

  test('识别漏一个字（删除）→ 距离 1', () => {
    const r = CER.computeCer('设函', '设函数');
    assert.strictEqual(r.distance, 1);
    assert.strictEqual(r.cer, 1 / 3);
  });

  test('LaTeX 片段：$ 保留并参与计数', () => {
    const r = CER.computeCer('$x^{}$', '$x^{2}$');
    // 去空白后 hyp=$x^{}$ (6 码点) vs ref=$x^{2}$ (7 码点)：漏一个 2 → 距离 1
    assert.strictEqual(r.distance, 1);
    assert.strictEqual(r.cer, 1 / 7);
  });

  test('修正文本为空而识别非空 → CER 记 1', () => {
    const r = CER.computeCer('识别出一堆', '   \n ');
    assert.strictEqual(r.cer, 1);
  });

  test('emoji 按 1 个字符计（码点而非 UTF-16 单元）', () => {
    const r = CER.computeCer('对✓', '对✗');
    assert.strictEqual(r.distance, 1);
    assert.strictEqual(r.cer, 1 / 2);
  });

  test('典型 OCR 错误混合（漏逗号+漏减号）→ CER 数值正确', () => {
    const r = CER.computeCer('解设F=uf 其中F可微', '解设F=u−f，其中F可微');
    // hyp 去空白 11 码点，ref 去空白 13 码点；距离 = 插入 −(1) + 插入 ，(1) = 2
    assert.strictEqual(r.refLen, 13);
    assert.strictEqual(r.distance, 2);
    assert.strictEqual(r.cer, 2 / 13);
  });
});

run();
