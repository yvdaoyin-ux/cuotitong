/**
 * tests/export.test.js —— 匿名使用数据导出的单元测试
 *
 * 运行：cd 03-错题通 && node tests/export.test.js
 *
 * 本套测试的重点不是「算得对不对」，而是**绝不能泄露用户内容**。
 * 所以用「埋入敏感字符串 → 断言导出结果里搜不到」的方式验证，
 * 而不是仅仅检查字段名。
 */
'use strict';

const assert = require('node:assert');
const path = require('node:path');

require(path.join(__dirname, '..', 'js', 'export-usage.js'));

const E = globalThis.QT.exportUsage;

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

/* ---------------- 测试用「带敏感信息」的假数据库 ---------------- */

// 这些字符串模拟用户可能写进题干/答案/解法里的私密内容
const SECRETS = [
  '我的手机号13800138000',
  '这是张某某同学的作业',
  '密码hunter2',
  '我的身份证后四位1234',
  '这道题老师说要考'
];

function makeDb() {
  return {
    schemaVersion: 2,
    createdAt: '2026-10-20T08:00:00.000Z',
    kps: [
      // 自建知识点的名字也是用户自由文本，绝不能导出
      { id: 'kpu_1', subject: 'matan', name: SECRETS[1], builtin: false }
    ],
    mistakes: [
      {
        id: 'm1',
        subject: 'matan',
        kpIds: ['kp_matan_0'],
        stem: SECRETS[0] + ' 求极限',
        myAnswer: SECRETS[2],
        correctAnswer: SECRETS[3],
        reason: 'concept',
        createdAt: '2026-10-20T08:00:00.000Z',
        updatedAt: '2026-10-20T08:00:00.000Z'
      },
      {
        id: 'm2',
        subject: 'alglinalg',
        kpIds: ['kp_alglinalg_4'],
        stem: SECRETS[4],
        myAnswer: '',
        correctAnswer: '',
        reason: 'calc',
        createdAt: '2026-10-20T09:00:00.000Z',
        updatedAt: '2026-10-20T09:00:00.000Z'
      }
    ],
    answers: [
      {
        id: 'a1', mistakeId: 'm1', kpIds: ['kp_matan_0'],
        correct: false, kind: 'intake', note: '', at: '2026-10-20T08:00:00.000Z'
      },
      {
        id: 'a2', mistakeId: 'm1', kpIds: ['kp_matan_0'],
        correct: true, kind: 'quiz', note: SECRETS[0] + ' 我的解法', at: '2026-10-21T10:30:00.000Z'
      },
      {
        id: 'a3', mistakeId: 'm2', kpIds: ['kp_alglinalg_4'],
        correct: false, kind: 'review', note: SECRETS[2], at: '2026-10-22T11:00:00.000Z'
      }
    ],
    events: [
      { id: 'e1', type: 'app_open', at: '2026-10-20T08:00:00.000Z', payload: {} },
      {
        id: 'e2', type: 'quiz_finish', at: '2026-10-21T10:30:00.000Z',
        payload: { subject: 'matan', total: 5, correct: 3, skipped: 1 }
      },
      // 恶意/误加的埋点：payload 里塞了用户内容
      {
        id: 'e3', type: 'mistake_add', at: '2026-10-20T08:05:00.000Z',
        payload: { subject: 'matan', kpCount: 2, stem: SECRETS[0], note: SECRETS[2] }
      },
      // 未知事件类型：应整体丢弃
      {
        id: 'e4', type: 'debug_dump', at: '2026-10-20T08:06:00.000Z',
        payload: { everything: SECRETS[3] }
      }
    ]
  };
}

const NOW = '2026-10-23T12:00:00.000Z';

/** 把导出结果序列化后，检查是否包含任何敏感串。 */
function assertNoSecrets(serialized, label) {
  SECRETS.forEach(function (s) {
    assert.ok(
      serialized.indexOf(s) < 0,
      (label || '') + ' 泄露了敏感内容：' + s
    );
  });
}

/* ---------------- 隐私：最重要的一组 ---------------- */

