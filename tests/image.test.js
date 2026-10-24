/**
 * tests/image.test.js —— 阶段 3（拍照存图）的单元测试
 *
 * 覆盖（任务书 3.1 / 3.2 / 3.5 验收第 1 条 + 3.4 隐私要求）：
 *   A. 压缩管线纯函数：目标尺寸、质量阶梯、体积判断、base64 估算
 *   B. ImageStore 内存实现：CRUD / 按题删除 / 孤儿清理
 *   C. 降级：模拟 IndexedDB 抛异常 → openImageStore 必须得到 null，不能 reject
 *   D. 存储/隐私：只带图片也能录题；匿名导出绝不含图片数据与题目文本
 *
 * IndexedDB 实现本身无法在 Node 里跑（没有真实 IDB），
 * 由浏览器实测覆盖（见阶段 3 完成汇报），这里不假装测过。
 */
'use strict';

const assert = require('node:assert');
const path = require('node:path');

global.QT = {};
require(path.join(__dirname, '..', 'js', 'util.js'));
require(path.join(__dirname, '..', 'js', 'data.js'));
require(path.join(__dirname, '..', 'js', 'storage.js'));
require(path.join(__dirname, '..', 'js', 'export-usage.js'));
require(path.join(__dirname, '..', 'js', 'image-pipeline.js'));
require(path.join(__dirname, '..', 'js', 'image-store.js'));

const QT = global.QT;
const P = QT.imagePipeline;
const L = QT.imageStoreLib;
const S = QT.storage;

/* ---------------- 极简测试框架（支持 async 用例，顺序执行） ---------------- */

let passed = 0;
let failed = 0;
const failures = [];
const queue = [];

function test(name, fn) {
  queue.push({ name, fn });
}

function group(name, fn) {
  queue.push({ name, groupOnly: true });
  fn(); // 立即执行：把本组的 test 按顺序注册到队列里
}

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

/** 测试用的假 Blob：Node 24 有全局 Blob，直接用真 Blob。 */
function fakeBlob(bytes, size) {
  const b = new Blob([new Uint8Array(bytes || [1, 2, 3])], { type: 'image/jpeg' });
  return b;
}

/** 每个用例前重置存储层为干净内存后端。 */
function freshBackend() {
  const mem = {};
  S.setBackend({
    getItem: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; }
  });
  S.resetAll();
}

/* ================= A. 压缩管线纯函数 ================= */

group('A1. computeTargetSize（长边 ≤1280，只缩不放大）', () => {
  test('横图 4032×3024 → 1280×960，保持长宽比', () => {
    assert.deepStrictEqual(P.computeTargetSize(4032, 3024, 1280), { w: 1280, h: 960 });
  });
  test('竖图 3024×4032 → 960×1280（长边在高度上）', () => {
    assert.deepStrictEqual(P.computeTargetSize(3024, 4032, 1280), { w: 960, h: 1280 });
  });
  test('小图 800×600 不放大，原样返回', () => {
    assert.deepStrictEqual(P.computeTargetSize(800, 600, 1280), { w: 800, h: 600 });
  });
  test('正好 1280 的图不动', () => {
    assert.deepStrictEqual(P.computeTargetSize(1280, 960, 1280), { w: 1280, h: 960 });
  });
  test('尺寸取整后不小于 1px（极端长条图）', () => {
    const t = P.computeTargetSize(10000, 3, 1280);
    assert.ok(t.w === 1280 && t.h >= 1);
  });
  test('入参非法（0 / 负数 / NaN）返回 null，不抛异常', () => {
    assert.strictEqual(P.computeTargetSize(0, 100), null);
    assert.strictEqual(P.computeTargetSize(-5, 100), null);
    assert.strictEqual(P.computeTargetSize(NaN, 100), null);
  });
  test('默认长边就是任务书规定的 1280', () => {
    assert.strictEqual(P.MAX_EDGE, 1280);
  });
});

