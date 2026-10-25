/**
 * tests/ocr.test.js —— C4（拍照识别 OCR）纯逻辑层的单元测试
 *
 * 覆盖：
 *   A. buildRequestBody：data URL 强制（纯 base64 必须 throw——2026-10-24 实测 400 的教训编码进代码）
 *   B. parseResponseText：成功包法×2、错误 body、非 2xx、非 JSON、字段缺失
 *   C. 额度护栏：边界 15/15（2026-10-25 由 30 降为 15）、跨天重置、不可变性
 *   D. friendlyError：code 1000（实测确认）+ 透出未知 code
 *
 * fetch / FileReader / DOM 交互属于浏览器层（ui-ocr.js），Node 里不假装测过，
 * 由 file:// 真机/无头浏览器冒烟覆盖。
 */
'use strict';

const assert = require('node:assert');
const path = require('node:path');

global.QT = {};
require(path.join(__dirname, '..', 'js', 'ocr.js'));

const QT = global.QT;
const O = QT.ocr;

/* ---------------- 极简测试框架（与 image.test.js 同款，支持 async） ---------------- */

let passed = 0;
let failed = 0;
const failures = [];
const queue = [];

function test(name, fn) {
  queue.push({ name, fn });
}

function group(name, fn) {
  queue.push({ name, groupOnly: true });
  fn();
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

/* ================= A. buildRequestBody ================= */

const GOOD_URL = 'data:image/jpeg;base64,QUJD';

group('A. buildRequestBody（强制 data URL 写法）', () => {
  test('合法 data URL → JSON 里 model=glm-ocr、file 原样保留（含前缀）', () => {
    const body = JSON.parse(O.buildRequestBody(GOOD_URL));
    assert.strictEqual(body.model, 'glm-ocr');
    assert.strictEqual(body.file, GOOD_URL);
    assert.ok(body.file.startsWith('data:image/jpeg;base64,'), '前缀必须保留');
  });

  test('纯 base64（无 data: 前缀）→ throw（实测会被服务端 400）', () => {
    assert.throws(() => O.buildRequestBody('QUJD'), /data URL/);
  });

  test('空串 / null / Blob 对象 → throw', () => {
    assert.throws(() => O.buildRequestBody(''), /data URL/);
    assert.throws(() => O.buildRequestBody(null), /data URL/);
    assert.throws(() => O.buildRequestBody({ size: 1 }), /data URL/);
  });

  test('data:text/... 这类非图片 data URL 也拒（只放行 data:image/）', () => {
    assert.throws(() => O.buildRequestBody('data:text/plain;base64,QUJD'), /data URL/);
  });
});

/* ================= B. parseResponseText ================= */

const OK_TOP = JSON.stringify({
  md_results: '$x^2$ 设 $a>0$',
  layout_details: [{ label: 'formula', content: '$x^2$' }, { label: 'text', content: '设' }],
  usage: { prompt_tokens: 1004, completion_tokens: 695, total_tokens: 1699 }
});

group('B. parseResponseText', () => {
  test('200 + 顶层 md_results → ok，md / blocks / usage 全提取', () => {
    const r = O.parseResponseText(OK_TOP, 200);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.md, '$x^2$ 设 $a>0$');
    assert.strictEqual(r.blocks.length, 2);
    assert.strictEqual(r.blocks[0].label, 'formula');
    assert.strictEqual(r.usage.total_tokens, 1699);
  });

  test('data 包一层的响应也能解析（防御性兼容）', () => {
    const text = JSON.stringify({
      data: { md_results: '$y=1$', usage: { total_tokens: 10 } }
    });
    const r = O.parseResponseText(text, 200);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.md, '$y=1$');
    assert.strictEqual(r.usage.total_tokens, 10);
    assert.deepStrictEqual(r.blocks, []);
  });

  test('401 + error body（实测假 key 的返回）→ 透出服务端 code/message', () => {
    const text = JSON.stringify({ error: { code: '1000', message: '身份验证失败。' } });
    const r = O.parseResponseText(text, 401);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, '1000');
    assert.strictEqual(r.message, '身份验证失败。');
  });

  test('200 但 body 是 error → 也判失败（防御性）', () => {
    const text = JSON.stringify({ error: { code: 'XYZ', message: 'boom' } });
    const r = O.parseResponseText(text, 200);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'XYZ');
  });

  test('500 + 非 JSON body（网关错误页）→ BAD_JSON', () => {
    const r = O.parseResponseText('<html>Bad Gateway</html>', 502);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'BAD_JSON');
  });

  test('500 + JSON 但无 error 字段 → HTTP_500', () => {
    const r = O.parseResponseText('{"msg":"oops"}', 500);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'HTTP_500');
  });

  test('200 但缺 md_results → ok:true 且 md 为空串（上层提示「没识别出文字」）', () => {
    const r = O.parseResponseText('{"usage":{"total_tokens":1}}', 200);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.md, '');
    assert.deepStrictEqual(r.blocks, []);
  });

  test('不传 status 也行（浏览器老环境兜底）', () => {
    const r = O.parseResponseText(OK_TOP);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.md, '$x^2$ 设 $a>0$');
  });
});

