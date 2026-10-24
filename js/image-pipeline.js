/**
 * image-pipeline.js —— 拍照图片的压缩管线
 *
 * 分两层：
 * 1. 纯函数（可在 Node 里测试）：目标尺寸计算、质量阶梯、base64 体积估算。
 *    「怎么算」与「怎么画」分离——算的部分错了测试能抓到，画的部分只能在浏览器实测。
 * 2. 浏览器函数 compressFile(file)：解码 → 缩放 → 逐档质量压 JPEG，直到 ≤200KB 或降到 0.5。
 *
 * 任务书第 3.1 节的要求：
 *   - 长边 ≤1280px；JPEG 质量 0.72，若仍 >200KB 逐步降到 0.5
 *   - createImageBitmap(file, {imageOrientation:'from-image'}) 处理朝向，
 *     不支持时退化到 <img> + canvas
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});

  /* ---------------- 常量 ---------------- */

  var MAX_EDGE = 1280;          // 长边上限（px）
  var SIZE_LIMIT = 200 * 1024;  // 压缩目标（字节）：200KB
  var QUALITY_START = 0.72;     // 起始质量
  var QUALITY_FLOOR = 0.5;      // 最低质量（任务书：逐步降到 0.5）
  var QUALITY_STEP = 0.11;      // 每档降幅：0.72 → 0.61 → 0.50
  var MAX_PER_MISTAKE = 3;      // 每题最多几张

  /* ---------------- 纯函数（Node 可测） ---------------- */

  /**
   * 计算缩放后的目标尺寸，保持长宽比，只缩小不放大。
   * @returns {{w:number,h:number}|null} 入参不合法（非正数/NaN）时返回 null
   */
  function computeTargetSize(w, h, maxEdge) {
    maxEdge = maxEdge || MAX_EDGE;
    w = Number(w); h = Number(h);
    if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return null;
    var scale = Math.min(1, maxEdge / Math.max(w, h));
    return {
      w: Math.max(1, Math.round(w * scale)),
      h: Math.max(1, Math.round(h * scale))
    };
  }

  /**
   * 质量阶梯：从 start 每次降 step，直到 floor（floor 本身必含）。
   * 默认 [0.72, 0.61, 0.5]。逐档降而不是一步到 0.5，是为了尽量保住清晰度。
   */
  function qualitySequence(start, floor, step) {
    start = typeof start === 'number' ? start : QUALITY_START;
    floor = typeof floor === 'number' ? floor : QUALITY_FLOOR;
    step = typeof step === 'number' && step > 0 ? step : QUALITY_STEP;
    var out = [];
    var q = start;
    var guard = 0;
    while (q > floor + 1e-9 && guard < 100) {
      out.push(Math.round(q * 100) / 100);
      q -= step;
      guard += 1;
    }
    out.push(floor);
    return out;
  }

  /** 是否超过压缩目标体积。 */
  function overSize(bytes, limit) {
    return Number(bytes) > (limit || SIZE_LIMIT);
  }

  /**
   * base64 后的体积估算（不含 dataURL 头部）。
   * 用途：含图片备份在真正生成前先预估，超 20MB 提前警告，避免卡死浏览器。
   */
  function base64SizeOf(byteLength) {
    var n = Number(byteLength);
    if (!isFinite(n) || n < 0) return 0;
    return Math.ceil(n / 3) * 4;
  }

  /* ---------------- 浏览器部分（Node 里不会被调用） ---------------- */

  /** 把 toBlob 包成 Promise。 */
  function canvasToBlob(canvas, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob); else reject(new Error('canvas.toBlob 返回空'));
      }, 'image/jpeg', quality);
    });
  }

  /**
   * 解码图片文件。
   * 优先 createImageBitmap + imageOrientation:'from-image'（相机拍的 JPEG 带方向信息，
   * 不处理会横竖颠倒）；不支持时退化到 <img> 解码（现代浏览器 <img> 默认按 EXIF 显示）。
   * 返回 { source, width, height, close() }，close() 释放位图资源。
   */
  function decodeFile(file) {
    return new Promise(function (resolve, reject) {
      if (typeof global.createImageBitmap === 'function') {
        global.createImageBitmap(file, { imageOrientation: 'from-image' })
          .then(function (bmp) {
            resolve({
              source: bmp,
              width: bmp.width,
              height: bmp.height,
              close: function () { if (typeof bmp.close === 'function') bmp.close(); }
            });
          })
          .catch(function () { fallbackDecode(file).then(resolve, reject); });
        return;
      }
      fallbackDecode(file).then(resolve, reject);
    });
  }

  /** <img> + objectURL 的兜底解码。 */
  function fallbackDecode(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        resolve({
          source: img,
          width: img.naturalWidth,
          height: img.naturalHeight,
          close: function () { URL.revokeObjectURL(url); }
        });
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('图片无法解码（可能不是支持的图片格式）'));
      };
      img.src = url;
    });
  }

  /**
   * 压缩一个图片文件。
   * @param {File|Blob} file
   * @param {object} [opts] { maxEdge, sizeLimit, quality, minQuality, qualityStep }
   * @returns {Promise<{blob:Blob, w:number, h:number, quality:number}>}
   */
  function compressFile(file, opts) {
    opts = opts || {};
    var maxEdge = opts.maxEdge || MAX_EDGE;
    var limit = opts.sizeLimit || SIZE_LIMIT;
    var ladder = qualitySequence(opts.quality, opts.minQuality, opts.qualityStep);

    return decodeFile(file).then(function (dec) {
      try {
        var target = computeTargetSize(dec.width, dec.height, maxEdge);
        if (!target) throw new Error('图片尺寸异常');
        var canvas = document.createElement('canvas');
        canvas.width = target.w;
        canvas.height = target.h;
        var ctx = canvas.getContext('2d');
        // JPEG 无透明通道，白底填充防止透明区域变黑
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, target.w, target.h);
        ctx.drawImage(dec.source, 0, 0, target.w, target.h);

        // 逐档质量尝试：一旦 ≤200KB 就用当前档；到最低档无论多大都用它
        var attempt = function (i) {
          var q = ladder[Math.min(i, ladder.length - 1)];
          return canvasToBlob(canvas, q).then(function (blob) {
            if (!overSize(blob.size, limit) || i >= ladder.length - 1) {
              return { blob: blob, w: target.w, h: target.h, quality: q };
            }
            return attempt(i + 1);
          });
        };
        return attempt(0);
      } finally {
        dec.close();
      }
    });
  }

  QT.imagePipeline = {
    MAX_EDGE: MAX_EDGE,
    SIZE_LIMIT: SIZE_LIMIT,
    QUALITY_START: QUALITY_START,
    QUALITY_FLOOR: QUALITY_FLOOR,
    QUALITY_STEP: QUALITY_STEP,
    MAX_PER_MISTAKE: MAX_PER_MISTAKE,
    computeTargetSize: computeTargetSize,
    qualitySequence: qualitySequence,
    overSize: overSize,
    base64SizeOf: base64SizeOf,
    compressFile: compressFile
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
