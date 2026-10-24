/**
 * build/make-dist.js —— 打包脚本：生成「单文件 html」与「离线 zip」
 *
 * 运行：cd 03-错题通 && node build/make-dist.js
 *
 * 产物（都在 dist/）：
 *   1. 错题通-单文件.html   —— 所有 CSS/JS/字体/图表库全部内联，一个文件双击即用
 *   2. 错题通-离线版.zip    —— 完整目录，解压后打开 index.html
 *
 * 为什么要有两种：
 *   微信发单文件最省事（对方点开就能看），但部分手机浏览器对「超大 html」加载慢；
 *   zip 是原样目录，体积小、加载快，但需要解压。两条路都留着。
 *
 * 仅用 Node 内置模块（fs / zlib / path），不需要 npm install。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

/* ============================================================
 * 通用
 * ============================================================ */

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function readBuf(rel) {
  return fs.readFileSync(path.join(ROOT, rel));
}

function fmtKB(n) {
  return (n / 1024).toFixed(0) + ' KB';
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * JS 内联进 <script> 前必须处理 `</script`：
 * 浏览器遇到它会提前结束脚本块（哪怕写在字符串里）。
 * 转义成 <\/script 在 JS 字符串/正则里语义不变，是标准做法。
 */
function escapeScript(js) {
  return js.replace(/<\/script/gi, '<\\/script');
}

/* ============================================================
 * 1. 单文件 html
 * ============================================================ */

/** 把 KaTeX CSS 里的 woff2 字体替换成 base64 data URI，并去掉 ttf/woff 备用项。 */
function inlineKatexCss(css) {
  let out = css;
  const fontDir = path.join(ROOT, 'lib', 'fonts');
  const used = [];

  // 逐个替换 woff2 引用
  out = out.replace(/url\((fonts\/[^)]+\.woff2)\)/g, (m, rel) => {
    const file = path.join(ROOT, 'lib', rel);
    if (!fs.existsSync(file)) {
      console.warn('  ⚠ 缺字体：' + rel);
      return m;
    }
    const b64 = fs.readFileSync(file).toString('base64');
    used.push(rel);
    return 'url(data:font/woff2;base64,' + b64 + ')';
  });

  // 去掉 woff / ttf 备用引用（否则单文件里会指向不存在的文件）
  // 形如： ,url(fonts/X.woff) format("woff")
  out = out.replace(/,url\(fonts\/[^)]+\.(?:woff|ttf)\)\s*format\("(?:woff|truetype)"\)/g, '');

  return { css: out, fontsInlined: used.length };
}

