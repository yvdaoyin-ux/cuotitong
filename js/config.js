/**
 * config.js —— 可配置项（部署前在这里改，改完重新打包即可）
 *
 * 单独放一个文件，是为了让「改一个链接」不需要碰任何业务代码。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});

  QT.config = {
    /**
     * 反馈问卷链接（腾讯问卷 / 金数据 / 问卷星等）。
     * 留空时设置页会显示「链接待补充」，**不会**显示一个假链接。
     * 例：'https://wj.qq.com/s2/xxxxx/xxxx/'
     */
    FEEDBACK_URL: '',

    /** 示例数据条数上限（防止示例过大拖慢调试） */
    SAMPLE_LIMIT: 12
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
