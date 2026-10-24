/**
 * ui-entry.js —— 录题 / 编辑错题
 *
 * 路由：#/entry            新增（默认极速模式）
 *       #/entry?id=xxx     编辑（默认完整模式，Claude 第二份任务书明确要求）
 *
 * 极速模式 vs 完整模式：
 *   - 极速：来源 + 知识点 + 错因 + 保存。题干/答案/解析收进「展开详细填写」折叠区。
 *   - 完整：题干 + 我的答案 + 解析全展开。
 *   两者共用同一套数据结构，只是布局与默认展开状态不同。
 *
 * 校验规则（v3）：知识点 ≥1，且（题干 / 来源 / 图片至少一项非空）。
 * 三项全空 → 不保存，来源框下方红字提示，焦点移到来源框（Claude 裁定，不用 toast）。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});
  var util = QT.util;

  /** 页面内的临时状态。每次 render 重建，不跨页面泄漏。 */
  var draft = null;
  var isEditing = false;

  /* ---------------- 最近使用（界面偏好，单独 localStorage 键，不进业务数据） ---------------- */
  var RECENT_KEY = 'qt:recentKps';

  function loadRecent() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(RECENT_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveRecent(kpIds) {
    try {
      if (!global.localStorage) return;
      var existing = loadRecent().filter(function (id) { return kpIds.indexOf(id) < 0; });
      var merged = kpIds.concat(existing).slice(0, 6);
      global.localStorage.setItem(RECENT_KEY, JSON.stringify(merged));
    } catch (e) { /* 偏好失败不影响主流程 */ }
  }

  /* ---------------- draft ---------------- */

  function newDraft() {
    // 记住上次用的科目和知识点（极速录入提速）
    var lastSubject = null, lastKpIds = [];
    try {
      lastSubject = global.localStorage && global.localStorage.getItem('qt:lastSubject');
      lastKpIds = loadRecent();
    } catch (e) { /* ignore */ }
    var subject = lastSubject || QT.data.SUBJECTS[0].id;
    // 上次的知识点要过滤掉不属于当前科目的
    var valid = QT.storage.kpsBySubject(subject).map(function (k) { return k.id; });
    var kpIds = lastKpIds.filter(function (id) { return valid.indexOf(id) >= 0; });
    return {
      id: null,
      subject: subject,
      kpIds: kpIds,
      reason: '',
      source: '',
      entryMode: 'quick',
      imageIds: []
    };
  }

  function draftFrom(m) {
    return {
      id: m.id,
      subject: m.subject || QT.data.SUBJECTS[0].id,
      kpIds: (m.kpIds || []).slice(),
      reason: m.reason || '',
      source: m.source || '',
      // 编辑时默认完整模式（Claude 明确要求）
      entryMode: 'full',
      imageIds: (m.imageIds || []).slice()
    };
  }

  /* ---------------- HTML 片段 ---------------- */

  function subjectOptions(selected) {
    return QT.data.SUBJECTS.map(function (s) {
      return '<option value="' + util.esc(s.id) + '"' +
        (s.id === selected ? ' selected' : '') + '>' + util.esc(s.name) + '</option>';
    }).join('');
  }

  function kpChipsHtml(subject, selected, query) {
    var list = QT.storage.kpsBySubject(subject);
    if (!list.length) {
      return '<div class="muted">这个科目还没有知识点，可在下方新增。</div>';
    }
    // 搜索过滤
    var q = (query || '').trim();
    if (q) {
      list = list.filter(function (k) { return k.name.indexOf(q) >= 0; });
    }
    if (!list.length) {
      return '<div class="muted">没有匹配「' + util.esc(q) + '」的知识点。</div>';
    }
    return list.map(function (k) {
      var on = selected.indexOf(k.id) >= 0 ? ' chip--on' : '';
      return '<button type="button" class="chip' + on + '" data-kp="' + util.esc(k.id) + '"' +
        ' aria-pressed="' + (on ? 'true' : 'false') + '">' + util.esc(k.name) + '</button>';
    }).join('');
  }

  function recentChipsHtml(subject, selected) {
    var recent = loadRecent().slice(0, 6);
    // 过滤掉不属于当前科目的、以及已失效的
    var valid = QT.storage.kpsBySubject(subject).map(function (k) { return k.id; });
    recent = recent.filter(function (id) { return valid.indexOf(id) >= 0; });
    if (!recent.length) return '';
    return '<div class="label">最近用过</div>' +
      '<div class="chips" id="recent-chips" style="margin-bottom:10px">' +
      recent.map(function (id) {
        var kp = QT.storage.kpById(id);
        if (!kp) return '';
        var on = selected.indexOf(id) >= 0 ? ' chip--on' : '';
        return '<button type="button" class="chip' + on + '" data-kp="' + util.esc(id) + '"' +
          ' aria-pressed="' + (on ? 'true' : 'false') + '">' + util.esc(kp.name) + '</button>';
      }).join('') +
      '</div>';
  }

  function reasonChipsHtml(selected) {
    return QT.data.REASONS.map(function (r) {
      var on = selected === r.id ? ' chip--on' : '';
      return '<button type="button" class="chip' + on + '" data-reason="' + util.esc(r.id) + '"' +
        ' aria-pressed="' + (on ? 'true' : 'false') + '">' + util.esc(r.name) + '</button>';
    }).join('');
  }

  /** 实时预览区（防抖 150ms，公式错误显示浅色提示，不阻止保存）。 */
  function previewHtml(fieldId, label) {
    return '<div class="preview" id="prev-' + fieldId + '" hidden>' +
      '<div class="preview__label">' + util.esc(label) + ' 预览</div>' +
      '<div class="preview__body" id="prev-' + fieldId + '-body"></div>' +
      '<div class="preview__error" id="prev-' + fieldId + '-err" hidden></div>' +
      '</div>';
  }

  /* ---------------- render ---------------- */

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
    isEditing = !!editing;
    var quick = draft.entryMode === 'quick';

    return '' +
      '<h1 class="page-title">' + (editing ? '编辑错题' : '记录错题') + '</h1>' +
      '<p class="page-sub">' + (quick ? '极速模式：只填来源即可，题干可留空。' : '完整模式：填写题干、答案与解析。') + '</p>' +

      '<form id="entry-form" novalidate>' +

        // —— 拍照 / 相册（阶段 3；极速模式下的首选录入路径）——
        (QT.entryPhoto ? QT.entryPhoto.html(draft) : '') +

        // —— 来源（极速模式的核心字段）——
        '<div class="card">' +
          '<div class="field" style="margin-bottom:0">' +
            '<label class="label" for="f-source">来源</label>' +
            '<input class="input" id="f-source" maxlength="60" ' +
              'placeholder="如：数分(华师大)P87 习题3(2)，或课本页数" ' +
              'value="' + util.esc(draft.source) + '">' +
            '<div class="entry-err" id="source-err" hidden>请填写题干、来源或添加图片之一</div>' +
            '<div class="hint">可以不抄题干，只写它在哪。组卷时会显示这行来源。</div>' +
          '</div>' +
        '</div>' +

        // —— 知识点（含搜索 + 最近使用）——
        '<div class="card">' +
          '<div class="field">' +
            '<div class="label">科目</div>' +
            '<select class="select" id="f-subject">' + subjectOptions(draft.subject) + '</select>' +
          '</div>' +
          '<div class="field" style="margin-bottom:0">' +
            '<div class="label">知识点<span class="req">*</span></div>' +
            recentChipsHtml(draft.subject, draft.kpIds) +
            '<input class="input" id="kp-search" placeholder="搜索知识点…" ' +
              'style="min-height:40px;margin-bottom:10px">' +
            '<div class="chips" id="kp-chips">' + kpChipsHtml(draft.subject, draft.kpIds, '') + '</div>' +
            '<div style="display:flex;gap:8px;margin-top:10px">' +
              '<input class="input" id="new-kp" placeholder="新增知识点，如「格林公式」" ' +
                'maxlength="30" style="min-height:40px">' +
              '<button type="button" class="btn btn--sm" id="add-kp">添加</button>' +
            '</div>' +
            '<div class="hint">可多选：一道题同时考几章时都勾上，诊断会更准。</div>' +
          '</div>' +
        '</div>' +

        // —— 错因 ——
        '<div class="card">' +
          '<div class="label">错因</div>' +
          '<div class="chips" id="reason-chips">' + reasonChipsHtml(draft.reason) + '</div>' +
          '<div class="hint">选最主要的一个原因。诊断页会按错因统计你的失分模式。</div>' +
        '</div>' +

        // —— 题干 / 答案 / 解析（极速模式收进折叠区）——
        '<div class="card">' +
          '<button type="button" class="btn btn--block" id="toggle-detail">' +
            (quick ? '▸ 展开详细填写（题干 / 答案 / 解析）' : '▾ 收起详细填写') +
          '</button>' +
          '<div id="detail-panel"' + (quick ? ' hidden' : '') + '>' +

            '<div class="field" style="margin-top:14px">' +
              '<label class="label" for="f-stem">题干</label>' +
              '<textarea class="textarea" id="f-stem" placeholder="文字即可，公式用 $...$ 包起来" ' +
                '>' + util.esc(editing ? editing.stem : '') + '</textarea>' +
              previewHtml('stem', '题干') +
              '<div class="hint">手机上可用系统自带的文字识别或其他识别工具，把题目转成文字后直接粘贴；' +
                '含公式的 \\( \\)、\\[ \\] 写法会自动转换。</div>' +
            '</div>' +

            '<div class="field">' +
              '<label class="label" for="f-my">我的答案</label>' +
              '<textarea class="textarea" id="f-my" style="min-height:64px" ' +
                'placeholder="当时写的答案（可留空）">' + util.esc(editing ? editing.myAnswer : '') + '</textarea>' +
              previewHtml('my', '我的答案') +
            '</div>' +

            '<div class="field" style="margin-bottom:0">' +
              '<label class="label" for="f-correct">正确答案 / 解析</label>' +
              '<textarea class="textarea" id="f-correct" placeholder="正确答案或解题思路（可留空）">' +
                util.esc(editing ? editing.correctAnswer : '') + '</textarea>' +
              previewHtml('correct', '解析') +
            '</div>' +

          '</div>' +
        '</div>' +

        // —— 按钮区 ——
        '<div class="card" style="display:grid;gap:8px">' +
          '<button type="submit" class="btn btn--primary btn--block" id="save-continue">' +
            (editing ? '保存修改' : '保存并继续') + '</button>' +
          (editing ? '' : '<button type="button" class="btn btn--block" id="save-return">保存并返回</button>') +
          (editing
            ? '<button type="button" class="btn btn--danger btn--block" id="del-btn">删除这道题</button>'
            : '') +
        '</div>' +

      '</form>';
  }

  /* ---------------- after ---------------- */

  var saveCount = 0; // 本次会话内保存的题数（「已保存第 N 题」提示用）

  function after(el) {
    var form = el.querySelector('#entry-form');
    if (!form) return;

    // 拍照卡（按钮绑定 + 图片库就绪探测 + 编辑态旧图加载都在里面）
    if (QT.entryPhoto) QT.entryPhoto.attach(el, draft);

    var kpBox = el.querySelector('#kp-chips');
    var subjectSel = el.querySelector('#f-subject');

    // —— 科目切换：重建知识点（已选但不在新科目下的丢弃）——
    subjectSel.addEventListener('change', function (ev) {
      draft.subject = ev.target.value;
      var valid = QT.storage.kpsBySubject(draft.subject).map(function (k) { return k.id; });
      draft.kpIds = draft.kpIds.filter(function (id) { return valid.indexOf(id) >= 0; });
      kpBox.innerHTML = kpChipsHtml(draft.subject, draft.kpIds, '');
      var recent = el.querySelector('#recent-chips');
      if (recent) {
        var parent = recent.parentNode;
        parent.innerHTML = recentChipsHtml(draft.subject, draft.kpIds) + parent.innerHTML;
      }
    });

    // —— 知识点搜索 ——
    var kpSearch = el.querySelector('#kp-search');
    kpSearch.addEventListener('input', function (ev) {
      kpBox.innerHTML = kpChipsHtml(draft.subject, draft.kpIds, ev.target.value);
    });

    // —— 知识点多选（事件委托，含「最近用过」区）——
    el.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-kp]');
      if (!btn) return;
      var id = btn.getAttribute('data-kp');
      var i = draft.kpIds.indexOf(id);
      if (i >= 0) draft.kpIds.splice(i, 1); else draft.kpIds.push(id);
      // 同步更新所有带 data-kp 的同类按钮
      el.querySelectorAll('[data-kp="' + id + '"]').forEach(function (b) {
        b.classList.toggle('chip--on', draft.kpIds.indexOf(id) >= 0);
        b.setAttribute('aria-pressed', draft.kpIds.indexOf(id) >= 0 ? 'true' : 'false');
      });
    });

    // —— 新增知识点 ——
    var addKp = function () {
      var inp = el.querySelector('#new-kp');
      var name = String(inp.value || '').trim();
      if (!name) return;
      try {
        var kp = QT.storage.addKnowledgePoint(draft.subject, name);
        if (draft.kpIds.indexOf(kp.id) < 0) draft.kpIds.push(kp.id);
        kpBox.innerHTML = kpChipsHtml(draft.subject, draft.kpIds, kpSearch.value);
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

    // —— 错因单选 ——
    var reasonBox = el.querySelector('#reason-chips');
    reasonBox.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-reason]');
      if (!btn) return;
      var id = btn.getAttribute('data-reason');
      draft.reason = draft.reason === id ? '' : id;
      reasonBox.innerHTML = reasonChipsHtml(draft.reason);
    });

    // —— 展开 / 收起详细填写 ——
    var toggle = el.querySelector('#toggle-detail');
    var detailPanel = el.querySelector('#detail-panel');
    toggle.addEventListener('click', function () {
      var hidden = detailPanel.hidden;
      detailPanel.hidden = !hidden;
      toggle.textContent = hidden ? '▾ 收起详细填写' : '▸ 展开详细填写（题干 / 答案 / 解析）';
    });

    // —— 实时预览（防抖 150ms）——
    var previewTimers = {};
    function schedulePreview(fieldId) {
      var textarea = el.querySelector('#f-' + fieldId);
      var box = el.querySelector('#prev-' + fieldId);
      if (!textarea || !box) return;
      if (previewTimers[fieldId]) clearTimeout(previewTimers[fieldId]);
      previewTimers[fieldId] = setTimeout(function () {
        updatePreview(fieldId);
      }, 150);
    }
    function updatePreview(fieldId) {
      var textarea = el.querySelector('#f-' + fieldId);
      var box = el.querySelector('#prev-' + fieldId);
      var body = el.querySelector('#prev-' + fieldId + '-body');
      var err = el.querySelector('#prev-' + fieldId + '-err');
      if (!textarea || !box || !body || !err) return;
      var val = textarea.value;
      if (!val.trim()) { box.hidden = true; return; }
      box.hidden = false;
      var result = QT.mathtext.renderRich(val);
      body.innerHTML = result.html;
      if (result.errors.length) {
        err.hidden = false;
        err.textContent = '第 ' + result.errors.map(function (e) { return e.index; }).join('、') +
          ' 个公式无法解析：' + result.errors[0].message;
      } else {
        err.hidden = true;
      }
    }
    ['stem', 'my', 'correct'].forEach(function (fid) {
      var ta = el.querySelector('#f-' + fid);
      if (ta) ta.addEventListener('input', function () { schedulePreview(fid); });
    });

    // —— 收集表单 → 校验 → 保存 ——
    function collect() {
      return {
        subject: draft.subject,
        kpIds: draft.kpIds.slice(),
        source: el.querySelector('#f-source').value,
        stem: el.querySelector('#f-stem').value,
        myAnswer: el.querySelector('#f-my').value,
        correctAnswer: el.querySelector('#f-correct').value,
        reason: draft.reason,
        entryMode: draft.entryMode,
        imageIds: draft.imageIds.slice()
      };
    }

    function showSourceError() {
      var err = el.querySelector('#source-err');
      err.hidden = false;
      var src = el.querySelector('#f-source');
      src.focus();
    }
    function clearSourceError() {
      var err = el.querySelector('#source-err');
      if (err) err.hidden = true;
    }
    el.querySelector('#f-source').addEventListener('input', clearSourceError);

    async function doSave(returnToList) {
      var payload = collect();
      // 校验：知识点 ≥1 且（题干/来源/图片至少一项）
      if (!payload.kpIds.length) {
        util.toast('请至少选择一个知识点', 'error');
        return;
      }
      if (!payload.stem.trim() && !payload.source.trim() && !payload.imageIds.length) {
        showSourceError();
        return;
      }
      try {
        if (draft.id) {
          QT.storage.updateMistake(draft.id, payload);
          QT.storage.logEvent('mistake_update', { id: draft.id });
          if (QT.entryPhoto) await QT.entryPhoto.saveFor(draft.id);
          util.toast('已保存修改');
          QT.app.go('list');
        } else {
          var m = QT.storage.addMistake(payload);
          saveRecent(payload.kpIds);
          try {
            global.localStorage && global.localStorage.setItem('qt:lastSubject', payload.subject);
          } catch (e) { /* ignore */ }
          QT.storage.logEvent('mistake_add', { subject: m.subject, kpCount: m.kpIds.length });
          if (QT.entryPhoto) await QT.entryPhoto.saveFor(m.id);
          saveCount += 1;
          if (returnToList) {
            util.toast('已保存第 ' + saveCount + ' 题');
            QT.app.go('list');
          } else {
            // 保存并继续：保留科目/知识点/错因与照片池清空，文本清空，焦点回来源框
            util.toast('已保存第 ' + saveCount + ' 题');
            el.querySelector('#f-source').value = '';
            el.querySelector('#f-stem').value = '';
            el.querySelector('#f-my').value = '';
            el.querySelector('#f-correct').value = '';
            ['stem', 'my', 'correct'].forEach(function (fid) {
              var box = el.querySelector('#prev-' + fid);
              if (box) box.hidden = true;
            });
            if (QT.entryPhoto) QT.entryPhoto.reset();
            el.querySelector('#f-source').focus();
            global.scrollTo(0, 0);
          }
        }
      } catch (e) {
        util.toast(e.message || '保存失败', 'error');
      }
    }

    // 主提交按钮 = 保存并继续
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      doSave(false);
    });

    // 保存并返回
    var saveReturn = el.querySelector('#save-return');
    if (saveReturn) {
      saveReturn.addEventListener('click', function () { doSave(true); });
    }

    // —— 删除（仅编辑态）——
    var del = el.querySelector('#del-btn');
    if (del) {
      del.addEventListener('click', function () {
        if (!global.confirm('删除后，这道题产生的作答记录也会一并删除，知识点掌握度会重算。确定删除？')) return;
        QT.storage.deleteMistake(draft.id);
        // 图片连带删除（孤儿清理会兜底，这里即时删让用户立刻看到空间释放）
        if (QT.imageStoreReady) {
          QT.imageStoreReady.then(function (s) {
            if (s) return s.deleteByQid(draft.id);
          }).catch(function () { /* 清理失败留给下次启动的孤儿清理 */ });
        }
        QT.storage.logEvent('mistake_delete', { id: draft.id });
        util.toast('已删除');
        QT.app.go('list');
      });
    }
  }

  QT.pages.entry = {
    title: '录错题',
    render: render,
    after: after,
    // 离开页面：释放录题池与全部 objectURL（含查看器里的）
    dispose: function () {
      if (QT.entryPhoto) QT.entryPhoto.dispose();
      if (QT.imageView) QT.imageView.revokeAll();
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
