/**
 * ocr-unlock.js —— 口令解锁识别的纯加密逻辑（第四份任务书 C 部分）
 *
 * 浏览器与 Node 共用 crypto.subtle（Node 测试可直接用 globalThis.crypto，也可注入）。
 * 规格来自任务书 3.3，安全敏感、勿改参数：
 *   派生 PBKDF2-SHA256，迭代 200000，随机盐 16 字节；
 *   加密 AES-GCM-256，随机 IV 12 字节；密文包 { v:1, salt, iv, ct }，全部 base64。
 *
 * 信任模型（必须如实告知用户，也写进了 docs/密钥轮换说明.md）：
 *   - 知道口令的人可以解出密钥——与「发带密钥单文件」同级，只是不再是公开网页上人人可得；
 *   - 密文公开在仓库里，任何人可离线暴力猜口令，口令强度（≥16 位随机）是唯一防线。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});

  var ITERATIONS = 200000;
  var SALT_LEN = 16;
  var IV_LEN = 12;
  var PASS_MIN = 16;

  function getSubtle() {
    var c = (typeof global.crypto !== 'undefined') ? global.crypto : null;
    return (c && c.subtle) ? c.subtle : null;
  }

  function bytesToB64(buf) {
    var u = new Uint8Array(buf);
    var s = '';
    for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  }

  function b64ToBytes(b64) {
    var s = atob(String(b64 || ''));
    var u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }

  function enc(s) { return new TextEncoder().encode(String(s)); }
  function dec(bytes) { return new TextDecoder().decode(bytes); }

  function validatePassphrase(p) {
    if (typeof p !== 'string' || p.length < PASS_MIN) {
      throw new Error('口令至少 ' + PASS_MIN + ' 个字符且应当随机（弱口令等于公开密钥）');
    }
    return p;
  }

  function validateVault(v) {
    if (!v || v.v !== 1 || typeof v.salt !== 'string' || typeof v.iv !== 'string' || typeof v.ct !== 'string') {
      throw new Error('密文包格式不对（需要 {v:1, salt, iv, ct}）');
    }
    return v;
  }

  async function deriveKey(subtle, passphrase, salt, iterations) {
    var base = await subtle.importKey('raw', enc(passphrase), 'PBKDF2', false, ['deriveBits']);
    var bits = await subtle.deriveBits(
      { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' }, base, 256);
    return subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  /**
   * 加密一段密钥字符串 → 密文包。每次调用盐与 IV 都随机（测试锁定）。
   * opts: { subtle?, iterations?, salt? }（供测试注入/提速；正常调用不传）
   */
  async function encryptVault(keyString, passphrase, opts) {
    opts = opts || {};
    var subtle = Object.prototype.hasOwnProperty.call(opts, 'subtle') ? opts.subtle : getSubtle();
    if (!subtle) throw new Error('当前环境没有 crypto.subtle，无法加密');
    validatePassphrase(passphrase);
    var iterations = opts.iterations || ITERATIONS;
    var salt = opts.salt || global.crypto.getRandomValues(new Uint8Array(SALT_LEN));
    var iv = global.crypto.getRandomValues(new Uint8Array(IV_LEN));
    var key = await deriveKey(subtle, passphrase, salt, iterations);
    var ct = await subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, enc(keyString));
    return { v: 1, salt: bytesToB64(salt), iv: bytesToB64(iv), ct: bytesToB64(ct) };
  }

  /** 解密 → 原始密钥字符串。口令错 / 密文被篡改 → reject（错误不含任何细节）。 */
  async function decryptVault(vault, passphrase, opts) {
    opts = opts || {};
    var subtle = Object.prototype.hasOwnProperty.call(opts, 'subtle') ? opts.subtle : getSubtle();
    if (!subtle) throw new Error('当前环境没有 crypto.subtle，无法解锁');
    validateVault(vault);
    validatePassphrase(passphrase);
    var iterations = opts.iterations || ITERATIONS;
    var key = await deriveKey(subtle, passphrase, b64ToBytes(vault.salt), iterations);
    var plain = await subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(vault.iv) }, key, b64ToBytes(vault.ct));
    return dec(plain);
  }

  QT.ocrUnlock = {
    ITERATIONS: ITERATIONS,
    PASS_MIN: PASS_MIN,
    subtleAvailable: function () { return !!getSubtle(); },
    validatePassphrase: validatePassphrase,
    validateVault: validateVault,
    encryptVault: encryptVault,
    decryptVault: decryptVault
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