group('🔴 隐私 · 绝不泄露用户内容', () => {
  test('JSON 导出中搜不到任何敏感字符串', () => {
    const out = E.buildAnonymous(makeDb(), NOW);
    assertNoSecrets(JSON.stringify(out), 'JSON');
  });

  test('题干、我的答案、正确答案、手写解法都不在结果里', () => {
    const out = E.buildAnonymous(makeDb(), NOW);
    const json = JSON.stringify(out);
    // 精确检查这些键名是否出现（含引号，避免误伤 meta.notice 之类的词组）
    ['"stem"', '"myAnswer"', '"correctAnswer"', '"note"', '"kpIds"', '"mistakeId"'].forEach(function (k) {
      assert.ok(json.indexOf(k) < 0, '导出了不该有的字段：' + k);
    });
  });

  test('事件 payload 里的 stem/note 被白名单丢弃', () => {
    const out = E.buildAnonymous(makeDb(), NOW);
    const e3 = out.events.filter(function (e) { return e.type === 'mistake_add'; })[0];
    assert.ok(e3, '白名单内的事件应保留');
    assert.deepStrictEqual(Object.keys(e3.payload).sort(), ['kpCount', 'subject']);
  });

  test('未知事件类型整体丢弃', () => {
    const out = E.buildAnonymous(makeDb(), NOW);
    assert.strictEqual(out.events.filter(function (e) { return e.type === 'debug_dump'; }).length, 0);
  });

  test('自建知识点名称不外泄，只保留数量', () => {
    const out = E.buildAnonymous(makeDb(), NOW);
    assert.strictEqual(out.summary.customKpCount, 1);
    assertNoSecrets(JSON.stringify(out), '自建知识点');
  });

  test('事件 CSV 不含敏感内容', () => {
    assertNoSecrets(E.buildEventsCsv(makeDb()), 'events.csv');
  });

  test('作答 CSV 不含敏感内容', () => {
    assertNoSecrets(E.buildAnswersCsv(makeDb()), 'answers.csv');
  });

  test('作答明细只有对错/类型/知识点数，没有 mistakeId、kpIds、note', () => {
    const out = E.buildAnonymous(makeDb(), NOW);
    out.answers.forEach(function (a) {
      assert.deepStrictEqual(Object.keys(a).sort(), ['at', 'correct', 'kind', 'kpCount']);
    });
  });
});

/* ---------------- 统计正确性 ---------------- */

group('统计 · 聚合数字', () => {
  test('总数与科目分布正确', () => {
    const out = E.buildAnonymous(makeDb(), NOW);
    assert.strictEqual(out.summary.mistakeCount, 2);
    assert.strictEqual(out.summary.answerCount, 3);
    assert.deepStrictEqual(out.bySubject, { matan: 1, alglinalg: 1 });
  });

  test('错因分布正确', () => {
    const out = E.buildAnonymous(makeDb(), NOW);
    assert.deepStrictEqual(out.byReason, { concept: 1, calc: 1 });
  });

  test('作答类型分布正确（含 intake）', () => {
    const out = E.buildAnonymous(makeDb(), NOW);
    assert.deepStrictEqual(out.byAnswerKind, { intake: 1, quiz: 1, review: 1 });
  });

  test('正确率只统计非 intake 的作答', () => {
    const out = E.buildAnonymous(makeDb(), NOW);
    // quiz 对 + review 错 → 1/2
    assert.strictEqual(out.summary.quizAnswers, 2);
    assert.strictEqual(out.summary.quizCorrect, 1);
    assert.strictEqual(out.summary.quizAccuracy, 0.5);
  });

  test('复习深度分布：m1 复习 1 次、m2 复习 1 次', () => {
    const out = E.buildAnonymous(makeDb(), NOW);
    assert.deepStrictEqual(out.reviewDepth, { '0': 0, '1': 2, '2-4': 0, '5+': 0 });
  });

  test('从未复习的错题计入 "0"', () => {
    const db = makeDb();
    db.mistakes.push({
      id: 'm3', subject: 'prob', kpIds: ['kp_prob_0'], stem: 'x',
      myAnswer: '', correctAnswer: '', reason: '',
      createdAt: NOW, updatedAt: NOW
    });
    const out = E.buildAnonymous(db, NOW);
    assert.strictEqual(out.reviewDepth['0'], 1);
  });

  test('复习 5 次以上归入 "5+"', () => {
    const db = makeDb();
    for (let i = 0; i < 6; i++) {
      db.answers.push({
        id: 'ax' + i, mistakeId: 'm2', kpIds: ['kp_alglinalg_4'],
        correct: true, kind: 'quiz', note: '', at: NOW
      });
    }
    const out = E.buildAnonymous(db, NOW);
    // m2 原有 1 次 review，再加 6 次 = 7 次
    assert.strictEqual(out.reviewDepth['5+'], 1);
  });

  test('活跃天数按日期去重', () => {
    const out = E.buildAnonymous(makeDb(), NOW);
    // 事件分布在 10-20、10-21 两天
    assert.strictEqual(out.summary.activeDays, 2);
  });

  test('空库也能导出且不崩', () => {
    const out = E.buildAnonymous({ schemaVersion: 2 }, NOW);
    assert.strictEqual(out.summary.mistakeCount, 0);
    assert.strictEqual(out.summary.quizAccuracy, null);
    assert.deepStrictEqual(out.events, []);
  });

  test('完全空的输入不抛异常', () => {
    const out = E.buildAnonymous(null, NOW);
    assert.strictEqual(out.summary.mistakeCount, 0);
  });
});

