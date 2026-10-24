/**
 * tests/storage.test.js —— 存储层与迁移的单元测试
 *
 * 运行：cd 03-错题通 && node tests/storage.test.js
 *
 * 重点覆盖 v1 → v2 迁移：知识点体系换了，已有错题必须能被正确重映射，
 * 且不能变成「孤儿」（指向不存在的知识点）。
 */
'use strict';

const assert = require('node:assert');
const path = require('node:path');

global.QT = {};
require(path.join(__dirname, '..', 'js', 'util.js'));
require(path.join(__dirname, '..', 'js', 'data.js'));
require(path.join(__dirname, '..', 'js', 'storage.js'));

const QT = global.QT;
const S = QT.storage;

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

/** 每个用例前重置为干净的内存后端。 */
function freshBackend() {
  const mem = {};
  S.setBackend({
    getItem: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; }
  });
  S.resetAll();
  return mem;
}

/* ---------------- 基础 CRUD ---------------- */

group('基础 · 错题 CRUD', () => {
  test('新增错题时同时写入一条「录入即答错」事件', () => {
    freshBackend();
    const kp = S.kpsBySubject('matan')[0];
    const m = S.addMistake({ subject: 'matan', kpIds: [kp.id], stem: '测试题干', reason: 'concept' });
    assert.strictEqual(S.load().mistakes.length, 1);
    assert.strictEqual(S.load().answers.length, 1);
    const a = S.load().answers[0];
    assert.strictEqual(a.mistakeId, m.id);
    assert.strictEqual(a.correct, false);
    assert.strictEqual(a.kind, 'intake');
  });

  test('题干为空时拒绝保存', () => {
    freshBackend();
    const kp = S.kpsBySubject('matan')[0];
    assert.throws(() => S.addMistake({ subject: 'matan', kpIds: [kp.id], stem: '   ' }), /题干不能为空/);
  });

  test('未选知识点时拒绝保存', () => {
    freshBackend();
    assert.throws(() => S.addMistake({ subject: 'matan', kpIds: [], stem: 'x' }), /知识点/);
  });

  test('删除错题会连带删除它的作答事件（可纠错的关键）', () => {
    freshBackend();
    const kp = S.kpsBySubject('matan')[0];
    const m = S.addMistake({ subject: 'matan', kpIds: [kp.id], stem: 'x' });
    S.recordAnswer(m.id, true, 'quiz');
    assert.strictEqual(S.load().answers.length, 2);
    S.deleteMistake(m.id);
    assert.strictEqual(S.load().mistakes.length, 0);
    assert.strictEqual(S.load().answers.length, 0, '删除后不应残留作答事件');
  });

  test('删除不影响其它错题的作答事件', () => {
    freshBackend();
    const kp = S.kpsBySubject('matan')[0];
    const a = S.addMistake({ subject: 'matan', kpIds: [kp.id], stem: 'a' });
    const b = S.addMistake({ subject: 'matan', kpIds: [kp.id], stem: 'b' });
    S.deleteMistake(a.id);
    const ids = S.load().answers.map((x) => x.mistakeId);
    assert.deepStrictEqual(ids, [b.id]);
  });

  test('筛选：按科目 / 知识点 / 错因', () => {
    freshBackend();
    const k1 = S.kpsBySubject('matan')[0];
    const k2 = S.kpsBySubject('alglinalg')[0];
    S.addMistake({ subject: 'matan', kpIds: [k1.id], stem: 'a', reason: 'concept' });
    S.addMistake({ subject: 'alglinalg', kpIds: [k2.id], stem: 'b', reason: 'calc' });

    assert.strictEqual(S.listMistakes({ subject: 'matan' }).length, 1);
    assert.strictEqual(S.listMistakes({ kpId: k2.id }).length, 1);
    assert.strictEqual(S.listMistakes({ reason: 'calc' }).length, 1);
    assert.strictEqual(S.listMistakes({}).length, 2);
  });

  test('自建知识点：同科目同名不重复创建', () => {
    freshBackend();
    const a = S.addKnowledgePoint('matan', '格林公式');
    const b = S.addKnowledgePoint('matan', '格林公式');
    assert.strictEqual(a.id, b.id);
    assert.strictEqual(S.load().kps.length, 1);
  });
});

