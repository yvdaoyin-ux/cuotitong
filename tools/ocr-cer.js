/**
 * ocr-cer.js —— 识别质量的客观指标：字符错误率 CER（第五份任务书 A2）
 *
 * 背景：逐张表的「可直接用/手改 0 处」是用户主观自评，与汇报里指出的识别错误
 * （漏逗号、错字）存在口径差。CER 用「识别原文 vs 用户人工修正后的文本」给出客观刻度：
 *
 *     CER = 编辑距离(识别原文, 修正文本) / 修正文本长度（按 Unicode 码点计）
 *
 * 口径（任务书规定 + 本文件实现约定）：
 *   - 计算前**先把两边的空白全部去掉**（OCR 的换行/空格差异属于版面噪声，不该算错字）；
 *   - 公式里的 `$` 保留，参与计数；
 *   - 修正文本为空、识别原文非空 → CER 记 1（100%）；两者都空 → 0。
 * CLI：node tools/ocr-cer.js <识别原文.txt> <人工修正.txt>
 */
'use strict';

const QT = (globalThis.QT = globalThis.QT || {});

/** 去掉所有空白（空格/换行/制表符全算），返回码点数组。 */
function normalizeToCodePoints(text) {
  const s = String(text == null ? '' : text).replace(/\s+/g, '');
  return Array.from(s); // 按 Unicode 码点拆分，中文/emoji 各算 1
}

/** Levenshtein 编辑距离（两行滚动数组，O(nm) 时间 / O(min) 空间）。 */
function editDistance(aPts, bPts) {
  if (aPts.length === 0) return bPts.length;
  if (bPts.length === 0) return aPts.length;
  let prev = new Array(bPts.length + 1);
  let curr = new Array(bPts.length + 1);
  for (let j = 0; j <= bPts.length; j++) prev[j] = j;
  for (let i = 1; i <= aPts.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= bPts.length; j++) {
      const cost = aPts[i - 1] === bPts[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[bPts.length];
}

/**
 * 计算 CER。
 * @returns {{distance:number, hypLen:number, refLen:number, cer:number}}
 *   hyp = 识别原文，ref = 人工修正文本；cer ∈ [0,1]，ref 空而 hyp 非空时记 1。
 */
function computeCer(hypText, refText) {
  const hyp = normalizeToCodePoints(hypText);
  const ref = normalizeToCodePoints(refText);
  const distance = editDistance(hyp, ref);
  const cer = ref.length === 0 ? (hyp.length === 0 ? 0 : 1) : distance / ref.length;
  return { distance, hypLen: hyp.length, refLen: ref.length, cer };
}

/** CLI：读两个文件，输出 JSON 结果。 */
function main() {
  const fs = require('fs');
  const [hypFile, refFile] = process.argv.slice(2);
  if (!hypFile || !refFile) {
    console.error('用法：node tools/ocr-cer.js <识别原文.txt> <人工修正.txt>');
    process.exit(1);
  }
  const hyp = fs.readFileSync(hypFile, 'utf8');
  const ref = fs.readFileSync(refFile, 'utf8');
  const r = computeCer(hyp, ref);
  console.log(JSON.stringify({
    识别原文去空白后字符数: r.hypLen,
    修正文本去空白后字符数: r.refLen,
    编辑距离: r.distance,
    CER: Number(r.cer.toFixed(4)),
    CER百分比: (r.cer * 100).toFixed(1) + '%'
  }, null, 2));
}

if (require.main === module) main();

QT.ocrCer = { normalizeToCodePoints, editDistance, computeCer };
if (typeof module !== 'undefined' && module.exports) module.exports = QT.ocrCer;
