/**
 * ui-list.js —— 错题列表：按科目 / 知识点 / 错因筛选
 *
 * 筛选条件放在 hash 里（#/list?subject=calc&reason=calc），
 * 这样刷新、返回都能保持状态，且不需要额外状态管理。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});
  var util = QT.util;

  var PAGE_SIZE = 30;

  function subjectFilterOptions(selected) {
    var out = '<option value="">全部科目</option>';
    QT.data.SUBJECTS.forEach(function (s) {
      out += '<option value="' + util.esc(s.id) + '"' +
        (s.id === selected ? ' selected' : '') + '>' + util.esc(s.name) + '</option>';
    });
    return out;
  }

  /** 知识点下拉：选了科目就只列该科目的 */
  function kpFilterOptions(subject, selected) {
    var list = subject ? QT.storage.kpsBySubject(subject) : QT.storage.allKnowledgePoints();
    var out = '<option value="">全部知识点</option>';
    list.forEach(function (k) {
      out += '<option value="' + util.esc(k.id) + '"' +
        (k.id === selected ? ' selected' : '') + '>' + util.esc(k.name) + '</option>';
    });
    return out;
  }

  function reasonFilterOptions(selected) {
    var out = '<option value="">全部错因</option>';
    QT.data.REASONS.forEach(function (r) {
      out += '<option value="' + util.esc(r.id) + '"' +
        (r.id === selected ? ' selected' : '') + '>' + util.esc(r.name) + '</option>';
    });
    return out;
  }

  function kpNames(kpIds) {
    return (kpIds || []).map(function (id) {
      var kp = QT.storage.kpById(id);
      return kp ? kp.name : '未知知识点';
    });
  }

  function cardHtml(m) {
    var names = kpNames(m.kpIds);
    return '' +
      '<div class="card mcard">' +
        '<div class="mcard__head">' +
          // 示例题必须显式标出来，否则用户会以为是自己录的
          (m.isSample ? '<span class="badge badge--sample">示例</span>' : '') +
          '<span class="badge">' + util.esc(QT.data.subjectName(m.subject)) + '</span>' +
          names.slice(0, 2).map(function (n) {
            return '<span class="badge">' + util.esc(n) + '</span>';
          }).join('') +
          (names.length > 2 ? '<span class="badge">+' + (names.length - 2) + '</span>' : '') +
          (m.reason ? '<span class="badge badge--reason">' + util.esc(QT.data.reasonName(m.reason)) + '</span>' : '') +
        '</div>' +
        '<div class="mcard__text">' + util.renderRichText(util.truncate(m.stem, 160)) + '</div>' +
        '<div class="mcard__meta">' +
          '<span>' + util.esc(util.fmtDate(m.createdAt)) + '</span>' +
          '<span class="mcard__acts">' +
            '<button class="btn btn--sm" data-edit="' + util.esc(m.id) + '">编辑</button>' +
          '</span>' +
        '</div>' +
      '</div>';
  }

  function render(query) {
    query = query || {};
    var filter = {
      subject: query.subject || '',
      kpId: query.kpId || '',
      reason: query.reason || ''
    };
    var shown = Math.min(Number(query.limit) || PAGE_SIZE, 100000);

    var list = QT.storage.listMistakes(filter);
    var total = QT.storage.load().mistakes.length;
    var hasFilter = !!(filter.subject || filter.kpId || filter.reason);

    var header = '' +
      '<h1 class="page-title">错题本</h1>' +
      '<p class="page-sub">共 ' + total + ' 道' +
        (hasFilter ? '，筛选后 ' + list.length + ' 道' : '') + '</p>' +

      '<div class="filters">' +
        '<select class="select" id="f-subject" aria-label="按科目筛选">' +
          subjectFilterOptions(filter.subject) + '</select>' +
        '<select class="select" id="f-reason" aria-label="按错因筛选">' +
          reasonFilterOptions(filter.reason) + '</select>' +
        '<select class="select" id="f-kp" aria-label="按知识点筛选" style="grid-column:1/-1">' +
          kpFilterOptions(filter.subject, filter.kpId) + '</select>' +
        (hasFilter
          ? '<div class="filters__clear"><button class="btn btn--sm" id="clear-filter">清除筛选</button></div>'
          : '') +
      '</div>';

    if (!list.length) {
      return header +
        '<div class="card"><div class="empty">' +
          (total === 0 ? '还没有错题。' : '没有符合筛选条件的错题。') +
          '</div>' +
          (total === 0 ? '<button class="btn btn--primary btn--block" data-go="entry">✏️ 记录第一道错题</button>' : '') +
        '</div>';
    }

    var page = list.slice(0, shown);
    var more = list.length > shown
      ? '<button class="btn btn--block" id="more-btn">再显示 ' +
          Math.min(PAGE_SIZE, list.length - shown) + ' 道（还剩 ' + (list.length - shown) + ' 道）</button>'
      : '';

    return header + page.map(cardHtml).join('') + more;
  }

  function after(el, query) {
    query = query || {};
    var subjectSel = el.querySelector('#f-subject');
    var reasonSel = el.querySelector('#f-reason');
    var kpSel = el.querySelector('#f-kp');

    var apply = function (next) {
      var merged = {
        subject: query.subject || '',
        kpId: query.kpId || '',
        reason: query.reason || '',
        limit: ''
      };
      Object.keys(next).forEach(function (k) { merged[k] = next[k]; });
      QT.app.go('list', merged);
    };

    subjectSel.addEventListener('change', function (ev) {
      // 换科目时知识点筛选清空（否则会出现「高数的科目 + 线代的知识点」这种空结果）
      apply({ subject: ev.target.value, kpId: '' });
    });
    reasonSel.addEventListener('change', function (ev) {
      apply({ reason: ev.target.value });
    });
    kpSel.addEventListener('change', function (ev) {
      apply({ kpId: ev.target.value });
    });

    var clear = el.querySelector('#clear-filter');
    if (clear) clear.addEventListener('click', function () { QT.app.go('list'); });

    var moreBtn = el.querySelector('#more-btn');
    if (moreBtn) {
      moreBtn.addEventListener('click', function () {
        var shown = Math.min(Number(query.limit) || PAGE_SIZE, 100000);
        apply({ limit: shown + PAGE_SIZE });
      });
    }

    el.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-edit]');
      if (!btn) return;
      QT.app.go('entry', { id: btn.getAttribute('data-edit') });
    });
  }

  QT.pages.list = { title: '错题本', render: render, after: after };
})(typeof globalThis !== 'undefined' ? globalThis : this);
