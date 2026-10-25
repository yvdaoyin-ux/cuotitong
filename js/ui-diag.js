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

  /**
   * 确保 ECharts 已加载。加载失败（离线且缺文件）时降级为纯表格，不报错。
   *
   * 为什么要有占位提示：ECharts 压缩后约 1 MB，在 4G / 海外 CDN 慢的情况下
   * 实测要 5~6 秒。这段时间如果图表区是一片空白，用户会以为坏了。
   * 所以先放一句「图表加载中…」，加载完再覆盖。
   */
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

  /** 在图表容器里显示加载中的占位（仅首次加载 ECharts 时用）。 */
  function showChartLoading() {
    if (global.echarts) return;
    ['ch-radar', 'ch-reason', 'ch-subject'].forEach(function (id) {
      var box = document.getElementById(id);
      if (!box || box.querySelector('canvas')) return;
      box.innerHTML = '<div class="hint" style="padding-top:60px;text-align:center">' +
        '图表加载中…（首次进入需下载约 1 MB 图表库）</div>';
    });
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
      '<span class="muted" style="font-size:14px">' +
        Math.round(st.low * 100) + '–' + Math.round(st.high * 100) + '%</span>';
  }

  /** 掌握度分档色（低/中/高三档；文字同时写数值，不只靠颜色）。 */
  function masteryTone(m) {
    if (m < 0.4) return 'low';
    if (m < 0.7) return 'mid';
    return 'high';
  }

  /** U3 主图：掌握度排行（纯 HTML/CSS 条形 + 95% 区间浅色范围，不用 ECharts）。 */
  function rankHtml(rows) {
    return rows.map(function (r) {
      var st = r.state;
      var tr = topReason(r.wrongByReason);
      if (!st.sufficient) {
        return '<div class="rank-row rank-row--na">' +
          '<div class="rank-row__head"><span class="rank-row__name">' + util.esc(r.name) + '</span>' +
          '<span class="rank-row__pct rank-row__pct--na">数据不足</span></div>' +
          '<div class="rank-bar rank-bar--na" title="样本 ' + st.n + '/' + QT.stats.CONFIG.minSamples + '"></div>' +
          '<div class="rank-row__sub">样本 ' + st.n + '/' + QT.stats.CONFIG.minSamples +
            ' · 错' + st.wrong + '/对' + st.correct + '</div>' +
        '</div>';
      }
      var lo = Math.max(0, Math.round(st.low * 100));
      var hi = Math.min(100, Math.round(st.high * 100));
      var mid = Math.round(st.mastery * 100);
      return '<div class="rank-row">' +
        '<div class="rank-row__head"><span class="rank-row__name">' + util.esc(r.name) + '</span>' +
          '<span class="rank-row__pct">' + mid + '%' +
          '<span class="rank-row__ci">(' + lo + '–' + hi + '%)</span></span></div>' +
        '<div class="rank-bar">' +
          '<div class="rank-bar__ci" style="left:' + lo + '%;width:' + Math.max(2, hi - lo) + '%"></div>' +
          '<div class="rank-bar__fill rank-bar__fill--' + masteryTone(st.mastery) + '" style="width:' + mid + '%"></div>' +
        '</div>' +
        '<div class="rank-row__sub">' + util.esc(QT.data.subjectName(r.subject)) +
          (tr ? ' · 主要错因：' + util.esc(tr.name) : '') +
          ' · 错' + st.wrong + '/对' + st.correct + '</div>' +
      '</div>';
    }).join('');
  }

  /** 结论卡：把【知识点】渲染成药丸高亮。 */
  function narrativeHtml(rows) {
    return util.esc(narrative(rows))
      .replace(/【([^】]+)】/g, '<span class="kp-pill">$1</span>');
  }

  /* ---------------- 图表 ---------------- */

  /** ECharts 统一主题（U3）：字体、分类色 --c1..c5、淡化坐标线。 */
  function registerQtTheme() {
    if (!global.echarts || global.echarts.getMap) return;
    try {
      global.echarts.registerTheme('qt', {
        color: ['#3A47B8', '#D9822B', '#2A9D8F', '#C2456B', '#7B8798'],
        textStyle: { fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif' },
        categoryAxis: {
          axisLine: { lineStyle: { color: '#D5D1C7' } },
          axisTick: { show: false },
          axisLabel: { color: '#556070' },
          splitLine: { lineStyle: { color: '#F0EEE8' } }
        },
        valueAxis: {
          axisLine: { show: false },
          axisLabel: { color: '#6F7A8A' },
          splitLine: { lineStyle: { color: '#F0EEE8' } }
        }
      });
    } catch (e) { /* 主题失败不阻塞图表 */ }
  }

  /** 雷达图（U3 降级为可折叠次要图）：标签 5 字截断、半径 56% 修裁切。 */
  function renderRadar(el, rows) {
    var usable = rows.filter(function (r) { return r.state.sufficient; }).slice(0, 8);
    if (usable.length < 3) {
      el.innerHTML = '<div class="hint">至少需要 3 个知识点各有 ' +
        QT.stats.CONFIG.minSamples + ' 次以上作答才能画雷达图。</div>';
      return;
    }
    var chart = global.echarts.init(el, 'qt', { renderer: 'canvas' });
    chart.setOption({
      tooltip: {},
      radar: {
        indicator: usable.map(function (r) {
          return { name: util.truncate(r.name, 5), max: 100 };
        }),
        radius: '56%',
        center: ['50%', '54%'],
        axisName: { color: '#556070', fontSize: 11 },
        triggerEvent: false
      },
      series: [{
        type: 'radar',
        data: [{
          value: usable.map(function (r) { return Math.round(r.state.mastery * 100); }),
          name: '掌握度（%）',
          areaStyle: { opacity: 0.22 }
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
    var chart = global.echarts.init(el, 'qt', { renderer: 'canvas' });
    chart.setOption({
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie',
        radius: ['42%', '68%'],
        label: { formatter: '{b}\n{c} 道', fontSize: 12, color: '#556070' },
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
    var chart = global.echarts.init(el, 'qt', { renderer: 'canvas' });
    chart.setOption({
      grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value', max: 100,
        axisLabel: { formatter: '{value}%' }
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
        itemStyle: { color: '#3A47B8', borderRadius: [0, 4, 4, 0] }
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
        '</div><button class="btn btn--primary btn--block" data-go="entry">去录题</button></div>';
    }
    if (!rows.length) {
      return head + '<div class="card"><div class="empty">这个科目下还没有数据。</div></div>';
    }

    var rankCard = '<div class="card">' +
      '<div class="label">掌握度排行<span class="label__aside">条形为掌握度，浅色带为 95% 可信区间</span></div>' +
      rankHtml(rows) +
      '</div>';

    return head +
      '<div class="card">' +
        '<div class="label">诊断结论</div>' +
        '<p style="margin:0">' + narrativeHtml(rows) + '</p>' +
      '</div>' +

      rankCard +

      '<div class="card">' +
        '<div class="label">错因分布</div>' +
        '<div id="ch-reason" style="width:100%;height:240px"></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="label">各科目平均掌握度</div>' +
        '<div id="ch-subject" style="width:100%;height:' +
          Math.max(120, QT.data.SUBJECTS.length * 46) + 'px"></div>' +
      '</div>' +

      '<details class="card card--fold">' +
        '<summary class="card__fold-head">雷达图（辅助视图）</summary>' +
        '<div id="ch-radar" style="width:100%;height:280px"></div>' +
      '</details>';
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
    // 若 ECharts 还没下载完，先给个占位，避免图表区一片空白让人以为坏了
    showChartLoading();

    ensureECharts(function (ok) {
      if (!ok) {
        // 降级：图表区换成提示，排行主图（纯 HTML）不受影响
        ['ch-radar', 'ch-reason', 'ch-subject'].forEach(function (id) {
          var box = document.getElementById(id);
          if (box) box.innerHTML = '<div class="hint">图表库未加载（离线包里缺少 lib/echarts.min.js），掌握度排行不受影响。</div>';
        });
        return;
      }
      registerQtTheme();
      var radar = document.getElementById('ch-radar');
      var reason = document.getElementById('ch-reason');
      var subj = document.getElementById('ch-subject');
      if (reason) { var c2 = renderReasons(reason, db); if (c2) charts.push(c2); }
      if (subj) {
        var states = QT.stats.computeStates(db.mistakes, db.answers, util.nowIso());
        var c3 = renderBySubject(subj, db, states); if (c3) charts.push(c3);
      }
      if (radar) { var c1 = renderRadar(radar, rows); if (c1) charts.push(c1); }
    });
  }

  QT.pages.diag = { title: '诊断', render: render, after: after, dispose: disposeCharts };
})(typeof globalThis !== 'undefined' ? globalThis : this);