/* ================= C. 额度护栏 ================= */

group('C. quotaCheck / quotaRecord（每设备每天 15 次成功，2026-10-25 由 30 降为 15——旧断言改动见汇报单列）', () => {
  test('空状态 → 允许，已用 0，剩 15', () => {
    assert.deepStrictEqual(O.quotaCheck({}, '2026-10-24'), { allowed: true, used: 0, remaining: 15 });
  });

  test('同日已用 14 → 允许（最后 1 次）', () => {
    const r = O.quotaCheck({ date: '2026-10-24', used: 14 }, '2026-10-24');
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.remaining, 1);
  });

  test('同日已用 15 → 拒绝（边界：15 次成功正好封顶）', () => {
    const r = O.quotaCheck({ date: '2026-10-24', used: 15 }, '2026-10-24');
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.remaining, 0);
  });

  test('跨天：昨天用了 30，今天重新允许', () => {
    const r = O.quotaCheck({ date: '2026-10-23', used: 30 }, '2026-10-24');
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.used, 0);
  });

  test('脏状态（负数/非数字 used）按 0 处理，不崩', () => {
    assert.strictEqual(O.quotaCheck({ date: '2026-10-24', used: -5 }, '2026-10-24').used, 0);
    assert.strictEqual(O.quotaCheck({ date: '2026-10-24', used: 'x' }, '2026-10-24').used, 0);
    assert.strictEqual(O.quotaCheck(null, '2026-10-24').allowed, true);
  });

  test('quotaRecord 同日 +1，且【不改入参】（不可变性锁定）', () => {
    const st = { date: '2026-10-24', used: 7 };
    const next = O.quotaRecord(st, '2026-10-24');
    assert.strictEqual(next.used, 8);
    assert.strictEqual(st.used, 7, '入参不许被改');
    assert.notStrictEqual(next, st);
  });

  test('quotaRecord 跨天 → used 归 1', () => {
    const next = O.quotaRecord({ date: '2026-10-23', used: 30 }, '2026-10-24');
    assert.deepStrictEqual(next, { date: '2026-10-24', used: 1 });
  });

  test('自定义 limit 生效（30 是默认值）', () => {
    assert.strictEqual(O.quotaCheck({ date: '2026-10-24', used: 5 }, '2026-10-24', 5).allowed, false);
    assert.strictEqual(O.quotaCheck({ date: '2026-10-24', used: 4 }, '2026-10-24', 5).allowed, true);
    assert.strictEqual(O.DAILY_LIMIT, 15);
  });
});

/* ================= D. friendlyError ================= */

group('D. friendlyError（code 1000 为 2026-10-24 实测确认）', () => {
  test('1000 → 明确说密钥问题', () => {
    assert.ok(/密钥/.test(O.friendlyError('1000', '身份验证失败。')));
  });

  test('未知 code + message → 原样透出，方便排查', () => {
    const s = O.friendlyError('1113', '欠费');
    assert.ok(s.includes('1113') && s.includes('欠费'));
  });

  test('只有 code 没有 message → code 透出', () => {
    assert.strictEqual(O.friendlyError('HTTP_500', ''), 'code HTTP_500');
  });

  test('啥都没有 → 未知错误', () => {
    assert.strictEqual(O.friendlyError('', ''), '未知错误');
  });
});

/* ================= E. 导出面 ================= */

group('E. 模块导出', () => {
  test('ENDPOINT / MODEL 与探针实测一致', () => {
    assert.strictEqual(O.ENDPOINT, 'https://open.bigmodel.cn/api/paas/v4/layout_parsing');
    assert.strictEqual(O.MODEL, 'glm-ocr');
  });
});

run();
