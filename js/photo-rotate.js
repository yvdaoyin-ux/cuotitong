/**
 * photo-rotate.js —— 拍照卡「旋转 90°」的应用编排（第五份任务书 A3）
 *
 * 从 ui-entry-photo.js 拆出（使其回到 ≤400 行），拆分不改任何行为。
 * 职责：给一个图片 id，把它的 blob 顺时针旋转 90° 并重走压缩阶梯（≤200KB）：
 *   - 新拍图（还没入库）：原地替换 blob/尺寸/缩略图，id 不变；
 *   - 已入库旧图：旧 id 进 removed（与删除旧图同规则，要点「保存」才真正生效），
 *     旋转结果作为一张新图顶替它在 draft.imageIds 里的位置。
 * 不直接摸 ui-entry-photo 的内部状态——全部经 ctx 的最小访问面（5 个钩子）。
 * 纯函数部分（computeRotatedSize / rotateBlob）在 image-pipeline.js，测试见 rotate.test.js。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});

  /**
   * @param {string} id 图片 id
   * @param {object} ctx ui-entry-photo 提供的访问面：
   *   findPending(id) → 待提交池条目或 null
   *   isRemoved(id) → boolean
   *   getStore() → ImageStore 或 null
   *   replacePending(p, r) → 原地替换新拍图
   *   replaceStored(oldId, r) → 旧图顶替
   *   onError(msg)
   */
  function rotateOne(id, ctx) {
    function fail(e) {
      ctx.onError('旋转失败：' + (e && e.message ? e.message : e));
    }
    function run(blob, apply) {
      ctx.pipeline().rotateBlob(blob, 90).then(apply).catch(fail);
    }

    var p = ctx.findPending(id);
    if (p) {
      run(p.blob, function (r) { ctx.replacePending(p, r); });
      return;
    }
    if (ctx.isRemoved(id)) return;
    var store = ctx.getStore();
    if (!store || !store.get) return;
    store.get(id).then(function (rec) {
      if (!rec || !rec.blob) return;
      run(rec.blob, function (r) { ctx.replaceStored(id, r); });
    }).catch(fail);
  }

  QT.photoRotate = { rotateOne: rotateOne };
})(typeof globalThis !== 'undefined' ? globalThis : this);
