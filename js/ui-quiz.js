/**
 * ui-quiz.js —— 智能组卷 + 在线作答 + 结果回写
 *
 * 三个阶段用 hash 上的 `stage` 区分，刷新后仍停在同一阶段：
 *   #/quiz                     选科目与题数
 *   #/quiz?subject=X&size=6&stage=paper&ids=a,b,c   作答中（ids 保证刷新后题目不变）
 *   #/quiz?...&stage=result    已交卷，展示对错并已回写
 *
 * 为什么把题目 id 放进 URL：刷新页面时若重新抽样，用户做到一半的题会变，
 * 答案就对不上了。URL 是唯一可靠的「当前试卷」载体（localStorage 也能存，但会与多标签页打架）。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});
  var util = QT.util;

  /* ---------------- 抽题 ---------------- */

  /**
   * 先算状态 → 建候选 → 加权无放回抽样。
   * 返回值是 Array，并挂上 `.relaxLevel`（由 weightedSample 透传），
   * 供试卷页提示「因错题覆盖知识点较少，已放宽单知识点占比上限」。
   */
  function draw(subject, size) {
    var db = QT.storage.load();
    var now = util.nowIso();
    var states = QT.stats.computeStates(db.mistakes, db.answers, now);
    var pool = db.mistakes.filter(function (m) { return m.subject === subject; });
    var candidates = QT.stats.buildCandidates(pool, states);
    var picked = QT.stats.weightedSample(candidates, size);
    var byId = {};
    db.mistakes.forEach(function (m) { byId[m.id] = m; });
    var out = picked.map(function (c) { return byId[c.id]; }).filter(Boolean);
    out.relaxLevel = picked.relaxLevel || 0;
    return out;
  }

  function parseIds(str) {
    return String(str || '').split(',').filter(Boolean);
  }

  function kpNames(kpIds) {
    return (kpIds || []).map(function (id) {
      var kp = QT.storage.kpById(id);
      return kp ? kp.name : '未知';
    });
  }

  /* ---------------- 页面片段 ---------------- */

  function subjectOptions(selected) {
    return QT.data.SUBJECTS.map(function (s) {
      return '<option value="' + util.esc(s.id) + '"' +
        (s.id === selected ? ' selected' : '') + '>' + util.esc(s.name) + '</option>';
    }).join('');
  }

  function sizeOptions(selected) {
    return QT.stats.CONFIG.quizSizes.map(function (n) {
      return '<option value="' + n + '"' + (n === selected ? ' selected' : '') + '>' +
        n + ' 道</option>';
    }).join('');
  }

  function setupStage(query) {
    var subject = query.subject || QT.data.SUBJECTS[0].id;
    var size = Number(query.size) || QT.stats.CONFIG.quizSizes[0];
    var db = QT.storage.load();
    var poolSize = db.mistakes.filter(function (m) { return m.subject === subject; }).length;

    return '' +
      '<h1 class="page-title">智能组卷</h1>' +
      '<p class="page-sub">按「遗忘程度 × 不掌握程度」加权抽题，同一知识点不超过四成。</p>' +
      '<div class="card">' +
        '<div class="filters" style="margin:0">' +
          '<select class="select" id="q-subject" aria-label="科目">' + subjectOptions(subject) + '</select>' +
          '<select class="select" id="q-size" aria-label="题数">' + sizeOptions(size) + '</select>' +
        '</div>' +
        '<p class="hint">该科目下现有 ' + poolSize + ' 道错题；实际抽出数量不会超过它。</p>' +
        '<p style="margin:12px 0 0"><button class="btn btn--primary btn--block" id="q-draw">' +
          '🎲 生成一份练习</button></p>' +
      '</div>' +
      (query.draw === '1' && poolSize === 0
        ? '<div class="card"><div class="empty">这个科目下还没有错题。</div>' +
          '<button class="btn btn--sm btn--block" data-go="entry">✏️ 去录题</button></div>'
        : '');
  }

  function paperStage(query) {
    var ids = parseIds(query.ids);
    var db = QT.storage.load();
    var byId = {};
    db.mistakes.forEach(function (m) { byId[m.id] = m; });
    var problems = ids.map(function (id) { return byId[id]; }).filter(Boolean);
    var isReview = query.mode === 'review';

    if (!problems.length) {
      return '<h1 class="page-title">练习</h1>' +
        '<div class="card"><div class="empty">这份练习的题目已不存在（可能被删除了）。</div>' +
        '<button class="btn btn--sm btn--block" data-go="quiz">重新组卷</button></div>';
    }

    return '' +
      '<h1 class="page-title">' + (isReview ? '今日复习' : '练习中') + '</h1>' +
      '<p class="page-sub">共 ' + problems.length + ' 题 · 做完后逐题自评对错</p>' +
      // 放宽提示：单知识点占比可能超过 40%，必须明确告知，否则用户会以为承诺失效
      (Number(query.relax) > 0
        ? '<div class="card" style="background:#fff7e6;border:1px solid #f0d9a8">' +
            '<div style="font-size:14px;line-height:1.6">' +
              '⚠️ 因错题覆盖的知识点较少，已放宽单一知识点的占比上限' +
              '（本题库不足以在 40% 限制内凑满 ' + problems.length + ' 道）。' +
            '</div></div>'
        : '') +

      '<form id="paper-form">' +
        problems.map(function (m, i) {
          var names = kpNames(m.kpIds);
          // v3：题干可空（拍照/极速录题），空题干显示来源；图片是题目内容的一部分，有就显示
          var stemHtml = m.stem
            ? util.renderRichText(m.stem)
            : (m.source
              ? '<div class="stem-source">📄 ' + util.esc(m.source) + '<span class="muted">（题干见图片/原文）</span></div>'
              : '<div class="muted">（本题没有题干文字）</div>');
          var imgsHtml = (m.imageIds && m.imageIds.length)
            ? '<div class="imgstrip" data-img-ids="' + util.esc(m.imageIds.join(',')) + '"></div>'
            : '';
          return '<div class="card" data-qid="' + util.esc(m.id) + '">' +
            '<div class="mcard__head">' +
              '<span class="badge">第 ' + (i + 1) + ' 题</span>' +
              names.map(function (n) { return '<span class="badge">' + util.esc(n) + '</span>'; }).join('') +
            '</div>' +
            '<div class="mcard__text">' + stemHtml + '</div>' +
            imgsHtml +
            '<div class="field" style="margin-bottom:10px">' +
              '<label class="label" for="ans-' + util.esc(m.id) + '">我的作答</label>' +
              '<textarea class="textarea" id="ans-' + util.esc(m.id) + '" ' +
                'style="min-height:64px" data-answer placeholder="写下你的解法或答案"></textarea>' +
            '</div>' +
            '<div class="label">自评</div>' +
            '<div class="chips" data-judge>' +
              '<button type="button" class="chip" data-correct="1">✓ 做对了</button>' +
              '<button type="button" class="chip" data-correct="0">✗ 做错了</button>' +
            '</div>' +
            '<div class="hint" data-reveal hidden>' +
              '<strong>我的原答案：</strong>' + (m.myAnswer
                ? util.renderRichText(m.myAnswer) : '<span class="muted">（未填）</span>') +
              '<br><strong>正确答案 / 解析：</strong>' + (m.correctAnswer
                ? util.renderRichText(m.correctAnswer) : '<span class="muted">（未填）</span>') +
            '</div>' +
            '<p style="margin:10px 0 0"><button type="button" class="btn btn--sm" data-toggle-reveal>' +
              '查看答案与解析</button></p>' +
          '</div>';
        }).join('') +

        '<div class="card">' +
          '<button type="submit" class="btn btn--primary btn--block">交卷并更新掌握度</button>' +
          '<div class="hint">每道题都要自评；未评的题不会记入统计。</div>' +
        '</div>' +
      '</form>';
  }

  function resultStage(query) {
    var ids = parseIds(query.ids);
    var db = QT.storage.load();
    var byId = {};
    db.mistakes.forEach(function (m) { byId[m.id] = m; });
    var problems = ids.map(function (id) { return byId[id]; }).filter(Boolean);

    var nCorrect = Number(query.correct) || 0;
    var nWrong = Number(query.wrong) || 0;
    var total = nCorrect + nWrong;

    var now = util.nowIso();
    var states = QT.stats.computeStates(db.mistakes, db.answers, now);
    // 只展示本次涉及的知识点
    var kpSeen = {};
    problems.forEach(function (m) { (m.kpIds || []).forEach(function (id) { kpSeen[id] = true; }); });
    var kpRows = Object.keys(kpSeen).map(function (id) {
      var kp = QT.storage.kpById(id);
      return { kp: kp, st: states[id] };
    }).filter(function (r) { return r.kp && r.st; });
    kpRows.sort(function (a, b) { return a.st.mastery - b.st.mastery; });

    return '' +
      '<h1 class="page-title">本次结果</h1>' +
      '<div class="card" style="text-align:center">' +
        '<div style="font-size:32px;font-weight:700">' +
          (total ? Math.round(nCorrect / total * 100) : 0) + '%</div>' +
        '<div class="muted">' + total + ' 题中做对 ' + nCorrect + ' 道</div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="label">掌握度已更新</div>' +
        (kpRows.length === 0
          ? '<p class="muted" style="margin:0">这些题目已不存在，无法显示掌握度。</p>'
          : kpRows.map(function (r) {
            // 样本不足时仍然给出数值（用户需要看到反馈），但明确标注不可据此下结论
            var unreliable = !r.st.sufficient;
            return '<div style="display:flex;justify-content:space-between;gap:8px;' +
                'padding:8px 0;border-bottom:1px solid var(--line)">' +
              '<div style="min-width:0">' +
                '<div>' + util.esc(r.kp.name) + '</div>' +
                (unreliable
                  ? '<div class="muted" style="font-size:14px">数据不足（' + r.st.n + '/' +
                      QT.stats.CONFIG.minSamples + '），仅供参考</div>'
                  : '<div class="muted" style="font-size:14px">' +
                      Math.round(r.st.low * 100) + '%–' + Math.round(r.st.high * 100) + '%</div>') +
              '</div>' +
              '<div style="text-align:right;white-space:nowrap">' +
                '<strong' + (unreliable ? ' style="color:var(--text-2)"' : '') + '>' +
                  Math.round(r.st.mastery * 100) + '%</strong>' +
              '</div>' +
            '</div>';
          }).join('')) +
        '<p style="margin:10px 0 0"><button class="btn btn--sm" data-go="diag">查看完整诊断 →</button></p>' +
      '</div>' +

      '<div class="card" style="display:grid;gap:8px">' +
        '<button class="btn btn--primary btn--block" data-go="quiz">再组一份</button>' +
        '<button class="btn btn--block" id="to-print">🖨️ 把这份卷子打印出来</button>' +
        '<button class="btn btn--block" data-go="home">回主页</button>' +
      '</div>';
  }

  function render(query) {
    query = query || {};
    var stage = query.stage || 'setup';
    if (stage === 'paper' && query.ids) return paperStage(query);
    if (stage === 'result') return resultStage(query);
    return setupStage(query);
  }

  /* ---------------- 事件 ---------------- */

  function after(el, query) {
    query = query || {};
    var stage = query.stage || 'setup';

    if (stage === 'setup') {
      var subject = query.subject || QT.data.SUBJECTS[0].id;
      var size = Number(query.size) || QT.stats.CONFIG.quizSizes[0];

      el.querySelector('#q-subject').addEventListener('change', function (ev) {
        QT.app.go('quiz', { subject: ev.target.value, size: size });
      });
      el.querySelector('#q-size').addEventListener('change', function (ev) {
        QT.app.go('quiz', { subject: subject, size: ev.target.value });
      });
      el.querySelector('#q-draw').addEventListener('click', function () {
        var picked = draw(subject, size);
        if (!picked.length) {
          util.toast('这个科目下还没有错题', 'error');
          return;
        }
        QT.storage.logEvent('quiz_draw', { subject: subject, size: size, got: picked.length });
        QT.app.go('quiz', {
          subject: subject,
          size: size,
          stage: 'paper',
          ids: picked.map(function (m) { return m.id; }).join(','),
          // 放宽级别写进 URL：试卷页刷新后仍能显示提示，且不影响抽样结果
          relax: picked.relaxLevel ? String(picked.relaxLevel) : ''
        });
      });
      return;
    }

    if (stage === 'paper') {
      var form = el.querySelector('#paper-form');
      if (!form) return;

      // 题目图片异步注水（IndexedDB 取图）
      if (QT.imageView) QT.imageView.hydrate(el);

      // 自评：单选，再点一次取消
      form.addEventListener('click', function (ev) {
        var toggle = ev.target.closest('[data-toggle-reveal]');
        if (toggle) {
          var box = toggle.closest('.card').querySelector('[data-reveal]');
          box.hidden = !box.hidden;
          toggle.textContent = box.hidden ? '查看答案与解析' : '收起答案与解析';
          return;
        }
        var btn = ev.target.closest('[data-correct]');
        if (!btn) return;
        var card = btn.closest('[data-qid]');
        var chips = card.querySelectorAll('[data-correct]');
        var already = btn.classList.contains('chip--on');
        for (var i = 0; i < chips.length; i++) {
          chips[i].classList.remove('chip--on');
          chips[i].setAttribute('aria-pressed', 'false');
        }
        if (!already) {
          btn.classList.add('chip--on');
          btn.setAttribute('aria-pressed', 'true');
        }
      });

      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var cards = el.querySelectorAll('[data-qid]');
        var judged = [];
        var skipped = 0;
        for (var i = 0; i < cards.length; i++) {
          var id = cards[i].getAttribute('data-qid');
          var on = cards[i].querySelector('[data-correct].chip--on');
          var ta = cards[i].querySelector('[data-answer]');
          var note = ta ? String(ta.value || '').trim() : '';
          if (!on) { skipped += 1; continue; }
          judged.push({ id: id, correct: on.getAttribute('data-correct') === '1', note: note });
        }
        if (!judged.length) {
          util.toast('请至少自评一道题', 'error');
          return;
        }

        var nCorrect = 0, nWrong = 0;
        var kind = query.mode === 'review' ? 'review' : 'quiz';
        try {
          judged.forEach(function (j) {
            QT.storage.recordAnswer(j.id, j.correct, kind, j.note);
            if (j.correct) nCorrect += 1; else nWrong += 1;
          });
        } catch (e) {
          util.toast('保存失败：' + (e.message || e), 'error');
          return;
        }
        QT.storage.logEvent(kind === 'review' ? 'review_finish' : 'quiz_finish', {
          subject: query.subject || '',
          total: judged.length,
          correct: nCorrect,
          skipped: skipped
        });

        var msg = '已记录 ' + judged.length + ' 题';
        if (skipped) msg += '，跳过 ' + skipped + ' 题（未自评）';
        util.toast(msg);

        QT.app.go('quiz', {
          subject: query.subject || '',
          size: query.size || '',
          mode: query.mode || '',
          stage: 'result',
          ids: judged.map(function (j) { return j.id; }).join(','),
          correct: nCorrect,
          wrong: nWrong
        });
      });
      return;
    }

    // result 阶段：把本次卷子的题目带进打印页
    var toPrint = el.querySelector('#to-print');
    if (toPrint) {
      toPrint.addEventListener('click', function () {
        QT.app.go('print', {
          ids: query.ids || '',
          subject: query.subject || '',
          withAnswer: '1'
        });
      });
    }
  }

  QT.pages.quiz = {
    title: '组卷',
    render: render,
    after: after,
    dispose: function () { if (QT.imageView) QT.imageView.revokeAll(); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
