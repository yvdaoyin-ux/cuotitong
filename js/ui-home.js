/**
 * ui-home.js —— 主页：今日复习 + 概览 + 最薄弱知识点 + 快捷入口
 *
 * 「待复习」的口径只认 stats.buildReviewQueue：它按错题逐条算出到期程度。
 * 早期版本另用「知识点留存率 < 0.8」计数，会出现「主页说 3 个待复习、
 * 点进去队列却是空的」这种自相矛盾，故统一为一处计算。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});
  var util = QT.util;

  var REVIEW_LIMIT = 10;

  function overview() {
    var db = QT.storage.load();
    var now = util.nowIso();
    var states = QT.stats.computeStates(db.mistakes, db.answers, now);

    var kpIds = Object.keys(states);
    var weak = [];

    kpIds.forEach(function (kpId) {
      var st = states[kpId];
      var kp = QT.storage.kpById(kpId);
      if (!kp || st.n === 0) return;
      weak.push({
        kpId: kpId,
        name: kp.name,
        subject: kp.subject,
        mastery: st.mastery,
        low: st.low,
        high: st.high,
        n: st.n,
        sufficient: st.sufficient
      });
    });
    weak.sort(function (a, b) { return a.mastery - b.mastery; });

    var queue = QT.stats.buildReviewQueue(db.mistakes, db.answers, now, { limit: REVIEW_LIMIT });

    return {
      mistakeCount: db.mistakes.length,
      answerCount: db.answers.length,
      kpCount: kpIds.length,
      dueCount: queue.length,
      queue: queue,
      weak: weak.slice(0, 3)
    };
  }

  /** 品牌头（U1）：logo 图形 + 名称。 */
  function brandHead() {
    return '<header class="home-brand">' +
      '<svg class="ic home-brand__logo" aria-hidden="true"><use href="#i-logo"/></svg>' +
      '<div><div class="home-brand__name">错题通</div>' +
      '<div class="home-brand__sub">错题本 · 薄弱点诊断 · 智能组卷</div></div>' +
      '</header>';
  }

  /** 今日复习主角卡（U1）：大数字 + 最多 3 条预览 + 满宽主按钮；无到期时空状态。 */
  function reviewHero(o) {
    if (!o.mistakeCount) return '';
    if (!o.queue.length) {
      return '<div class="card home-hero">' +
        '<div class="label">今日复习</div>' +
        '<div class="home-hero__row home-hero__row--none">' +
          '<svg class="ic" aria-hidden="true"><use href="#i-check"/></svg>' +
          '<div><div class="home-hero__none">没有到期的题</div>' +
          '<div class="muted" style="font-size:14px">刚做过的题要过一阵子才重新出现（避免短时重复记忆）。</div></div>' +
        '</div>' +
        '<button class="btn btn--primary btn--block" data-go="entry">再录一道错题</button>' +
      '</div>';
    }
    return '<div class="card home-hero">' +
      '<div class="home-hero__top"><span class="label">今日复习</span></div>' +
      '<div class="home-hero__stat"><span class="home-hero__num">' + o.queue.length + '</span>' +
        '<span class="home-hero__due">道到期</span></div>' +
      o.queue.slice(0, 3).map(function (r, i) {
        var names = r.kpIds.map(function (id) {
          var kp = QT.storage.kpById(id);
          return kp ? kp.name : '未知';
        });
        return '<div class="home-hero__item">' +
          '<span class="muted home-hero__idx">' + (i + 1) + '</span>' +
          '<span class="home-hero__stem">' + util.renderRichText(util.truncate(r.mistake.stem || names.join('、'), 60)) + '</span>' +
        '</div>';
      }).join('') +
      '<button class="btn btn--primary btn--block" id="start-review">开始复习（' + o.queue.length + ' 道）</button>' +
    '</div>';
  }

  /** 三快捷入口（U1）：拍照录题 / 组卷练习 / 薄弱点诊断。 */
  function quickLinks() {
    return '<div class="home-quick">' +
      '<button class="home-quick__item" data-go="entry">' +
        '<span class="home-quick__icon"><svg class="ic" aria-hidden="true"><use href="#i-camera"/></svg></span>' +
        '<span>拍照录题</span></button>' +
      '<button class="home-quick__item" data-go="quiz">' +
        '<span class="home-quick__icon"><svg class="ic" aria-hidden="true"><use href="#i-target"/></svg></span>' +
        '<span>组卷练习</span></button>' +
      '<button class="home-quick__item" data-go="diag">' +
        '<span class="home-quick__icon"><svg class="ic" aria-hidden="true"><use href="#i-chart"/></svg></span>' +
        '<span>薄弱点诊断</span></button>' +
    '</div>';
  }

  /** 轻统计行（U1）：一行文字，不再用大卡片。 */
  function statLine(o) {
    return '<div class="home-stat"><span>错题 ' + o.mistakeCount +
      ' · 涉及知识点 ' + o.kpCount +
      ' · 累计作答 ' + o.answerCount + '</span>' +
      '<button class="home-stat__print" data-go="print">打印练习卷</button></div>';
  }

  /** 复习卡：展示前几条到期错题，一键开练。 */
  function reviewCard(o) {
    if (!o.mistakeCount) return '';
    return reviewHero(o);
  }

  function render() {
    var o = overview();

    if (o.mistakeCount === 0) {
      return '' +
        brandHead() +
        '<div class="card">' +
          '<div class="placeholder">' +
            '<div class="placeholder__title">还没有记录过错题</div>' +
            '<div>先记下第一道错题；或者先载入示例数据，看看诊断和组卷长什么样。</div>' +
          '</div>' +
          '<button class="btn btn--primary btn--block" data-go="entry">记录第一道错题</button>' +
          '<p style="margin:10px 0 0">' +
            '<button class="btn btn--block" id="home-load-sample">先载入示例数据看看（12 道）</button>' +
          '</p>' +
          '<div class="hint">示例题带「示例」角标，不会被导出；试完可在设置里一键清除。</div>' +
        '</div>' +
        '<div class="card">' +
          '<div class="label">这个工具会做什么</div>' +
          '<ul class="muted" style="padding-left:18px;margin:0">' +
            '<li>录入错题，标出知识点和错因</li>' +
            '<li>用贝叶斯平滑估算每个知识点的掌握度（附 95% 可信区间）</li>' +
            '<li>按遗忘曲线挑出最该复习的题，自动组卷</li>' +
          '</ul>' +
        '</div>';
    }

    var weakHtml = '';
    if (o.weak.length) {
      weakHtml = '<div class="card">' +
        '<div class="label">最薄弱的 ' + o.weak.length + ' 个知识点</div>' +
        o.weak.map(function (w) {
          var value = w.sufficient
            ? '<strong class="num">' + Math.round(w.mastery * 100) + '%</strong>' +
              '<div class="muted" style="font-size:14px">' +
                Math.round(w.low * 100) + '%–' + Math.round(w.high * 100) + '%</div>'
            : '<span class="muted">数据不足</span>' +
              '<div class="muted" style="font-size:14px">样本 ' + w.n + '/' +
                QT.stats.CONFIG.minSamples + '</div>';
          return '<div style="display:flex;justify-content:space-between;align-items:center;' +
              'gap:8px;padding:8px 0;border-bottom:1px solid var(--line)">' +
            '<div><div>' + util.esc(w.name) + '</div>' +
              '<div class="muted" style="font-size:14px">' +
                util.esc(QT.data.subjectName(w.subject)) + ' · ' + w.n + ' 次作答</div></div>' +
            '<div style="text-align:right;white-space:nowrap">' + value + '</div>' +
          '</div>';
        }).join('') +
        '<p style="margin:10px 0 0"><button class="btn btn--sm" data-go="diag">查看完整诊断</button></p>' +
        '</div>';
    }

    return '' +
      brandHead() +
      reviewHero(o) +
      quickLinks() +
      statLine(o) +
      weakHtml +
      '<div class="card">' +
        '<div class="label">数据在你自己手里</div>' +
        '<p class="muted" style="margin:0 0 10px">全部数据只存在这台设备的浏览器里，不上传任何服务器。' +
        '换设备前请先在「设置」里导出备份。</p>' +
        '<button class="btn btn--sm" data-go="settings">设置与备份</button>' +
      '</div>';
  }

  /**
   * 首页的事件绑定。
   * 「开始复习」把队列里的题目 id 交给组卷页的 paper 阶段：
   * 复习与组卷的作答界面相同，只是 kind 不同（复习记 'review'，便于报告里区分两类使用场景）。
   */
  function after(el) {
    // —— 空库时首页的「载入示例数据」——
    // 注意：这个分支必须写在复习按钮的早返回之前，否则空库页永远绑不上事件
    var sampleBtn = el.querySelector('#home-load-sample');
    if (sampleBtn) {
      sampleBtn.addEventListener('click', function () {
        var r = QT.sampleData.load();
        if (!r.added) {
          util.toast('载入失败：没有匹配到知识点', 'error');
          return;
        }
        util.toast('已载入 ' + r.added + ' 道示例题，去诊断页看看效果吧');
        QT.app.go('diag');
      });
    }

    var btn = el.querySelector('#start-review');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var o = overview();
      if (!o.queue.length) {
        util.toast('暂时没有到期的题');
        return;
      }
      QT.storage.logEvent('review_start', { count: o.queue.length });
      QT.app.go('quiz', {
        stage: 'paper',
        mode: 'review',
        ids: o.queue.map(function (r) { return r.mistake.id; }).join(',')
      });
    });
  }

  QT.pages.home = { title: '主页', render: render, after: after };
})(typeof globalThis !== 'undefined' ? globalThis : this);
