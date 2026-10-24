/**
 * tests/ocr-unlock.test.js —— C 部分口令解锁加密逻辑（第四份任务书，≥12 项）
 *
 * Node 24 自带 globalThis.crypto（webcrypto），与浏览器 crypto.subtle 同一 API；
 * 测试用低迭代（opts.iterations）提速，正式常量 200000 单独锁定断言。
 */
'use strict';

const assert = require('node:assert');
const path = require('node:path');

global.QT = {};
require(path.join(__dirname, '..', 'js', 'ocr-unlock.js'));

const U = global.QT.ocrUnlock;
const SUBTLE = globalThis.crypto.subtle;
const FAST = { subtle: SUBTLE, iterations: 1000 };
const PASS = 'xk9Qm2Vt7Rw4Zp8L'; // 16 位随机口令（测试专用，与真实口令无关）
const KEY = 'abcdef12.34567890abcdef12.34567890'; // 假 key（格式像 id.secret）

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

group('C1. 加解密往返', () => {
  test('正确口令解出原文', async () => {
    const v = await U.encryptVault(KEY, PASS, FAST);
    const out = await U.decryptVault(v, PASS, FAST);
    assert.strictEqual(out, KEY);
  });

  test('原文含 Unicode 与 base64 特征字符也原样往返', async () => {
    const weird = '密钥√∑≥中文✓+/=';
    const v = await U.encryptVault(weird, PASS, FAST);
    assert.strictEqual(await U.decryptVault(v, PASS, FAST), weird);
  });

  test('每次加密的盐都不同（随机性锁定）', async () => {
    const a = await U.encryptVault(KEY, PASS, FAST);
    const b = await U.encryptVault(KEY, PASS, FAST);
    assert.notStrictEqual(a.salt, b.salt);
  });

  test('每次加密的 IV 都不同（随机性锁定）', async () => {
    const a = await U.encryptVault(KEY, PASS, FAST);
    const b = await U.encryptVault(KEY, PASS, FAST);
    assert.notStrictEqual(a.iv, b.iv);
  });
});

group('C2. 失败路径（全部 reject 且不带细节）', () => {
  test('错误口令 → 解密失败', async () => {
    const v = await U.encryptVault(KEY, PASS, FAST);
    await assert.rejects(() => U.decryptVault(v, '错误的口令16位以上!!', FAST));
  });

  test('密文 ct 被篡改一个字节 → 失败', async () => {
    const v = await U.encryptVault(KEY, PASS, FAST);
    const bytes = Array.from(Buffer.from(v.ct, 'base64'));
    bytes[0] ^= 0x01;
    v.ct = Buffer.from(bytes).toString('base64');
    await assert.rejects(() => U.decryptVault(v, PASS, FAST));
  });

  test('salt 被篡改 → 失败', async () => {
    const v = await U.encryptVault(KEY, PASS, FAST);
    const bytes = Array.from(Buffer.from(v.salt, 'base64'));
    bytes[0] ^= 0xff;
    v.salt = Buffer.from(bytes).toString('base64');
    await assert.rejects(() => U.decryptVault(v, PASS, FAST));
  });

  test('iv 被篡改 → 失败', async () => {
    const v = await U.encryptVault(KEY, PASS, FAST);
    const bytes = Array.from(Buffer.from(v.iv, 'base64'));
    bytes[0] ^= 0xff;
    v.iv = Buffer.from(bytes).toString('base64');
    await assert.rejects(() => U.decryptVault(v, PASS, FAST));
  });
});

group('C3. 校验与降级', () => {
  test('口令 <16 位 → validatePassphrase 抛错（弱口令=公开密钥）', () => {
    assert.throws(() => U.validatePassphrase('short123'), /16/);
    assert.throws(() => U.validatePassphrase(''), /16/);
    assert.throws(() => U.validatePassphrase(null), /16/);
  });

  test('密文包格式校验：缺字段 / 版本不对 → 抛错', () => {
    assert.throws(() => U.validateVault(null), /格式/);
    assert.throws(() => U.validateVault({ v: 2, salt: 'a', iv: 'b', ct: 'c' }), /格式/);
    assert.throws(() => U.validateVault({ v: 1, salt: 'a', iv: 'b' }), /格式/);
  });

  test('subtle 缺失（非安全上下文）→ 明确报错不崩溃', async () => {
    await assert.rejects(
      () => U.decryptVault({ v: 1, salt: 'a', iv: 'b', ct: 'c' }, PASS, { subtle: null, iterations: 1000 }),
      /crypto\.subtle/
    );
    await assert.rejects(() => U.encryptVault(KEY, PASS, { subtle: null, iterations: 1000 }), /crypto\.subtle/);
  });

  test('正式迭代常量 ≥ 200000（安全规格锁定）', () => {
    assert.ok(U.ITERATIONS >= 200000, '实际：' + U.ITERATIONS);
  });
});

group('C4. 泄漏自查（与 build/encrypt-key.js 的写出前自查同口径）', () => {
  test('密文包 JSON 里搜不到明文密钥的任何连续 8 字符', async () => {
    const marker = 'zzqq11bb-88yy22ww-cc'; // 高特征假 key，8 连字极易命中
    const v = await U.encryptVault(marker, PASS, FAST);
    const text = JSON.stringify(v);
    for (let i = 0; i + 8 <= marker.length; i++) {
      assert.ok(!text.includes(marker.slice(i, i + 8)), '泄漏片段：' + marker.slice(i, i + 8));
    }
  });

  test('密文包 JSON 里搜不到明文密钥的整体 base64 形态', async () => {
    const v = await U.encryptVault(KEY, PASS, FAST);
    const b64form = Buffer.from(KEY, 'utf8').toString('base64');
    const text = JSON.stringify(v);
    assert.ok(!text.includes(b64form), 'base64 形态泄漏');
    // 且解密后仍能还原（证明不是靠存明文实现的）
    assert.strictEqual(await U.decryptVault(v, PASS, FAST), KEY);
  });
});

run();
