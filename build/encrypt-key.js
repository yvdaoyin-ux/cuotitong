/**
 * build/encrypt-key.js —— 把 OCR 密钥用口令加密成密文包（第四份任务书 C 部分）
 *
 * 用法：node build/encrypt-key.js <密钥文件> [输出文件=js/ocr-vault.js]
 * 口令：环境变量 OCR_PASSPHRASE，或不设时交互输入（不回显）。
 *   🔴 口令不得作为命令行参数（避免留在 shell 历史）；至少 16 位且随机，
 *      弱口令 = 密钥公开（密文是公开的，可被离线爆破）。
 * 产物：js/ocr-vault.js —— 只含 {v,salt,iv,ct} 密文，可提交进仓库、进线上页面。
 * 写出前自查：密文包文本里不得出现明文密钥的任何连续 8 字符（含其 base64 形态）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Writable } = require('stream');

require(path.join(__dirname, '..', 'js', 'ocr-unlock.js'));
const U = globalThis.QT.ocrUnlock;

/** 不回显地读一行（口令交互输入用）。 */
function askHidden(question) {
  return new Promise((resolve, reject) => {
    process.stderr.write(question);
    const sink = new Writable({
      write(chunk, enc2, cb) { cb(); } // 丢弃回显
    });
    const rl = readline.createInterface({ input: process.stdin, output: sink, terminal: true });
    rl.once('line', (line) => { rl.close(); resolve(line); });
    rl.once('close', () => {});
    rl.on('error', reject);
  });
}

/** 自查：明文密钥的任意 8 连续字符（原文 + 整体 base64 两种形态）都不得出现在密文包文本里。 */
function assertNoLeak(vaultText, key) {
  const pieces = [];
  for (let i = 0; i + 8 <= key.length; i++) pieces.push(key.slice(i, i + 8));
  pieces.push(Buffer.from(key, 'utf8').toString('base64'));
  for (const piece of pieces) {
    if (vaultText.includes(piece)) {
      throw new Error('自查失败：密文包文本里出现了明文片段（' + piece.slice(0, 4) + '…），终止写出');
    }
  }
}

async function main() {
  const keyFile = process.argv[2];
  const outFile = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.join(__dirname, '..', 'js', 'ocr-vault.js');
  if (!keyFile) {
    console.error('用法：node build/encrypt-key.js <密钥文件> [输出文件]');
    console.error('口令：设环境变量 OCR_PASSPHRASE，或不设则不回显交互输入（≥16 位随机）。');
    process.exit(1);
  }

  const key = fs.readFileSync(path.resolve(keyFile), 'utf8').trim();
  if (!key) throw new Error('密钥文件是空的：' + keyFile);

  const passphrase = process.env.OCR_PASSPHRASE != null
    ? process.env.OCR_PASSPHRASE
    : await askHidden('设置解锁口令（≥16 位随机字符，输入不回显）：');
  U.validatePassphrase(passphrase);

  const vault = await U.encryptVault(key, passphrase);
  const vaultText = JSON.stringify(vault);
  assertNoLeak(vaultText, key);

  const content =
    '/* OCR 密文包：由 build/encrypt-key.js 生成，只含密文。\n' +
    ' * 明文密钥与口令不在此文件；口令由发布者私下告知同学。 */\n' +
    'window.QT_OCR_VAULT = ' + vaultText + ';\n';
  fs.writeFileSync(outFile, content, 'utf8');

  console.log('✓ 已生成 ' + outFile + '（密文 ' + vaultText.length + ' 字符，自查无明文泄漏）');
  console.log('下一步：');
  console.log('  1. git add ' + path.relative(process.cwd(), outFile) + ' && git commit && 推送');
  console.log('  2. 口令自己私下发给同学（微信私聊），不要写进任何文件');
  console.log('  3. 要换密钥：重跑本脚本生成新密文包覆盖，旧密钥在智谱控制台停用');
  console.log('  4. 比赛结束（11-04 后）：到智谱控制台删除/停用这把专用密钥');
}

main().catch((e) => {
  console.error('失败：' + (e && e.message ? e.message : e));
  process.exit(1);
});