group('A2. qualitySequence（0.72 起步，逐步降到 0.5）', () => {
  test('默认阶梯是 [0.72, 0.61, 0.5]，最低档必含 0.5', () => {
    assert.deepStrictEqual(P.qualitySequence(), [0.72, 0.61, 0.5]);
  });
  test('阶梯严格递减且不以 0 结尾', () => {
    const seq = P.qualitySequence();
    for (let i = 1; i < seq.length; i++) assert.ok(seq[i] < seq[i - 1]);
    assert.strictEqual(seq[seq.length - 1], 0.5);
  });
  test('自定义起点高于下限时仍以下限收尾', () => {
    assert.deepStrictEqual(P.qualitySequence(0.9, 0.5, 0.2), [0.9, 0.7, 0.5]);
  });
  test('起点等于下限时只有一档', () => {
    assert.deepStrictEqual(P.qualitySequence(0.5, 0.5, 0.1), [0.5]);
  });
});

group('A3. 体积判断与 base64 估算', () => {
  test('overSize：恰好 200KB 不算超，超 1 字节算超', () => {
    assert.strictEqual(P.overSize(200 * 1024), false);
    assert.strictEqual(P.overSize(200 * 1024 + 1), true);
  });
  test('base64SizeOf：3 字节 → 4 字符，余数进位', () => {
    assert.strictEqual(P.base64SizeOf(0), 0);
    assert.strictEqual(P.base64SizeOf(3), 4);
    assert.strictEqual(P.base64SizeOf(1), 4);
    assert.strictEqual(P.base64SizeOf(4), 8);
  });
  test('base64SizeOf：200KB 的图约膨胀 1/3（备份预估用）', () => {
    const est = P.base64SizeOf(200 * 1024);
    assert.ok(est > 200 * 1024 && est < 280 * 1024, 'est=' + est);
  });
});

/* ================= B. ImageStore 内存实现 ================= */

group('B1. 内存实现 CRUD', () => {
  test('put 后 get 能取回同一条记录（blob 内容一致）', async () => {
    const store = L.createMemoryStore();
    const blob = fakeBlob([9, 9, 9, 9]);
    await store.put({ id: 'img_1', qid: 'm_1', blob, w: 100, h: 80, size: 4, createdAt: '2026-10-24T00:00:00Z' });
    const rec = await store.get('img_1');
    assert.ok(rec);
    assert.strictEqual(rec.qid, 'm_1');
    assert.strictEqual(rec.w, 100);
    const buf = new Uint8Array(await rec.blob.arrayBuffer());
    assert.deepStrictEqual([...buf], [9, 9, 9, 9]);
  });
  test('get 不存在的 id 得到 null 而不是抛异常', async () => {
    const store = L.createMemoryStore();
    assert.strictEqual(await store.get('nope'), null);
  });
  test('put 缺 id 直接拒绝（防止产生取不出来的图）', async () => {
    const store = L.createMemoryStore();
    await assert.rejects(() => store.put({ qid: 'm_1', blob: fakeBlob() }), /缺少 id/);
  });
  test('delete 删除后 get 为 null', async () => {
    const store = L.createMemoryStore();
    await store.put({ id: 'img_1', qid: 'm_1', blob: fakeBlob() });
    await store.delete('img_1');
    assert.strictEqual(await store.get('img_1'), null);
  });
  test('count 反映记录数', async () => {
    const store = L.createMemoryStore();
    assert.strictEqual(await store.count(), 0);
    await store.put({ id: 'a', qid: 'm_1', blob: fakeBlob() });
    await store.put({ id: 'b', qid: 'm_2', blob: fakeBlob() });
    assert.strictEqual(await store.count(), 2);
  });
});

