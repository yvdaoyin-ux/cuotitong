/**
 * ui-print.js —— 打印友好页
 *
 * 任务书要求：提供打印友好页面（浏览器打印即可存 PDF，**不要引入 PDF 库**）。
 * 所以这里只做两件事：把页面排版成 A4 友好的样子 + 调 window.print()。
 *
 * 路由：
 *   #/print?subject=matan&size=10&withAnswer=1   按科目抽题后打印
 *   #/print?ids=a,b,c&withAnswer=1               按指定题目打印（组卷结果页跳转用）
 *
 * 打印时用 @media print 隐藏标签栏、按钮等一切非纸张元素（见 css/app.css）。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});
  var util = QT.util;

  function parseIds(str) {
    return String(str || '').split(',').filter(Boolean);
  }

  /** 取要打印的题目：优先按 ids，否则按科目抽样。 */
  function pickProblems(query) {
    var db = QT.storage.load();
    var byId = {};
    db.mistakes.forEach(function (m) { byId[m.id] = m; });

    var ids = parseIds(query.ids);
    if (ids.length) {
      return ids.map(function (id) { return byId[id]; }).filter(Boolean);
    }

    var subject = query.subject || QT.data.SUBJECTS[0].id;
    var size = Number(query.size) || 10;
    var now = util.nowIso();
    var states = QT.stats.computeStates(db.mistakes, db.answers, now);
    var pool = db.mistakes.filter(function (m) { return m.subject === subject; });
    var candidates = QT.stats.buildCandidates(pool, states);
    return QT.stats.weightedSample(candidates, size)
      .map(function (c) { return byId[c.id]; })
      .filter(Boolean);
  }

  function kpNames(kpIds) {
    return (kpIds || []).map(function (id) {
      var kp = QT.storage.kpById(id);
      return kp ? kp.name : '';
    }).filter(Boolean);
  }

  function subjectOptions(selected) {
    return QT.data.SUBJECTS.map(function (s) {
      return '<option value="' + util.esc(s.id) + '"' +
        (s.id === selected ? ' selected' : '') + '>' + util.esc(s.name) + '</option>';
    }).join('');
  }

  /** 单道题的打印排版：题号 + 题干（可空时用来源）+ 图片 + 留白。 */
  function problemHtml(m, i, withAnswer) {
    var names = kpNames(m.kpIds);
    // v3：题干可空（拍照录题的题），打印时空题干印出来源行；图片是题目本体，必须印
    var stemHtml = m.stem
      ? util.renderRichText(m.stem)
      : (m.source
        ? '<div class="print-item__source">来源：' + util.esc(m.source) + '（题干见图片）</div>'
        : '<div class="print-item__source">（本题没有题干文字）</div>');
    var imgsHtml = (m.imageIds && m.imageIds.length)
      ? '<div class="print-item__imgs" data-img-ids="' + util.esc(m.imageIds.join(',')) + '"></div>'
      : '';
    return '' +
      '<div class="print-item">' +
        '<div class="print-item__head">' +
          '<span class="print-item__no">' + (i + 1) + '.</span>' +
          '<span class="print-item__kp">' + util.esc(names.join('、')) + '</span>' +
        '</div>' +
        '<div class="print-item__stem">' + stemHtml + '</div>' +
        imgsHtml +
        '<div class="print-item__space"></div>' +
        (withAnswer
          ? '<div class="print-item__answer">' +
              '<strong>答案：</strong>' +
              (m.correctAnswer ? util.renderRichText(m.correctAnswer) : '<span class="muted">（未填写）</span>') +
              (m.myAnswer
                ? '<div class="print-item__mine"><strong>当时的错误答案：</strong>' +
                  util.renderRichText(m.myAnswer) + '</div>'
                : '') +
            '</div>'
          : '') +
      '</div>';
  }

  function render(query) {
    query = query || {};
    var withAnswer = query.withAnswer === '1';
    var problems = pickProblems(query);
    var db = QT.storage.load();

    var subject = query.subject || QT.data.SUBJECTS[0].id;
    var size = Number(query.size) || 10;

    var head = '' +
      '<h1 class="page-title no-print">打印练习卷</h1>' +
      '<p class="page-sub no-print">排版按 A4 设计。点「打印」后，在系统对话框里选「另存为 PDF」即可。</p>' +

      '<div class="card no-print">' +
        '<div class="filters" style="margin:0">' +
          '<select class="select" id="p-subject">' + subjectOptions(subject) + '</select>' +
          '<select class="select" id="p-size">' +
            QT.stats.CONFIG.quizSizes.map(function (n) {
              return '<option value="' + n + '"' + (n === size ? ' selected' : '') + '>' +
                n + ' 道</option>';
            }).join('') +
          '</select>' +
        '</div>' +
        '<label class="print-opt">' +
          '<input type="checkbox" id="p-answer"' + (withAnswer ? ' checked' : '') + '>' +
          '<span>附答案与解析（会另起一页）</span>' +
        '</label>' +
        '<div style="display:grid;gap:8px;margin-top:12px">' +
          '<button class="btn btn--primary btn--block" id="p-print">🖨️ 打印 / 存为 PDF</button>' +
          '<button class="btn btn--block" id="p-regen">🔄 重新抽题</button>' +
        '</div>' +
        '<div class="hint">该科目下现有 ' +
          db.mistakes.filter(function (m) { return m.subject === subject; }).length +
          ' 道错题。打印卷只含题目，不含你的作答记录。</div>' +
      '</div>';

    if (!db.mistakes.length) {
      return head + '<div class="card"><div class="empty">还没有错题，无法生成练习卷。</div>' +
        '<button class="btn btn--sm btn--block" data-go="entry">✏️ 去录题</button></div>';
    }
    if (!problems.length) {
      return head + '<div class="card"><div class="empty">这个科目下还没有错题。</div></div>';
    }

    // —— 以下为实际被打印的内容 ——
    var paperHtml = '' +
      '<div class="print-sheet">' +
        '<div class="print-head">' +
          '<div class="print-head__title">' + util.esc(QT.data.subjectName(subject)) +
            ' · 错题重做卷</div>' +
          '<div class="print-head__meta">' +
            '共 ' + problems.length + ' 题 · ' + util.fmtDate(util.nowIso()) +
            ' · 姓名：__________　得分：______' +
          '</div>' +
        '</div>' +
        problems.map(function (m, i) { return problemHtml(m, i, false); }).join('') +
      '</div>';

    var answerHtml = withAnswer
      ? '<div class="print-sheet print-sheet--answer">' +
          '<div class="print-head">' +
            '<div class="print-head__title">答案解析</div>' +
          '</div>' +
          problems.map(function (m, i) { return problemHtml(m, i, true); }).join('') +
        '</div>'
      : '';

    return head + paperHtml + answerHtml;
  }

  function after(el, query) {
    query = query || {};
    var subject = query.subject || QT.data.SUBJECTS[0].id;
    var size = Number(query.size) || 10;
    var withAnswer = query.withAnswer === '1';

    var subjSel = el.querySelector('#p-subject');
    var sizeSel = el.querySelector('#p-size');
    var ansBox = el.querySelector('#p-answer');
    if (!subjSel) return; // 空库时没有这些控件

    // 打印卷上的题目图片异步注水
    if (QT.imageView) QT.imageView.hydrate(el);

    subjSel.addEventListener('change', function (ev) {
      QT.app.go('print', { subject: ev.target.value, size: size, withAnswer: withAnswer ? '1' : '' });
    });
    sizeSel.addEventListener('change', function (ev) {
      QT.app.go('print', { subject: subject, size: ev.target.value, withAnswer: withAnswer ? '1' : '' });
    });
    ansBox.addEventListener('change', function (ev) {
      QT.app.go('print', {
        subject: subject, size: size, withAnswer: ev.target.checked ? '1' : ''
      });
    });

    el.querySelector('#p-print').addEventListener('click', function () {
      QT.storage.logEvent('print_sheet', { subject: subject, size: size });
      // 打印前把标题改成卷名，打印出来的 PDF 文件名会用它
      var oldTitle = document.title;
      document.title = QT.data.subjectName(subject) + '-错题重做卷';
      global.print();
      // Chrome 会在 print() 返回后恢复，其它浏览器不会，故延时还原
      setTimeout(function () { document.title = oldTitle; }, 1000);
    });

    el.querySelector('#p-regen').addEventListener('click', function () {
      QT.app.go('print', { subject: subject, size: size, withAnswer: withAnswer ? '1' : '' });
    });
  }

  QT.pages.print = {
    title: '打印',
    render: render,
    after: after,
    dispose: function () { if (QT.imageView) QT.imageView.revokeAll(); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