/* ---------------- 导出 / 导入 ---------------- */

group('备份 · 导出与导入', () => {
  test('导出再导入可完整还原', () => {
    freshBackend();
    const kp = S.kpsBySubject('matan')[0];
    S.addMistake({ subject: 'matan', kpIds: [kp.id], stem: '原文', reason: 'method' });
    const dump = S.exportJson();

    freshBackend();
    S.importJson(dump);
    assert.strictEqual(S.load().mistakes.length, 1);
    assert.strictEqual(S.load().mistakes[0].stem, '原文');
  });

  test('导入非法 JSON 时报中文错误而不是崩溃', () => {
    freshBackend();
    assert.throws(() => S.importJson('{不是json'), /不是合法的 JSON/);
  });

  test('导入结构不对的文件时报错', () => {
    freshBackend();
    assert.throws(() => S.importJson('{"foo":1}'), /缺少 mistakes/);
  });
});

/* ---------------- v1 → v2 迁移 ---------------- */

group('迁移 · v1（三科）→ v2（四科）', () => {
  /** 构造一份真实的 v1 数据：科目 calc/linalg，知识点 id 形如 kp_calc_8 */
  function makeV1Db() {
    return {
      schemaVersion: 1,
      createdAt: '2026-10-20T00:00:00Z',
      kps: [
        // v1 里用户自建的知识点（真实数据中必然存在于 kps，否则就是孤儿引用）
        { id: 'kp_uid_keepme', subject: 'calc', name: '格林公式', builtin: false }
      ],
      mistakes: [
        {
          id: 'm1', subject: 'calc', kpIds: ['kp_calc_7'], // 定积分（v1 calc 的第 8 项，下标 7）
          stem: '定积分题', myAnswer: '', correctAnswer: '', reason: 'calc',
          createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z'
        },
        {
          id: 'm2', subject: 'calc', kpIds: ['kp_calc_3'], // 微分中值定理
          stem: '中值定理题', myAnswer: '', correctAnswer: '', reason: 'method',
          createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z'
        },
        {
          id: 'm3', subject: 'linalg', kpIds: ['kp_linalg_4'], // 矩阵的秩
          stem: '秩的题', myAnswer: '', correctAnswer: '', reason: 'calc',
          createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z'
        },
        {
          id: 'm4', subject: 'linalg', kpIds: ['kp_uid_keepme'], // 用户自建知识点
          stem: '自建知识点题', myAnswer: '', correctAnswer: '', reason: '',
          createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z'
        }
      ],
      answers: [
        { id: 'a1', mistakeId: 'm1', kpIds: ['kp_calc_8'], correct: false, kind: 'intake', at: '2026-10-20T00:00:00Z' },
        { id: 'a2', mistakeId: 'm2', kpIds: ['kp_calc_4'], correct: false, kind: 'intake', at: '2026-10-20T00:00:00Z' },
        { id: 'a3', mistakeId: 'm3', kpIds: ['kp_linalg_5'], correct: true, kind: 'quiz', at: '2026-10-21T00:00:00Z' },
        // 孤儿事件：指向不存在的错题
        { id: 'a4', mistakeId: 'gone', kpIds: ['kp_calc_8'], correct: true, kind: 'quiz', at: '2026-10-21T00:00:00Z' }
      ],
      events: []
    };
  }

  function migrateV1() {
    const db = S.normalize(JSON.parse(JSON.stringify(makeV1Db())));
    return db;
  }

  test('版本号升到 2', () => {
    assert.strictEqual(migrateV1().schemaVersion, S.SCHEMA_VERSION);
  });

  test('科目 id 被映射到新体系', () => {
    const db = migrateV1();
    assert.strictEqual(db.mistakes[0].subject, 'gaoshu');
    assert.strictEqual(db.mistakes[2].subject, 'alglinalg');
  });

  test('迁移后每个知识点 id 都真实存在（不产生孤儿引用）', () => {
    const db = migrateV1();
    const all = {};
    S.allKnowledgePoints().forEach((k) => { all[k.id] = true; });
    db.kps.forEach((k) => { all[k.id] = true; });

    db.mistakes.forEach((m) => {
      m.kpIds.forEach((id) => {
        assert.ok(all[id], '错题 ' + m.id + ' 指向不存在的知识点 ' + id);
      });
    });
    db.answers.forEach((a) => {
      a.kpIds.forEach((id) => {
        assert.ok(all[id], '作答 ' + a.id + ' 指向不存在的知识点 ' + id);
      });
    });
  });

  test('知识点按名字对应到新体系（定积分 → 定积分）', () => {
    const db = migrateV1();
    const kp = S.kpById(db.mistakes[0].kpIds[0]);
    assert.strictEqual(kp.name, '定积分');
    assert.strictEqual(kp.subject, 'gaoshu');
  });

  test('旧名有改名时走重命名表（微分中值定理 → 微分中值定理与导数应用）', () => {
    const db = migrateV1();
    const kp = S.kpById(db.mistakes[1].kpIds[0]);
    assert.strictEqual(kp.name, '微分中值定理与导数应用');
  });

  test('多个旧知识点映射到同一新知识点时自动去重', () => {
    // 「微分中值定理」(kp_calc_3)、「洛必达法则」(kp_calc_4)、「泰勒公式」(kp_calc_5)
    // 在新体系里都归属「微分中值定理与导数应用」，应去重为 1 个
    const raw = {
      schemaVersion: 1,
      mistakes: [{
        id: 'mx', subject: 'calc', kpIds: ['kp_calc_3', 'kp_calc_4', 'kp_calc_5'],
        stem: 'x', reason: ''
      }],
      answers: [], events: [], kps: []
    };
    const db = S.normalize(raw);
    assert.strictEqual(db.mistakes[0].kpIds.length, 1, '应去重为 1 个知识点');
    assert.strictEqual(S.kpById(db.mistakes[0].kpIds[0]).name, '微分中值定理与导数应用');
  });

  test('用户自建知识点（kp_uid 开头）原样保留', () => {
    const db = migrateV1();
    assert.deepStrictEqual(db.mistakes[3].kpIds, ['kp_uid_keepme']);
  });

  test('作答事件的知识点跟随错题（口径一致）', () => {
    const db = migrateV1();
    const m1 = db.mistakes.filter((m) => m.id === 'm1')[0];
    const a1 = db.answers.filter((a) => a.id === 'a1')[0];
    assert.deepStrictEqual(a1.kpIds, m1.kpIds);
  });

  test('孤儿作答事件被清除', () => {
    const db = migrateV1();
    assert.strictEqual(db.answers.filter((a) => a.mistakeId === 'gone').length, 0);
  });

  test('迁移幂等：跑两遍结果一致', () => {
    const once = migrateV1();
    const twice = S.normalize(JSON.parse(JSON.stringify(once)));
    assert.deepStrictEqual(twice.mistakes, once.mistakes);
    assert.strictEqual(twice.answers.length, once.answers.length);
    assert.strictEqual(twice.kps.length, once.kps.length);
  });

  test('没有版本号的极早期数据也会被迁移（不能因兜底版本号而跳过）', () => {
    const raw = makeV1Db();
    delete raw.schemaVersion;
    const db = S.normalize(raw);
    assert.strictEqual(db.schemaVersion, S.SCHEMA_VERSION);
    assert.strictEqual(db.mistakes[0].subject, 'gaoshu', '应已完成科目映射');
  });

  test('迁移后仍能正常新增错题与作答', () => {
    const db = migrateV1();
    S.save(db);
    const kp = S.kpsBySubject('matan')[0];
    const m = S.addMistake({ subject: 'matan', kpIds: [kp.id], stem: '迁移后新增' });
    assert.ok(m.id);
    assert.strictEqual(S.load().mistakes.length, 5);
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