group('B2. 按题删除与孤儿清理', () => {
  test('deleteByQid 只删该题的图，返回删除数', async () => {
    const store = L.createMemoryStore();
    await store.put({ id: 'a', qid: 'm_1', blob: fakeBlob() });
    await store.put({ id: 'b', qid: 'm_1', blob: fakeBlob() });
    await store.put({ id: 'c', qid: 'm_2', blob: fakeBlob() });
    const n = await store.deleteByQid('m_1');
    assert.strictEqual(n, 2);
    assert.strictEqual(await store.get('a'), null);
    assert.strictEqual(await store.get('b'), null);
    assert.ok(await store.get('c'));
  });
  test('listQidPairs 列出全部 id-qid 对（不读 blob）', async () => {
    const store = L.createMemoryStore();
    await store.put({ id: 'a', qid: 'm_1', blob: fakeBlob() });
    await store.put({ id: 'b', qid: 'm_2', blob: fakeBlob() });
    const pairs = await store.listQidPairs();
    assert.strictEqual(pairs.length, 2);
    assert.ok(pairs.some((p) => p.id === 'a' && p.qid === 'm_1'));
  });
  test('cleanupOrphans 删孤儿、留存活，返回删除数', async () => {
    const store = L.createMemoryStore();
    await store.put({ id: 'live1', qid: 'm_1', blob: fakeBlob() });
    await store.put({ id: 'live2', qid: 'm_2', blob: fakeBlob() });
    await store.put({ id: 'dead1', qid: 'm_gone', blob: fakeBlob() });
    await store.put({ id: 'dead2', qid: null, blob: fakeBlob() });
    const n = await L.cleanupOrphans(store, { m_1: true, m_2: true });
    assert.strictEqual(n, 2);
    assert.strictEqual(await store.count(), 2);
    assert.ok(await store.get('live1'));
    assert.strictEqual(await store.get('dead1'), null);
  });
  test('cleanupOrphans 传 null store（降级环境）返回 0，不抛异常', async () => {
    assert.strictEqual(await L.cleanupOrphans(null, {}), 0);
  });
  test('clear 清空全部', async () => {
    const store = L.createMemoryStore();
    await store.put({ id: 'a', qid: 'm_1', blob: fakeBlob() });
    await store.clear();
    assert.strictEqual(await store.count(), 0);
  });
});

/* ================= C. 降级（任务书 3.5） ================= */