function buildSingleFile() {
  console.log('\n[1/2] 生成单文件 html …');

  let html = read('index.html');
  const stats = { fonts: 0, scripts: 0 };

  // ① KaTeX CSS（含字体）→ <style>
  const katex = inlineKatexCss(read('lib/katex.min.css'));
  stats.fonts = katex.fontsInlined;
  html = html.replace(
    /<link rel="stylesheet" href="lib\/katex\.min\.css">/,
    '<style>\n' + katex.css + '\n</style>'
  );

  // ② 应用 CSS → <style>
  html = html.replace(
    /<link rel="stylesheet" href="css\/app\.css">/,
    '<style>\n' + read('css/app.css') + '\n</style>'
  );

  // ③ 所有 <script src="..."> → 内联
  //    注意顺序必须保持原样，依赖关系靠 index.html 里的顺序保证
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const file = path.join(ROOT, src);
    if (!fs.existsSync(file)) {
      throw new Error('脚本不存在：' + src);
    }
    let js = fs.readFileSync(file, 'utf8');
    stats.scripts += 1;
    return '<script>\n' + escapeScript(js) + '\n</script>';
  });

  // ④ ECharts 是运行时按需加载的（ui-diag.js 里动态插 <script>），
  //    单文件里没有 lib/ 目录，所以内联后 global.echarts 直接可用，
  //    ensureECharts 会看到它已存在而跳过加载。
  const echarts = escapeScript(read('lib/echarts.min.js'));
  html = html.replace(
    '</head>',
    '<script>\n' + echarts + '\n</script>\n</head>'
  );

  // ⑤ 标注这是离线单文件版本，便于出问题时判断来源
  html = html.replace(
    '<title>',
    '<meta name="generator" content="make-dist.js 单文件内联">\n<title>'
  );

  // 注入一段「打不开怎么办」的提示：只在页面渲染后可见。
  // 目的是让同学在微信里点开、看到空白/异常时，第一屏就知道该怎么操作。
  html = html.replace(
    '<body>',
    '<body>\n' +
    '<noscript><div style="padding:16px;font-family:sans-serif;font-size:15px;line-height:1.7">' +
    '<b>需要开启 JavaScript</b><br>这个工具必须在浏览器里运行，请用手机自带的浏览器打开。' +
    '</div></noscript>'
  );

  const outPath = path.join(DIST, '错题通-单文件.html');
  fs.writeFileSync(outPath, html, 'utf8');

  const bytes = Buffer.byteLength(html, 'utf8');
  console.log('  ✓ ' + path.basename(outPath) + '  ' + fmtKB(bytes));
  console.log('    内联脚本 ' + stats.scripts + ' 个，字体 ' + stats.fonts + ' 个');

  // 冒烟检查：不能残留任何外部引用
  const leftovers = [];
  if (/<link rel="stylesheet" href="(?!data:)/.test(html)) leftovers.push('<link> 外链');
  if (/<script src="/.test(html)) leftovers.push('<script src> 外链');
  if (/url\(fonts\//.test(html)) leftovers.push('url(fonts/...) 未替换');
  if (leftovers.length) {
    throw new Error('单文件里仍有外部引用：' + leftovers.join('、'));
  }
  console.log('  ✓ 无外部引用残留');

  return { path: outPath, bytes };
}

/* ============================================================
 * 2. 离线 zip（手写 ZIP 格式，不依赖外部 zip 命令）
 * ============================================================ */

/** CRC32 查表。ZIP 的每个文件都需要它。 */
const CRC_TABLE = (function () {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** 把 UTC 时间转成 DOS 时间格式（ZIP 用）。 */
function dosDateTime(date) {
  const y = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2));
  const dosDate = ((y - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

/**
 * 生成 ZIP。
 * @param {Array<{name:string, data:Buffer}>} entries name 用 / 分隔，UTF-8
 */
function makeZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const now = dosDateTime(new Date());

  entries.forEach((e) => {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data);
    const deflated = zlib.deflateRawSync(e.data, { level: 9 });
    // 压缩反而变大时（小文件常见）就存原始数据
    const useDeflate = deflated.length < e.data.length;
    const body = useDeflate ? deflated : e.data;
    const method = useDeflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // 本地文件头签名
    local.writeUInt16LE(20, 4);           // 解压所需版本
    local.writeUInt16LE(0x0800, 6);       // 通用标志：bit 11 = 文件名 UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(now.dosTime, 10);
    local.writeUInt16LE(now.dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);           // 扩展字段长度

    chunks.push(local, nameBuf, body);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);     // 中央目录签名
    cen.writeUInt16LE(20, 4);             // 创建版本
    cen.writeUInt16LE(20, 6);             // 解压版本
    cen.writeUInt16LE(0x0800, 8);         // 标志：UTF-8
    cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(now.dosTime, 12);
    cen.writeUInt16LE(now.dosDate, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(e.data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);             // 扩展字段
    cen.writeUInt16LE(0, 32);             // 注释
    cen.writeUInt16LE(0, 34);             // 磁盘号
    cen.writeUInt16LE(0, 36);             // 内部属性
    cen.writeUInt32LE(0, 38);             // 外部属性
    cen.writeUInt32LE(offset, 42);        // 本地头偏移

    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  });

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([Buffer.concat(chunks), centralBuf, eocd]);
}

/** 递归收集目录下的文件（相对路径）。 */
function walk(dir, base, out) {
  base = base || dir;
  out = out || [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) {
      walk(full, base, out);
    } else {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  });
  return out;
}

/** 离线包只需要运行所需文件，测试/文档/构建脚本不进包。 */
const ZIP_INCLUDE_DIRS = ['css', 'js', 'lib'];
const ZIP_INCLUDE_FILES = ['index.html'];

const ZIP_README = `错题通 · 离线版
================

怎么用
------
1. 把整个文件夹解压到手机上（或用电脑打开）
2. 用浏览器打开里面的 index.html
3. 微信里点开可能提示"用浏览器打开"，选它即可

数据存在你自己设备的浏览器里，不上传任何服务器。
清理浏览器数据会丢数据，请定期在"设置"里导出备份。

想先看看效果？
设置 → 演示数据 → 载入示例数据（12 道，带示例角标，不会被导出）
试完点"清除示例数据"即可。

反馈
----
用一周后告诉我哪里难用，比夸它有用得多。
`;

function buildZip() {
  console.log('\n[2/2] 生成离线 zip …');
  const entries = [];
  let raw = 0;

  ZIP_INCLUDE_FILES.forEach((f) => {
    const p = path.join(ROOT, f);
    const data = fs.readFileSync(p);
    raw += data.length;
    entries.push({ name: '错题通/' + f, data });
  });

  ZIP_INCLUDE_DIRS.forEach((dir) => {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) return;
    walk(full).forEach((rel) => {
      const data = fs.readFileSync(path.join(full, rel));
      raw += data.length;
      entries.push({ name: '错题通/' + dir + '/' + rel, data });
    });
  });

  entries.push({ name: '错题通/使用说明.txt', data: Buffer.from(ZIP_README, 'utf8') });

  const zip = makeZip(entries);
  const outPath = path.join(DIST, '错题通-离线版.zip');
  fs.writeFileSync(outPath, zip);

  console.log('  ✓ ' + path.basename(outPath) + '  ' + fmtKB(zip.length) +
    '（原始 ' + fmtKB(raw) + '，' + entries.length + ' 个文件）');
  return { path: outPath, bytes: zip.length, count: entries.length };
}

/* ============================================================
 * 主流程
 * ============================================================ */

function main() {
  ensureDir(DIST);
  const single = buildSingleFile();
  const zip = buildZip();

  console.log('\n' + '='.repeat(52));
  console.log('产物：');
  console.log('  dist/' + path.basename(single.path) + '  ' + fmtKB(single.bytes));
  console.log('    → 单个文件，双击用浏览器打开即可');
  console.log('  dist/' + path.basename(zip.path) + '  ' + fmtKB(zip.bytes));
  console.log('    → 解压后打开 index.html');
  console.log('='.repeat(52));

  if (single.bytes > 4 * 1024 * 1024) {
    console.warn('\n⚠ 单文件已超过 4 MB，微信传输可能受限');
  }
}

main();
