/**
 * build/set-feedback.js —— 一条命令填入问卷链接并上线
 *
 * 用法：
 *   node build/set-feedback.js "https://wj.qq.com/s2/xxxxx/xxxx/"
 *   node build/set-feedback.js --clear        （清空链接）
 *
 * 它会做四件事：
 *   1. 校验链接格式（必须是 http(s) 开头）
 *   2. 改写 js/config.js 里的 FEEDBACK_URL
 *   3. 重新打包 dist/
 *   4. 提示你手动执行 git 提交与推送（不自动推送，避免误操作）
 *
 * 为什么不自动 git push：推送需要代理、需要网络，失败时的错误信息你未必看得懂。
 * 脚本把能自动的做了，剩下两条命令你贴进去就行。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = path.join(ROOT, 'js', 'config.js');

const arg = process.argv[2];

if (!arg) {
  console.log('用法：');
  console.log('  node build/set-feedback.js "https://wj.qq.com/s2/xxxxx/xxxx/"');
  console.log('  node build/set-feedback.js --clear');
  process.exit(1);
}

/* ---------------- 1. 校验 ---------------- */

let url = '';
if (arg !== '--clear') {
  if (!/^https?:\/\/[^\s"'<>]+$/.test(arg)) {
    console.error('✗ 链接格式不对：必须以 http:// 或 https:// 开头，且不能含空格或引号');
    console.error('  你给的是：' + arg);
    process.exit(1);
  }
  // config.js 里用单引号包裹，链接本身含单引号会破坏文件
  if (arg.indexOf("'") >= 0) {
    console.error('✗ 链接里不能含单引号（会破坏 JS 语法）');
    process.exit(1);
  }
  url = arg;
}

/* ---------------- 2. 改写 config.js ---------------- */

const before = fs.readFileSync(CONFIG, 'utf8');
const pattern = /(FEEDBACK_URL:\s*)(['"])(.*?)\2/;

if (!pattern.test(before)) {
  console.error('✗ 在 js/config.js 里找不到 FEEDBACK_URL 字段');
  console.error('  文件可能被改过，请手动编辑。');
  process.exit(1);
}

const oldMatch = before.match(pattern)[3];
const after = before.replace(pattern, (m, p1, q, old) => p1 + "'" + url + "'");

if (after === before) {
  console.log('· 链接没变化，跳过改写');
} else {
  fs.writeFileSync(CONFIG, after, 'utf8');
  console.log('✓ 已写入 js/config.js');
  console.log('  旧值：' + (oldMatch ? oldMatch : '(空)'));
  console.log('  新值：' + (url ? url : '(空)'));
}

/* ---------------- 3. 重新打包 ---------------- */

console.log('\n正在重新打包 dist/ …');
try {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'build', 'make-dist.js')], {
    cwd: ROOT,
    encoding: 'utf8'
  });
  // 只打印产物那几行，避免刷屏
  out.split('\n').filter(function (l) {
    return /✓|KB|产物|→/.test(l);
  }).forEach(function (l) { console.log('  ' + l.trim()); });
  console.log('✓ 打包完成');
} catch (e) {
  console.error('✗ 打包失败：');
  console.error(e.stdout || e.message);
  process.exit(1);
}

/* ---------------- 4. 提示下一步 ---------------- */

if (!url) {
  console.log('\n已清空问卷链接。设置页会显示「链接待补充」。');
}

console.log('\n' + '='.repeat(54));
console.log('接下来手动执行两条命令把改动推上线：');
console.log('');
console.log('  git add -A');
console.log('  git commit -m "填入反馈问卷链接"');
console.log('  HTTPS_PROXY=http://127.0.0.1:7890 git push origin main');
console.log('');
console.log('（直连常失败，所以用代理；代理只在单条命令内生效，不会残留设置）');
console.log('');
console.log('推送后约 1 分钟，用这条命令确认已生效：');
console.log('  curl -sS https://yvdaoyin-ux.github.io/cuotitong/js/config.js | grep FEEDBACK_URL');
console.log('='.repeat(54));
