/**
 * ui-diag.js —— 薄弱点诊断：图表 + 自动文字诊断
 *
 * 图表用 ECharts，**按需加载**：只有进这一页才加载 1MB 的 echarts.min.js，
 * 首屏和录题页不受影响（手机流量友好）。
 * 用 <script> 动态插入而不是 fetch，因为 file:// 下 fetch 会被 CORS 拦掉。
 */
(function (global) {
  'use strict';

  var QT = (global.QT = global.QT || {});
  var util = QT.util;

  var echartsLoading = false;
  var echartsCbs = [];

  /** 确保 ECharts 已加载。加载失败（离线且缺文件）时降级为纯表格，不报错。 */
  function ensureECharts(cb) {
    if (global.echarts) { cb(true); return; }
    echartsCbs.push(cb);
    if (echartsLoading) return;
    echartsLoading = true;

    var s = document.createElement('script');
    s.src = 'lib/echarts.min.js';
    s.onload = function () {
      var ok = !!global.echarts;
      echartsCbs.forEach(function (f) { f(ok); });
      echartsCbs = [];
    };
    s.onerror = function () {
      echartsCbs.forEach(function (f) { f(false); });
      echartsCbs = [];
    };
    document.head.appendChild(s);
  }

  /** 把知识点状态整理成按科目分组的表，按掌握度升序。 */
  function collect(subject) {
    var db = QT.storage.load();
    var now = util.nowIso();
    var states = QT.stats.computeStates(db.mistakes, db.answers, now);

    var rows = [];
    Object.keys(states).forEach(function (kpId) {
      var kp = QT.storage.kpById(kpId);
      if (!kp) return;
      if (subject && kp.subject !== subject) return;
      var st = states[kpId];
      var wrongByReason = {};
      db.mistakes.forEach(function (m) {
        if ((m.kpIds || []).indexOf(kpId) >= 0 && m.reason) {
          wrongByReason[m.reason] = (wrongByReason[m.reason] || 0) + 1;
        }
      });
      rows.push({
        kpId: kpId,
        name: kp.name,
        subject: kp.subject,
        state: st,
        wrongByReason: wrongByReason
      });
    });
    rows.sort(function (a, b) { return a.state.mastery - b.state.mastery; });
    return rows;
  }

  /** 取占比最高的错因。 */
  function topReason(wrongByReason) {
    var best = null, bestN = 0;
    Object.keys(wrongByReason).forEach(function (id) {
      if (wrongByReason[id] > bestN) { bestN = wrongByReason[id]; best = id; }
    });
    return best ? { id: best, name: QT.data.reasonName(best), n: bestN } : null;
  }

  /** 自动生成 1–3 句诊断。只说数据支持的结论，不编。 */
  function narrative(rows) {
    var usable = rows.filter(function (r) { return r.state.sufficient; });
    if (!usable.length) {
      return '目前每个知识点的作答样本都还太少（少于 ' + QT.stats.CONFIG.minSamples +
        ' 次），暂不下结论。继续录入错题、做几轮组卷后，这里会给出具体诊断。';
    }
    var weakest = usable[0];
    var sentences = [];
    sentences.push('你在【' + weakest.name + '】上掌握度最低，约 ' +
      Math.round(weakest.state.mastery * 100) + '%（95% 可信区间 ' +
      Math.round(weakest.state.low * 100) + '%–' + Math.round(weakest.state.high * 100) + '%）。');

    var tr = topReason(weakest.wrongByReason);
    if (tr) sentences.push('这个知识点上的主要错因是【' + tr.name + '】。');

    if (usable.length > 1) {
      var second = usable[1];
      sentences.push('其次是【' + second.name + '】（约 ' +
        Math.round(second.state.mastery * 100) + '%），建议先攻这两个。');
    }
    return sentences.join('');
  }

  function masteryCell(r) {
    var st = r.state;
    if (!st.sufficient) {
      return '<span class="muted">数据不足（' + st.n + '/' + QT.stats.CONFIG.minSamples + '）</span>';
    }
    return '<strong>' + Math.round(st.mastery * 100) + '%</strong> ' +
      '<span class="muted" style="font-size:12px">' +
        Math.round(st.low * 100) + '–' + Math.round(st.high * 100) + '%</span>';
  }

  /* ---------------- 图表 ---------------- */

  /** 雷达图：取样本足够、掌握度最低的 6 个知识点（雷达维度不宜过多）。 */
  function renderRadar(el, rows) {
    var usable = rows.filter(function (r) { return r.state.sufficient; }).slice(0, 6);
    if (usable.length < 3) {
      el.innerHTML = '<div class="hint">至少需要 3 个知识点各有 ' +
        QT.stats.CONFIG.minSamples + ' 次以上作答才能画雷达图。</div>';
      return;
    }
    var chart = global.echarts.init(el, null, { renderer: 'canvas' });
    chart.setOption({
      tooltip: {},
      radar: {
        indicator: usable.map(function (r) {
          return { name: util.truncate(r.name, 6), max: 100 };
        }),
        radius: '62%',
        triggerEvent: false
      },
      series: [{
        type: 'radar',
        data: [{
          value: usable.map(function (r) { return Math.round(r.state.mastery * 100); }),
          name: '掌握度（%）',
          areaStyle: { opacity: 0.25 }
        }]
      }]
    });
    return chart;
  }

  /** 错因分布：按「错题条数」统计，最直观。 */
  function renderReasons(el, db) {
    var counts = QT.data.REASONS.map(function (r) { return { name: r.name, value: 0 }; });
    db.mistakes.forEach(function (m) {
      if (!m.reason) return;
      for (var i = 0; i < counts.length; i++) {
        if (QT.data.REASONS[i].id === m.reason) { counts[i].value += 1; break; }
      }
    });
    var data = counts.filter(function (c) { return c.value > 0; });
    if (!data.length) {
      el.innerHTML = '<div class="hint">还没有标注错因的错题。</div>';
      return;
    }
    var chart = global.echarts.init(el, null, { renderer: 'canvas' });
    chart.setOption({
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie',
        radius: ['42%', '68%'],
        label: { formatter: '{b}\n{c} 道', fontSize: 12 },
        data: data
      }]
    });
    return chart;
  }

  /** 按科目看平均掌握度，判断哪科最该补。 */
  function renderBySubject(el, db, states) {
    var agg = {};
    Object.keys(states).forEach(function (kpId) {
      var kp = QT.storage.kpById(kpId);
      if (!kp) return;
      var a = agg[kp.subject] = agg[kp.subject] || { sum: 0, n: 0 };
      a.sum += states[kpId].mastery;
      a.n += 1;
    });
    var subjects = QT.data.SUBJECTS.filter(function (s) { return agg[s.id]; });
    if (!subjects.length) { el.innerHTML = ''; return; }
    var chart = global.echarts.init(el, null, { renderer: 'canvas' });
    chart.setOption({
      grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value', max: 100,
        axisLabel: { formatter: '{value}%' },
        splitLine: { lineStyle: { color: '#f0f0f0' } }
      },
      yAxis: {
        type: 'category',
        data: subjects.map(function (s) { return s.name; }),
        axisTick: { show: false }
      },
      tooltip: { trigger: 'axis', valueFormatter: function (v) { return v + '%'; } },
      series: [{
        type: 'bar',
        barMaxWidth: 26,
        data: subjects.map(function (s) {
          return Math.round((agg[s.id].sum / agg[s.id].n) * 100);
        }),
        itemStyle: { color: '#2f6feb', borderRadius: [0, 4, 4, 0] }
      }]
    });
    return chart;
  }

  var charts = [];

  function disposeCharts() {
    charts.forEach(function (c) { try { c.dispose(); } catch (e) { /* ignore */ } });
    charts = [];
  }

  function render(query) {
    query = query || {};
    var subject = query.subject || '';
    var rows = collect(subject);
    var db = QT.storage.load();

    var subjOpts = '<option value="">全部科目</option>' + QT.data.SUBJECTS.map(function (s) {
      return '<option value="' + util.esc(s.id) + '"' +
        (s.id === subject ? ' selected' : '') + '>' + util.esc(s.name) + '</option>';
    }).join('');

    var head = '' +
      '<h1 class="page-title">薄弱点诊断</h1>' +
      '<p class="page-sub">掌握度用 Beta 后验均值，区间为 95% 可信区间。</p>' +
      '<div class="filters"><select class="select" id="d-subject" style="grid-column:1/-1">' +
        subjOpts + '</select></div>';

    if (!db.mistakes.length) {
      return head + '<div class="card"><div class="empty">还没有错题，暂无诊断。' +
        '</div><button class="btn btn--primary btn--block" data-go="entry">✏️ 去录题</button></div>';
    }
    if (!rows.length) {
      return head + '<div class="card"><div class="empty">这个科目下还没有数据。</div></div>';
    }

    var tableHtml = '<div class="card">' +
      '<div class="label">各知识点掌握度</div>' +
      rows.map(function (r) {
        var tr = topReason(r.wrongByReason);
        return '<div style="display:flex;justify-content:space-between;align-items:center;' +
            'gap:8px;padding:9px 0;border-bottom:1px solid var(--line)">' +
          '<div style="min-width:0">' +
            '<div>' + util.esc(r.name) + '</div>' +
            '<div class="muted" style="font-size:12px">' +
              util.esc(QT.data.subjectName(r.subject)) +
              (tr ? ' · 主要错因：' + util.esc(tr.name) : '') +
              ' · 错' + r.state.wrong + '/对' + r.state.correct +
            '</div>' +
          '</div>' +
          '<div style="text-align:right;white-space:nowrap">' + masteryCell(r) + '</div>' +
        '</div>';
      }).join('') +
      '</div>';

    return head +
      '<div class="card">' +
        '<div class="label">诊断结论</div>' +
        '<p style="margin:0">' + util.esc(narrative(rows)) + '</p>' +
      '</div>' +

      '<div class="card">' +
        '<div class="label">掌握度雷达图</div>' +
        '<div id="ch-radar" style="width:100%;height:280px"></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="label">错因分布</div>' +
        '<div id="ch-reason" style="width:100%;height:240px"></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="label">各科目平均掌握度</div>' +
        '<div id="ch-subject" style="width:100%;height:' +
          Math.max(120, QT.data.SUBJECTS.length * 46) + 'px"></div>' +
      '</div>' +

      tableHtml;
  }

  function after(el, query) {
    query = query || {};
    var sel = el.querySelector('#d-subject');
    if (sel) {
      sel.addEventListener('change', function (ev) {
        QT.app.go('diag', { subject: ev.target.value });
      });
    }

    var rows = collect(query.subject || '');
    var db = QT.storage.load();
    disposeCharts();

    ensureECharts(function (ok) {
      if (!ok) {
        // 降级：图表区换成提示，表格照常可读
        ['ch-radar', 'ch-reason', 'ch-subject'].forEach(function (id) {
          var box = document.getElementById(id);
          if (box) box.innerHTML = '<div class="hint">图表库未加载（离线包里缺少 lib/echarts.min.js），下方表格数据仍然可用。</div>';
        });
        return;
      }
      var radar = document.getElementById('ch-radar');
      var reason = document.getElementById('ch-reason');
      var subj = document.getElementById('ch-subject');
      if (radar) { var c1 = renderRadar(radar, rows); if (c1) charts.push(c1); }
      if (reason) { var c2 = renderReasons(reason, db); if (c2) charts.push(c2); }
      if (subj) {
        var states = QT.stats.computeStates(db.mistakes, db.answers, util.nowIso());
        var c3 = renderBySubject(subj, db, states); if (c3) charts.push(c3);
      }
    });
  }

  QT.pages.diag = { title: '诊断', render: render, after: after, dispose: disposeCharts };
})(typeof globalThis !== 'undefined' ? globalThis : this);