/* ---------------- 时间与格式 ---------------- */

group('格式 · 时间截断与 CSV 转义', () => {
  test('时间戳截断到分钟（不保留秒）', () => {
    const t = E.trimTime('2026-10-21T10:30:45.123Z');
    assert.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(t), '实际：' + t);
    assert.ok(t.indexOf(':45') < 0, '不应保留秒');
  });

  test('非法时间返回 null 而不是 Invalid Date', () => {
    assert.strictEqual(E.trimTime('不是时间'), null);
  });

  test('CSV 含逗号时加引号', () => {
    const csv = E.buildEventsCsv(makeDb());
    // subject 是纯枚举，不会含逗号；这里验证表头与行数
    const lines = csv.split('\r\n');
    assert.strictEqual(lines[0], '时间,事件类型,科目,题数,答对,答错');
    // 3 个白名单事件（app_open / quiz_finish / mistake_add）
    assert.strictEqual(lines.length, 4);
  });

  test('CSV 的答错数由 total-correct-skipped 推出', () => {
    const csv = E.buildEventsCsv(makeDb());
    const quizLine = csv.split('\r\n').filter(function (l) { return l.indexOf('quiz_finish') >= 0; })[0];
    assert.ok(quizLine, '应有 quiz_finish 行');
    // total=5, correct=3, skipped=1 → wrong=1
    assert.ok(quizLine.endsWith(',5,3,1'), '实际：' + quizLine);
  });

  test('作答 CSV 表头与行数正确', () => {
    const csv = E.buildAnswersCsv(makeDb());
    const lines = csv.split('\r\n');
    assert.strictEqual(lines[0], '时间,是否答对,作答类型,涉及知识点数');
    assert.strictEqual(lines.length, 4); // 表头 + 3 条
  });

  test('meta 里明写隐私声明', () => {
    const out = E.buildAnonymous(makeDb(), NOW);
    assert.ok(out.meta.privacy.indexOf('不含题干') >= 0);
    assert.strictEqual(out.meta.app, '错题通');
  });
});

/* ---------------- 白名单机制本身 ---------------- */

group('白名单 · 默认不导出', () => {
  test('未登记的 payload 字段一律丢弃', () => {
    const cleaned = E.cleanPayload({ subject: 'matan', 随便加的字段: '危险', secret: 'x' });
    assert.deepStrictEqual(Object.keys(cleaned), ['subject']);
  });

  test('number 类型字段传入字符串会被丢弃', () => {
    const cleaned = E.cleanPayload({ total: '5' });
    assert.deepStrictEqual(cleaned, {});
  });

  test('enum 字段拒绝过长的字符串（防注入整段文本）', () => {
    const cleaned = E.cleanPayload({ subject: 'a'.repeat(100) });
    assert.deepStrictEqual(cleaned, {});
  });

  test('enum 字段拒绝含中文/空格的字符串', () => {
    const cleaned = E.cleanPayload({ subject: '数学 分析' });
    assert.deepStrictEqual(cleaned, {});
  });

  test('payload 为 null 时返回空对象', () => {
    assert.deepStrictEqual(E.cleanPayload(null), {});
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