group('C. IndexedDB 不可用时的降级', () => {
  test('没有 indexedDB（如极端隐私模式）→ resolve null，不 reject', async () => {
    const store = await L.openImageStore(null);
    assert.strictEqual(store, null);
  });
  test('模拟 indexedDB.open 直接抛异常 → resolve null', async () => {
    const evilFactory = {
      open: function () { throw new Error('SecurityError: 隐私模式拒绝'); }
    };
    const store = await L.openImageStore(evilFactory);
    assert.strictEqual(store, null);
  });
  test('模拟打开后报错（onerror）→ resolve null', async () => {
    const evilFactory = {
      open: function () {
        const req = { onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null, result: null, error: new Error('VersionError') };
        setTimeout(() => req.onerror && req.onerror(), 0);
        return req;
      }
    };
    const store = await L.openImageStore(evilFactory);
    assert.strictEqual(store, null);
  });
  test('打开被阻塞（onblocked，如旧标签页占着旧版本）→ resolve null', async () => {
    const evilFactory = {
      open: function () {
        const req = { onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
        setTimeout(() => req.onblocked && req.onblocked(), 0);
        return req;
      }
    };
    const store = await L.openImageStore(evilFactory);
    assert.strictEqual(store, null);
  });
  test('孤儿清理接受 null store（降级环境启动不崩）', async () => {
    assert.strictEqual(await L.cleanupOrphans(null, { m_1: true }), 0);
  });
});

/* ================= D. 存储 / 隐私 ================= */

group('D1. 只带图片的录题（v3 校验）', () => {
  test('stem 与 source 全空、只有 imageIds 时允许保存', () => {
    freshBackend();
    const kp = S.kpsBySubject('matan')[0];
    const m = S.addMistake({ subject: 'matan', kpIds: [kp.id], stem: '', source: '', imageIds: ['img_x'] });
    assert.strictEqual(m.imageIds.length, 1);
  });
  test('updateMistake 可以增删 imageIds', () => {
    freshBackend();
    const kp = S.kpsBySubject('matan')[0];
    const m = S.addMistake({ subject: 'matan', kpIds: [kp.id], stem: '题干', imageIds: ['img_a'] });
    const u = S.updateMistake(m.id, { imageIds: ['img_b', 'img_c'] });
    assert.deepStrictEqual(u.imageIds, ['img_b', 'img_c']);
  });
  test('imageIds 里的脏数据（非字符串）被过滤', () => {
    freshBackend();
    const kp = S.kpsBySubject('matan')[0];
    const m = S.addMistake({ subject: 'matan', kpIds: [kp.id], stem: '题干', imageIds: ['ok', 42, null, ''] });
    assert.deepStrictEqual(m.imageIds, ['ok']);
  });
});

group('D2. 匿名导出绝不含图片数据（隐私）', () => {
  test('含图片错题的匿名导出 JSON 里搜不到任何图片痕迹与题目文本', () => {
    freshBackend();
    const kp = S.kpsBySubject('matan')[0];
    S.addMistake({
      subject: 'matan', kpIds: [kp.id], stem: '绝密题干身份证110',
      source: '绝密来源', imageIds: ['img_secret1', 'img_secret2'], reason: 'concept'
    });
    const db = S.load();
    db.mistakes[0].imageData = 'data:image/jpeg;base64,AAAA'; // 模拟脏数据混进错题记录
    const out = QT.exportUsage.buildAnonymous(db, '2026-10-24T12:00:00Z');
    const json = JSON.stringify(out);
    assert.ok(!json.includes('img_secret'), '不应出现图片 id');
    assert.ok(!json.includes('data:image'), '不应出现 base64 图片');
    assert.ok(!json.includes('blob'), '不应出现 blob 字样');
    assert.ok(!json.includes('绝密题干'), '不应出现题干文本');
    assert.ok(!json.includes('绝密来源'), '不应出现来源文本');
  });
  test('事件 payload 白名单外的键（如 imageData）不会被导出', () => {
    freshBackend();
    const kp = S.kpsBySubject('matan')[0];
    const m = S.addMistake({ subject: 'matan', kpIds: [kp.id], stem: '题干' });
    S.logEvent('mistake_add', { subject: m.subject, kpCount: 1, imageData: 'data:image/jpeg;base64,BBBB' });
    const out = QT.exportUsage.buildAnonymous(S.load(), '2026-10-24T12:00:00Z');
    const json = JSON.stringify(out);
    assert.ok(!json.includes('imageData'));
    assert.ok(!json.includes('BBBB'));
    assert.ok(json.includes('"subject":"matan"')); // 白名单内的字段正常导出
  });
  test('CSV 导出同样不含图片数据', () => {
    freshBackend();
    const kp = S.kpsBySubject('matan')[0];
    S.addMistake({ subject: 'matan', kpIds: [kp.id], stem: '题干', imageIds: ['img_csv'] });
    const csv = QT.exportUsage.buildEventsCsv(S.load());
    assert.ok(!csv.includes('img_csv'));
  });
  test('普通备份 JSON 含 imageIds（恢复需要）但不含 base64', () => {
    freshBackend();
    const kp = S.kpsBySubject('matan')[0];
    S.addMistake({ subject: 'matan', kpIds: [kp.id], stem: '', imageIds: ['img_keep'] });
    const json = S.exportJson();
    assert.ok(json.includes('img_keep'), '备份要带 id 才能在导入后关联');
    assert.ok(!json.includes('data:image'), '图片二进制永不进 localStorage 数据');
  });
});

run();
