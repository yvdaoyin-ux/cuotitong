/**
 * tests/rotate.test.js —— A3 旋转纯函数（第四份任务书）
 *
 * computeRotatedSize 是纯函数，Node 可测；rotateBlob（canvas 画图）属浏览器层，
 * Node 不假装测过，由无头冒烟覆盖（横图旋转后宽高互换 + 缩略图方向）。
 */
'use strict';

const assert = require('node:assert');
const path = require('node:path');

global.QT = {};
require(path.join(__dirname, '..', 'js', 'image-pipeline.js'));

const P = global.QT.imagePipeline;

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

group('A3. computeRotatedSize（90/270 宽高互换，180 不变）', () => {
  test('横图 200×100 转 90° → 100×200（宽高互换）', () => {
    assert.deepStrictEqual(P.computeRotatedSize(200, 100, 90), { w: 100, h: 200 });
  });
  test('竖图 100×200 转 90° → 200×100', () => {
    assert.deepStrictEqual(P.computeRotatedSize(100, 200, 90), { w: 200, h: 100 });
  });
  test('180° 宽高不变', () => {
    assert.deepStrictEqual(P.computeRotatedSize(200, 100, 180), { w: 200, h: 100 });
  });
  test('270° 宽高互换', () => {
    assert.deepStrictEqual(P.computeRotatedSize(200, 100, 270), { w: 100, h: 200 });
  });
  test('正方形旋转后尺寸不变', () => {
    assert.deepStrictEqual(P.computeRotatedSize(100, 100, 90), { w: 100, h: 100 });
  });
  test('非 90 倍数角度（45/0/360）→ null', () => {
    assert.strictEqual(P.computeRotatedSize(200, 100, 45), null);
    assert.strictEqual(P.computeRotatedSize(200, 100, 0), null);
    assert.strictEqual(P.computeRotatedSize(200, 100, 360), null);
  });
  test('非法尺寸（0/负数/NaN）→ null', () => {
    assert.strictEqual(P.computeRotatedSize(0, 100, 90), null);
    assert.strictEqual(P.computeRotatedSize(200, -1, 90), null);
    assert.strictEqual(P.computeRotatedSize(NaN, 100, 90), null);
  });
  test('非数字角度 → null（不抛异常）', () => {
    assert.strictEqual(P.computeRotatedSize(200, 100, '九十'), null);
    assert.strictEqual(P.computeRotatedSize(200, 100, undefined), null);
  });
  test('与压缩管线的兼容：1280×960 转 90° → 960×1280（仍是长边 1280）', () => {
    assert.deepStrictEqual(P.computeRotatedSize(1280, 960, 90), { w: 960, h: 1280 });
  });
});

run();
