/**
 * ui-entry.js —— 录题 / 编辑错题
 *
 * 路由：#/entry            新增
 *       #/entry?id=xxx     编辑
 *
 * 知识点是多选（一道题可能同时考两章），错因是单选。
 * 知识点列表随科目切换重渲染，已选中的保持选中。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});
  var util = QT.util;

  /** 页面内的临时状态。每次 render 重建，不跨页面泄漏。 */
  var draft = null;

  function newDraft() {
    return { id: null, subject: QT.data.SUBJECTS[0].id, kpIds: [], reason: '' };
  }

  function draftFrom(m) {
    return {
      id: m.id,
      subject: m.subject || QT.data.SUBJECTS[0].id,
      kpIds: (m.kpIds || []).slice(),
      reason: m.reason || ''
    };
  }

  function kpChipsHtml(subject, selected) {
    var list = QT.storage.kpsBySubject(subject);
    if (!list.length) {
      return '<div class="muted">这个科目还没有知识点，可在下方新增。</div>';
    }
    return list.map(function (k) {
      var on = selected.indexOf(k.id) >= 0 ? ' chip--on' : '';
      return '<button type="button" class="chip' + on + '" data-kp="' + util.esc(k.id) + '"' +
        ' aria-pressed="' + (on ? 'true' : 'false') + '">' + util.esc(k.name) + '</button>';
    }).join('');
  }

  function reasonChipsHtml(selected) {
    return QT.data.REASONS.map(function (r) {
      var on = selected === r.id ? ' chip--on' : '';
      return '<button type="button" class="chip' + on + '" data-reason="' + util.esc(r.id) + '"' +
        ' aria-pressed="' + (on ? 'true' : 'false') + '">' + util.esc(r.name) + '</button>';
    }).join('');
  }

  function subjectOptions(selected) {
    return QT.data.SUBJECTS.map(function (s) {
      return '<option value="' + util.esc(s.id) + '"' +
        (s.id === selected ? ' selected' : '') + '>' + util.esc(s.name) + '</option>';
    }).join('');
  }

  function render(query) {
    var editing = null;
    if (query && query.id) {
      editing = QT.storage.getMistake(query.id);
      if (!editing) {
        return '<div class="card"><div class="placeholder__title">错题不存在</div>' +
          '<p class="muted">可能已被删除。</p>' +
          '<button class="btn btn--sm" data-go="list">返回错题本</button></div>';
      }
    }
    draft = editing ? draftFrom(editing) : newDraft();

    return '' +
      '<h1 class="page-title">' + (editing ? '编辑错题' : '记录错题') + '</h1>' +
      '<p class="page-sub">只有题干必填，其余可留空以后再补。</p>' +

      '<form id="entry-form" novalidate>' +

        '<div class="card">' +
          '<div class="field">' +
            '<label class="label" for="f-subject">科目</label>' +
            '<select class="select" id="f-subject">' + subjectOptions(draft.subject) + '</select>' +
          '</div>' +

          '<div class="field" style="margin-bottom:0">' +
            '<div class="label">知识点<span class="req">*</span></div>' +
            '<div class="chips" id="kp-chips">' + kpChipsHtml(draft.subject, draft.kpIds) + '</div>' +
            '<div style="display:flex;gap:8px;margin-top:10px">' +
              '<input class="input" id="new-kp" placeholder="新增知识点，如「格林公式」" ' +
                'maxlength="30" style="min-height:40px">' +
              '<button type="button" class="btn btn--sm" id="add-kp">添加</button>' +
            '</div>' +
            '<div class="hint">可多选：一道题同时考几章时都勾上，诊断会更准。</div>' +
          '</div>' +
        '</div>' +

        '<div class="card">' +
          '<div class="field">' +
            '<label class="label" for="f-stem">题干<span class="req">*</span></label>' +
            '<textarea class="textarea" id="f-stem" placeholder="文字即可，公式用 $...$ 包起来，例如 $\\int_0^1 x^2 dx$" ' +
              'required>' + util.esc(editing ? editing.stem : '') + '</textarea>' +
          '</div>' +
          '<div class="field">' +
            '<label class="label" for="f-my">我的答案</label>' +
            '<textarea class="textarea" id="f-my" style="min-height:64px" ' +
              'placeholder="当时写的答案（可留空）">' + util.esc(editing ? editing.myAnswer : '') + '</textarea>' +
          '</div>' +
          '<div class="field" style="margin-bottom:0">' +
            '<label class="label" for="f-correct">正确答案 / 解析</label>' +
            '<textarea class="textarea" id="f-correct" placeholder="正确答案或解题思路（可留空）">' +
              util.esc(editing ? editing.correctAnswer : '') + '</textarea>' +
          '</div>' +
        '</div>' +

        '<div class="card">' +
          '<div class="label">错因</div>' +
          '<div class="chips" id="reason-chips">' + reasonChipsHtml(draft.reason) + '</div>' +
          '<div class="hint">选最主要的一个原因。诊断页会按错因统计你的失分模式。</div>' +
        '</div>' +

        '<div class="card" style="display:grid;gap:8px">' +
          '<button type="submit" class="btn btn--primary btn--block">' +
            (editing ? '保存修改' : '保存错题') + '</button>' +
          (editing
            ? '<button type="button" class="btn btn--danger btn--block" id="del-btn">删除这道题</button>'
            : '') +
        '</div>' +

      '</form>';
  }

  function after(el) {
    var form = el.querySelector('#entry-form');
    if (!form) return;

    var kpBox = el.querySelector('#kp-chips');

    // 科目切换 → 重建知识点列表（已选但不在新科目下的自动丢弃）
    form.querySelector('#f-subject').addEventListener('change', function (ev) {
      draft.subject = ev.target.value;
      var valid = QT.storage.kpsBySubject(draft.subject).map(function (k) { return k.id; });
      draft.kpIds = draft.kpIds.filter(function (id) { return valid.indexOf(id) >= 0; });
      kpBox.innerHTML = kpChipsHtml(draft.subject, draft.kpIds);
    });

    // 知识点多选（事件委托）
    kpBox.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-kp]');
      if (!btn) return;
      var id = btn.getAttribute('data-kp');
      var i = draft.kpIds.indexOf(id);
      if (i >= 0) draft.kpIds.splice(i, 1); else draft.kpIds.push(id);
      btn.classList.toggle('chip--on');
      btn.setAttribute('aria-pressed', btn.classList.contains('chip--on') ? 'true' : 'false');
    });

    // 新增知识点
    var addKp = function () {
      var inp = el.querySelector('#new-kp');
      var name = String(inp.value || '').trim();
      if (!name) return;
      try {
        var kp = QT.storage.addKnowledgePoint(draft.subject, name);
        if (draft.kpIds.indexOf(kp.id) < 0) draft.kpIds.push(kp.id);
        kpBox.innerHTML = kpChipsHtml(draft.subject, draft.kpIds);
        inp.value = '';
        util.toast('已添加知识点「' + kp.name + '」');
      } catch (e) {
        util.toast(e.message || '添加失败', 'error');
      }
    };
    el.querySelector('#add-kp').addEventListener('click', addKp);
    el.querySelector('#new-kp').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); addKp(); }
    });

    // 错因单选
    var reasonBox = el.querySelector('#reason-chips');
    reasonBox.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-reason]');
      if (!btn) return;
      var id = btn.getAttribute('data-reason');
      draft.reason = draft.reason === id ? '' : id; // 再点一次取消
      reasonBox.innerHTML = reasonChipsHtml(draft.reason);
    });

    // 提交
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var payload = {
        subject: draft.subject,
        kpIds: draft.kpIds.slice(),
        stem: el.querySelector('#f-stem').value,
        myAnswer: el.querySelector('#f-my').value,
        correctAnswer: el.querySelector('#f-correct').value,
        reason: draft.reason
      };
      try {
        if (draft.id) {
          QT.storage.updateMistake(draft.id, payload);
          QT.storage.logEvent('mistake_update', { id: draft.id });
          util.toast('已保存修改');
          QT.app.go('list');
        } else {
          var m = QT.storage.addMistake(payload);
          QT.storage.logEvent('mistake_add', { subject: m.subject, kpCount: m.kpIds.length });
          util.toast('已存入错题本');
          QT.app.go('list');
        }
      } catch (e) {
        util.toast(e.message || '保存失败', 'error');
      }
    });

    // 删除
    var del = el.querySelector('#del-btn');
    if (del) {
      del.addEventListener('click', function () {
        if (!global.confirm('删除后，这道题产生的作答记录也会一并删除，知识点掌握度会重算。确定删除？')) return;
        QT.storage.deleteMistake(draft.id);
        QT.storage.logEvent('mistake_delete', { id: draft.id });
        util.toast('已删除');
        QT.app.go('list');
      });
    }
  }

  QT.pages.entry = { title: '录错题', render: render, after: after };
})(typeof globalThis !== 'undefined' ? globalThis : this);
