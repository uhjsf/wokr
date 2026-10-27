/* views.js —— 共享组件 / 首页 / 刷题 / 考试 */
(function (global) {
  'use strict';
  var App = global.App, U = App.util, QB = global.QB, store = App.store;
  var esc = U.esc, $ = U.$, $$ = U.$$;
  var chemHtml = function (s) { return App.chem ? App.chem(s) : U.esc(s); };
  var Views = App.views = {};
  var S = App.state = { practice: null, exam: null, result: null, filter: null };
  var autoNextTimer = null;
  function cancelAutoNext() { if (autoNextTimer) { clearTimeout(autoNextTimer); autoNextTimer = null; } }
  function scheduleAutoNext(root, s, qid, idx) {
    cancelAutoNext();
    autoNextTimer = setTimeout(function () {
      autoNextTimer = null;
      if (S.practice !== s || s.idx !== idx) return;
      if (location.hash.indexOf('/practice') < 0) return;
      var st = s.answers[qid];
      if (st && st.ok) nextQ(root);
    }, 700);
  }

  /* ================= 共享组件 ================= */
  var TYPE_CLASS = { single: 't-single', multi: 't-multi', judge: 't-judge', essay: 't-essay' };

  function typeChip(q) {
    return '<span class="chip ' + (TYPE_CLASS[q.type] || '') + '">' + (QB.TYPES[q.type] || '题目') + '</span>';
  }
  function metaLine(q) {
    var h = typeChip(q);
    if (store.subjects.length > 1 && q.subjectId) {
      var sname = store.subjectName(q.subjectId);
      if (sname && sname !== q.chapter) h += '<span class="subject-tag">' + esc(sname) + '</span>';
    }
    if (q.chapter) h += '<span class="tag">' + esc(q.chapter) + '</span>';
    if (q.level) h += '<span class="tag">' + esc(q.level) + '</span>';
    if (!q.valid) h += '<span class="tag tag-warn">题目信息不完整</span>';
    return h;
  }
  function stemHtml(q) {
    var s = chemHtml(q.stem)
      .replace(/（\s*）/g, '（<i class="blank"></i>）')
      .replace(/\(\s*\)/g, '（<i class="blank"></i>）');
    return '<div class="qstem">' + s + '</div>';
  }
  function optLetter(k) { return '<span class="ol">' + k + '</span>'; }

  /* 打乱选项时：内容跟着走，ABCD 固定在位置上一路往下排 */
  function shownOptions(q, s) {
    var list = orderedOptions(q, s);
    var changed = false;
    for (var i = 0; i < list.length; i++) {
      if (q.options[i] && q.options[i].k !== list[i].k) { changed = true; break; }
    }
    return list.map(function (o, i) {
      return {
        k: o.k,
        t: o.t,
        disp: changed ? String.fromCharCode(65 + i) : o.k
      };
    });
  }

  /* 原始字母 → 打乱后显示的字母 */
  function dispOf(list, k) {
    if (!list) return k;
    for (var i = 0; i < list.length; i++) if (list[i].k === k) return list[i].disp;
    return k;
  }

  function optionsHtml(q, picked, opts) {
    opts = opts || {};
    var pickedArr = picked || [];
    var letters = q.options.map(function (o) { return o.k; });
    if (q.type === 'judge') {
      letters = ['对', '错'];
    }
    var html = '<div class="opts ' + (q.type === 'judge' ? 'opts-judge' : '') + '">';
    if (q.type === 'judge') {
      ['对', '错'].forEach(function (k) {
        var cls = 'opt judge-' + (k === '对' ? 'yes' : 'no');
        if (pickedArr.indexOf(k) >= 0) cls += ' picked';
        if (opts.reveal) {
          if (q.answer[0] === k) cls += ' right';
          else if (pickedArr.indexOf(k) >= 0) cls += ' wrong';
        }
        html += '<button type="button" class="' + cls + '" data-pick="' + k + '">' +
          '<span class="jicon">' + (k === '对' ? '√' : '×') + '</span><span>' + (k === '对' ? '正确' : '错误') + '</span></button>';
      });
    } else {
      q.options.forEach(function (o) {
        var cls = 'opt';
        if (pickedArr.indexOf(o.k) >= 0) cls += ' picked';
        if (opts.reveal) {
          if (q.answer.indexOf(o.k) >= 0) cls += ' right';
          else if (pickedArr.indexOf(o.k) >= 0) cls += ' wrong';
        }
        html += '<button type="button" class="' + cls + '" data-pick="' + o.k + '">' +
          optLetter(o.disp || o.k) + '<span class="otxt">' + chemHtml(o.t) + '</span>' +
          (opts.reveal && q.answer.indexOf(o.k) >= 0 ? '<span class="mark">✓</span>' : '') +
          '</button>';
      });
    }
    html += '</div>';
    return html;
  }

  function feedbackHtml(q, st, optList) {
    if (!st || !st.done) return '';
    if (q.type === 'essay') return '';
    var ok = st.ok;
    var h = '<div class="feedback ' + (ok ? 'ok' : 'bad') + '">';
    h += '<div class="fb-title">' + (ok ? '✓ 回答正确' : '✕ 回答错误') + '</div>';
    if (!ok) {
      // 选项打乱过的话，答案要换算成屏幕上显示的字母
      var ansTxt = QB.answerText(q);
      if (optList && q.type !== 'judge') {
        ansTxt = q.answer.map(function (k) { return dispOf(optList, k); }).join('');
      }
      h += '<div class="fb-answer"><b>正确答案：</b>' + esc(ansTxt) + '</div>';
    }
    if (q.analysis) h += '<div class="fb-answer"><b>解析：</b>' + chemHtml(q.analysis) + '</div>';
    h += '</div>';
    return h;
  }

  /* ---------- 主观题：写答案 + 与参考答案对比 ---------- */

  /* 在参考答案里标出「你也写到了」的片段（连续 ≥4 字的公共片段） */
  function markOverlap(ref, mine) {
    var u = String(mine || '').replace(/\s+/g, '');
    if (!u || !ref) return { html: esc(ref || ''), matched: 0 };
    var out = '', i = 0, n = ref.length, matched = 0;
    while (i < n) {
      var best = 0;
      var maxLen = Math.min(18, n - i);
      for (var len = maxLen; len >= 4; len--) {
        var seg = ref.substr(i, len).replace(/\s+/g, '');
        if (seg.length >= 4 && u.indexOf(seg) >= 0) { best = len; break; }
      }
      if (best) {
        var slice = ref.substr(i, best);
        var lead = (slice.match(/^\s*/) || [''])[0];
        var trail = (slice.match(/\s*$/) || [''])[0];
        var core = slice.slice(lead.length, slice.length - trail.length);
        out += esc(lead) + '<mark>' + esc(core) + '</mark>' + esc(trail);
        matched += best;
        i += best;
      } else {
        out += esc(ref[i]);
        i += 1;
      }
    }
    return { html: out, matched: matched };
  }

  /* 我的答案 / 参考答案 并排对比 */
  function essayCompareHtml(q, st) {
    var mine = String((st && st.text) || '').trim();
    var ref = String(q.analysis || '').trim();
    var marked = ref ? markOverlap(ref, mine) : { html: '', matched: 0 };
    var h = '<div class="essay-compare">';
    h += '<div class="ec-grid">';
    h += '<div class="ec-col"><div class="ec-title">我的答案</div>' +
      '<div class="ec-body">' + (mine ? chemHtml(mine) : '<span class="muted">（没有写）</span>') + '</div></div>';
    h += '<div class="ec-col"><div class="ec-title">参考答案' +
      (ref && mine ? '<span class="ec-tag">绿色 = 你也写到了</span>' : '') + '</div>' +
      '<div class="ec-body">' + (ref ? (App.chemRaw ? App.chemRaw(marked.html) : marked.html) : '<span class="muted">（原文档没有给出参考答案）</span>') +
      '</div></div>';
    h += '</div>';
    if (ref && mine) {
      var pct = Math.max(0, Math.min(100, Math.round(marked.matched / ref.replace(/\s+/g, '').length * 100)));
      h += '<div class="ec-stat">参考答案里约 <b>' + pct + '%</b> 的内容你也写到了' +
        '<span class="muted">（按文字重合度估算，仅供参考，得分还得自己判断）</span></div>';
    }
    h += '</div>';
    return h;
  }

  /* 主观题作答区 */
  function essayBlockHtml(q, st) {
    st = st || {};
    var submitted = !!st.submitted;
    var done = !!st.done;
    var h = '<div class="essay-block">';
    h += '<div class="essay-label">' + (submitted ? '你的作答' : '写下你的答案（不写也可以，直接看参考答案）') + '</div>';
    h += '<textarea class="essay-input" data-essay rows="5" placeholder="把解答写在这里，提交后会自动和参考答案对比…' +
      (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') ? '（也可以点键盘上的 🎤 说话）' : '') + '"' +
      (submitted ? ' readonly' : '') + '>' + esc(st.text || '') + '</textarea>' +
      (submitted ? '' : (App.speech ? App.speech.html() : ''));
    if (!submitted) {
      h += '<div class="essay-actions">' +
        '<button class="btn btn-primary" data-act="essay-submit">提交并对比</button>' +
        '<button class="btn btn-ghost" data-act="reveal">直接看参考答案</button>' +
        '</div>';
    } else {
      h += essayCompareHtml(q, st);
      h += '<div class="essay-actions">';
      if (!done) {
        h += '<span class="muted small">对比完了，给自己评一下：</span>' +
          '<button class="btn btn-danger-soft" data-act="essay-no">不会</button>' +
          '<button class="btn btn-success" data-act="essay-yes">会做</button>';
      } else {
        h += '<span class="muted">已自评：' + (st.ok ? '会做' : '不会') + '</span>';
      }
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  function progressBar(pct, color) {
    var w = Math.min(100, Math.max(0, pct * 100)).toFixed(1) + '%';
    return '<div class="bar"><i style="width:' + w + (color ? ';background:' + color : '') + '"></i></div>';
  }

  /* 章节配色：让每个章节有自己的识别色 */
  var CH_COLORS = {
    '无机化学': '#6366f1', '分析化学': '#06b6d4', '物理化学': '#a855f7',
    '有机化学': '#f59e0b', '化工原理': '#10b981'
  };
  var CH_PALETTE = ['#6366f1', '#06b6d4', '#a855f7', '#f59e0b', '#10b981', '#ef4444', '#0ea5e9', '#8b5cf6'];
  var chColorMap = {};
  function chColor(name) {
    if (CH_COLORS[name]) return CH_COLORS[name];
    if (!chColorMap[name]) {
      chColorMap[name] = CH_PALETTE[Object.keys(chColorMap).length % CH_PALETTE.length];
    }
    return chColorMap[name];
  }

  /* 线性图标（内联 SVG，无外部依赖） */
  var ICON_PATHS = {
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6"/>',
    pulse: '<polyline points="22 12 17.5 12 15 21 9 3 6.5 12 2 12"/>',
    alert: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="7.5" x2="12" y2="12.5"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    layers: '<path d="M21.2 15.9A10 10 0 1 1 8 2.8"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>'
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON_PATHS[name] || '') + '</svg>';
  }

  function empty(title, desc, action) {
    return '<div class="empty"><div class="empty-ico">' + icon('layers') + '</div><h3>' + esc(title) + '</h3>' +
      '<p>' + esc(desc || '') + '</p>' + (action || '') + '</div>';
  }

  function statCard(label, value, sub, tone, ico) {
    return '<div class="stat-card ' + (tone || '') + '">' +
      (ico ? '<span class="stat-ico">' + icon(ico) + '</span>' : '') +
      '<div class="stat-label">' + esc(label) + '</div>' +
      '<div class="stat-value">' + value + '</div>' +
      (sub ? '<div class="stat-sub">' + sub + '</div>' : '') + '</div>';
  }

  function fmtCount(n) { return (n || 0).toLocaleString('zh-CN'); }
  function pct(x) { return (x * 100).toFixed(x >= 0.995 || x === 0 ? 0 : 1) + '%'; }

  App.ui = {
    typeChip: typeChip, metaLine: metaLine, stemHtml: stemHtml, optionsHtml: optionsHtml,
    feedbackHtml: feedbackHtml, progressBar: progressBar, empty: empty, statCard: statCard,
    fmtCount: fmtCount, pct: pct, TYPE_CLASS: TYPE_CLASS, chColor: chColor
  };

  /* ================= 首页 ================= */
  Views.home = function () {
    var st = store.stats();
    var cs = store.chapterStats();
    var days7 = store.recentDays(7);
    var maxDay = Math.max.apply(null, days7.map(function (d) { return d.n; }).concat([1]));
    var lastSession = store.loadSession();
    var bankTitle = (store.meta && store.meta.title) || '题库';

    var html = '<div class="page">';

    html += '<section class="hero">' +
      '<div class="hero-main">' +
        '<div class="hero-kicker">' + esc(bankTitle) + '</div>' +
        '<h1>今天也要刷几道题</h1>' +
        '<p class="hero-desc">共 ' + fmtCount(st.total) + ' 道题可用 · 已掌握 ' + pct(st.coverage) +
          ' · 累计正确率 ' + (st.attempts ? pct(st.accuracy) : '—') + '</p>' +
        '<div class="hero-actions">' +
          '<button class="btn btn-primary btn-lg" data-act="start-practice">开始刷题</button>' +
          '<a class="btn btn-ghost btn-lg" href="#/exam">组卷考试</a>' +
          (lastSession ? '<button class="btn btn-text btn-lg" data-act="resume">继续上次（第 ' + (lastSession.idx + 1) + ' 题）</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="hero-ring">' +
        '<svg viewBox="0 0 120 120" class="ring">' +
          '<defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0%" stop-color="#6366f1"/><stop offset="55%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#22d3ee"/>' +
          '</linearGradient></defs>' +
          '<circle cx="60" cy="60" r="52" class="ring-bg"/>' +
          '<circle cx="60" cy="60" r="52" class="ring-fg" style="stroke-dasharray:' + (2 * Math.PI * 52).toFixed(1) +
            ';stroke-dashoffset:' + (2 * Math.PI * 52 * (1 - st.coverage)).toFixed(1) + '"/></svg>' +
        '<div class="ring-label"><b>' + Math.round(st.coverage * 100) + '%</b><span>已练习</span></div>' +
      '</div>' +
    '</section>';

    html += '<section class="stat-row">' +
      statCard('已练习题目', fmtCount(st.answered) + '<span class="unit">题</span>', '覆盖 ' + pct(st.coverage), '', 'target') +
      statCard('累计答题', fmtCount(st.attempts) + '<span class="unit">次</span>', '正确率 ' + (st.attempts ? pct(st.accuracy) : '—'), 'tone-blue', 'pulse') +
      statCard('错题本', fmtCount(st.wrong) + '<span class="unit">题</span>', '答对两次自动移出', 'tone-red', 'alert') +
      statCard('连续打卡', fmtCount(store.streak()) + '<span class="unit">天</span>', '收藏 ' + fmtCount(st.fav) + ' 题', 'tone-amber', 'flame') +
    '</section>';

    html += '<div class="grid-2">';

    html += '<section class="card">' +
      '<div class="card-head"><h2>章节掌握度</h2><a class="link" href="#/stats">全部 ></a></div>' +
      '<div class="chapter-list">' +
      cs.slice(0, 8).map(function (c) {
        var ccol = chColor(c.name);
        return '<div class="chapter-row" style="--ch:' + ccol + '">' +
          '<div class="cr-name" title="' + esc(c.name) + '"><i class="ch-dot"></i>' + esc(c.name) + '</div>' +
          '<div class="cr-bar">' + progressBar(c.coverage, ccol) + '</div>' +
          '<div class="cr-num">' + Math.round(c.coverage * 100) + '%</div>' +
          '<div class="cr-act"><button class="btn btn-xs btn-ghost" data-chapter="' + c.id + '">练习</button></div>' +
        '</div>';
      }).join('') +
      '</div></section>';

    html += '<section class="card">' +
      '<div class="card-head"><h2>最近 7 天</h2><span class="muted">共 ' +
        fmtCount(days7.reduce(function (a, b) { return a + b.n; }, 0)) + ' 次练习</span></div>' +
      '<div class="chart">' +
      days7.map(function (d) {
        var hgt = Math.max(4, Math.round(d.n / maxDay * 100));
        var acc = d.n ? d.ok / d.n : 0;
        return '<div class="chart-col' + (d.n ? '' : ' zero') + '" title="' + d.key + '：' + d.n + ' 题，正确 ' + d.ok + ' 题">' +
          '<div class="chart-bar-wrap"><div class="chart-bar" style="height:' + hgt + '%"></div></div>' +
          '<div class="chart-x">' + d.label + '</div>' +
          '<div class="chart-v">' + (d.n || '') + '</div>' +
        '</div>';
      }).join('') +
      '</div></section>';

    html += '</div>';

    html += '<section class="card">' +
      '<div class="card-head"><h2>快捷入口</h2></div>' +
      '<div class="quick-grid">' +
        '<a class="quick" href="#/practice" data-act="start-practice"><b>随机刷题</b><span>按章节与题型随机抽题</span></a>' +
        '<a class="quick" href="#/exam"><b>组卷考试</b><span>按分值自动出卷并限时评分</span></a>' +
        '<a class="quick" href="#/wrong"><b>错题重刷</b><span>' + fmtCount(st.wrong) + ' 道待消化</span></a>' +
        '<a class="quick" href="#/bank"><b>题库管理</b><span>搜索、筛选、导入、导出</span></a>' +
      '</div>' +
    '</section>';

    html += '</div>';

    return {
      html: html,
      mount: function (root) {
        U.on(root, 'click', '[data-act="start-practice"]', function (e) {
          e.preventDefault();
          openPracticeSetup();
        });
        U.on(root, 'click', '[data-act="resume"]', function () {
          var s = store.loadSession();
          if (!s) return;
          S.practice = s;
          location.hash = '#/practice';
        });
        U.on(root, 'click', '[data-chapter]', function (e, el) {
          var id = el.getAttribute('data-chapter');
          startPractice({ chapters: [id], types: ['single', 'multi', 'judge'], range: 'all', limit: 30, shuffleOptions: store.settings.shuffleOptions });
        });
      }
    };
  };

  /* ================= 组题 / 筛选面板 ================= */
  function defaultFilter() {
    return {
      subjects: [],
      chapters: [],
      types: ['single', 'multi', 'judge'],
      range: 'all',
      limit: 30,
      order: 'random'
    };
  }

  function filterCount(f) {
    return store.questions.filter(function (q) {
      if (!q.valid) return false;
      if (f.subject && q.subjectId !== f.subject) return false;
      if (f.types.length && f.types.indexOf(q.kind) < 0) return false;
      if (f.chapters.length && f.chapters.indexOf(q.chapterId) < 0) return false;
      if (f.range === 'wrong' && !store.isWrong(q.id)) return false;
      if (f.range === 'fav' && !store.isFav(q.id)) return false;
      if (f.range === 'new' && store.progress[q.id]) return false;
      return true;
    }).length;
  }

  function filterPanelHtml(f) {
    var ranges = [
      { k: 'all', t: '全部题目' }, { k: 'new', t: '未做过' },
      { k: 'wrong', t: '错题本' }, { k: 'fav', t: '收藏' }
    ];
    var limits = [10, 20, 30, 50, 100, 0];
    var h = '<div class="filter-panel">';
    h += '<div class="fp-group"><div class="fp-title">题型</div><div class="chips">';
    KIND_LIST.forEach(function (K) {
      var on = f.types.indexOf(K.k) >= 0;
      var n = store.questions.filter(function (q) { return q.kind === K.k && q.valid; }).length;
      if (!n) return;
      h += '<button class="chip chip-btn ' + (on ? 'on' : '') + '" data-type="' + K.k + '">' +
        K.name + ' <i>' + fmtCount(n) + '</i></button>';
    });
    h += '</div></div>';

    h += '<div class="fp-group"><div class="fp-title">范围</div><div class="chips">';
    ranges.forEach(function (r) {
      h += '<button class="chip chip-btn ' + (f.range === r.k ? 'on' : '') + '" data-range="' + r.k + '">' + r.t + '</button>';
    });
    h += '</div></div>';

    h += '<div class="fp-group"><div class="fp-title">科目</div><div class="chips">';
    h += '<button class="chip chip-btn ' + (!f.subject ? 'on' : '') + '" data-subject="">全部 <i>' +
      fmtCount(store.validQuestions.length) + '</i></button>';
    store.subjects.forEach(function (s) {
      var n = store.questions.filter(function (q) { return q.subjectId === s.name && q.valid; }).length;
      h += '<button class="chip chip-btn ' + (f.subject === s.name ? 'on' : '') + '" data-subject="' + esc(s.name) + '">' +
        esc(s.name) + ' <i>' + fmtCount(n) + '</i></button>';
    });
    h += '</div></div>';

    h += '<div class="fp-group"><div class="fp-title">章节 <button class="link" data-act="all-chapters">全选</button>' +
      '<button class="link" data-act="none-chapters">清空</button></div>' +
      '<div class="chapter-picker">';
    store.chaptersOf(f.subject ? [f.subject] : []).forEach(function (c) {
      var on = f.chapters.indexOf(c.id) >= 0;
      h += '<label class="pick ' + (on ? 'on' : '') + '"><input type="checkbox" data-chapter="' + c.id + '" ' +
        (on ? 'checked' : '') + '><span>' + esc(c.name) + '</span></label>';
    });
    h += '</div></div>';

    h += '<div class="fp-group"><div class="fp-title">每组题量</div><div class="chips">';
    limits.forEach(function (n) {
      h += '<button class="chip chip-btn ' + (f.limit === n ? 'on' : '') + '" data-limit="' + n + '">' +
        (n === 0 ? '全部' : n + ' 题') + '</button>';
    });
    h += '</div></div>';

    h += '<div class="fp-summary">符合条件的题目：<b>' + fmtCount(filterCount(f)) + '</b> 道</div>';
    h += '</div>';
    return h;
  }

  function openPracticeSetup() {
    var f = S.filter || defaultFilter();
    var m = U.modal({
      title: '开始刷题',
      size: 'md',
      html: filterPanelHtml(f),
      footer: '<button class="btn btn-ghost" data-close>取消</button>' +
              '<button class="btn btn-primary" data-act="go">开始（<b class="go-count">' + fmtCount(filterCount(f)) + '</b> 题）</button>',
      onMount: function (wrap, close) {
        var body = wrap.querySelector('.filter-panel');
        body.addEventListener('click', function (e) {
          var t = e.target.closest('[data-type],[data-range],[data-limit],[data-subject],[data-act]');
          if (!t) return;
          if (t.hasAttribute('data-type')) {
            var ty = t.getAttribute('data-type');
            var i = f.types.indexOf(ty);
            if (i >= 0) f.types.splice(i, 1); else f.types.push(ty);
          } else if (t.hasAttribute('data-range')) {
            f.range = t.getAttribute('data-range');
          } else if (t.hasAttribute('data-limit')) {
            f.limit = parseInt(t.getAttribute('data-limit'), 10);
          } else if (t.hasAttribute('data-subject')) {
            f.subject = t.getAttribute('data-subject') || '';
            f.chapters = [];
          } else if (t.getAttribute('data-act') === 'all-chapters') {
            f.chapters = store.chaptersOf(f.subject ? [f.subject] : []).map(function (c) { return c.id; });
          } else if (t.getAttribute('data-act') === 'none-chapters') {
            f.chapters = [];
          }
          var tmp = document.createElement('div');
          tmp.innerHTML = filterPanelHtml(f);
          var fresh = tmp.querySelector('.filter-panel');
          body.innerHTML = fresh.innerHTML;
          var gc = wrap.querySelector('.go-count');
          if (gc) gc.textContent = fmtCount(filterCount(f));
        });
        body.addEventListener('change', function (e) {
          var cb = e.target.closest('input[data-chapter]');
          if (!cb) return;
          var id = cb.getAttribute('data-chapter');
          var i = f.chapters.indexOf(id);
          if (cb.checked && i < 0) f.chapters.push(id);
          if (!cb.checked && i >= 0) f.chapters.splice(i, 1);
          cb.parentNode.classList.toggle('on', cb.checked);
          var gc = wrap.querySelector('.go-count');
          if (gc) gc.textContent = fmtCount(filterCount(f));
        });
        wrap.querySelector('[data-act="go"]').addEventListener('click', function () {
          S.filter = f;
          close();
          startPractice(f);
        });
      }
    });
    return m;
  }

  function buildPool(f) {
    var list = store.questions.filter(function (q) {
      if (!q.valid) return false;
      if (f.subject && q.subjectId !== f.subject) return false;
      if (f.types.length && f.types.indexOf(q.kind) < 0) return false;
      if (f.chapters.length && f.chapters.indexOf(q.chapterId) < 0) return false;
      if (f.range === 'wrong' && !store.isWrong(q.id)) return false;
      if (f.range === 'fav' && !store.isFav(q.id)) return false;
      if (f.range === 'new' && store.progress[q.id]) return false;
      return true;
    });
    if (f.order === 'random') list = U.shuffle(list);
    var ids = list.map(function (q) { return q.id; });
    if (f.limit > 0) ids = ids.slice(0, f.limit);
    return ids;
  }

  function startPractice(f, presetPool) {
    var pool = presetPool || buildPool(f);
    if (!pool.length) {
      U.toast('没有符合条件的题目，换个筛选条件试试', 'warn');
      return;
    }
    cancelAutoNext();
    S.practice = {
      pool: pool,
      idx: 0,
      answers: {},
      startedAt: Date.now(),
      filter: f || defaultFilter(),
      shuffle: !!store.settings.shuffleOptions,
      order: {}
    };
    if (location.hash.indexOf('#/practice') < 0) location.hash = '#/practice';
    else App.render();
  }
  App.startPractice = startPractice;

  /* ================= 刷题 ================= */
  function currentPracticeQ() {
    var s = S.practice;
    if (!s) return null;
    return store.get(s.pool[s.idx]);
  }

  function orderedOptions(q, s) {
    if (!s || !s.shuffle) return q.options;
    var key = 'o' + q.id;
    if (!s.order[key]) s.order[key] = U.shuffle(q.options.slice());
    return s.order[key];
  }

  var essaySaveTimer = null;

  /* 真正「已答」的数量：客观题选了选项、主观题提交过或自评过 */
  function answeredCount(s) {
    if (!s) return 0;
    var n = 0;
    for (var k in s.answers) {
      var a = s.answers[k];
      if (!a) continue;
      if (a.done || (a.picked && a.picked.length) || a.submitted) n++;
    }
    return n;
  }

  function practiceCardHtml() {
    var s = S.practice;
    if (!s) return '';
    while (s.idx < s.pool.length && !store.get(s.pool[s.idx])) s.idx += 1;
    if (s.idx >= s.pool.length) return practiceDoneHtml();
    var q = currentPracticeQ();
    if (!q) return practiceDoneHtml();
    var st = s.answers[q.id] || null;
    var optList = q.type === 'judge' ? null : shownOptions(q, s);
    var q2 = q.type === 'judge' ? q : { type: q.type, options: optList, answer: q.answer, stem: q.stem };

    var html = '<div class="qcard">';
    html += '<div class="qmeta">' + metaLine(q) +
      '<span class="qcount">第 ' + (s.idx + 1) + ' / ' + s.pool.length + ' 题</span>' +
      '<button class="icon-btn fav-btn ' + (store.isFav(q.id) ? 'on' : '') + '" data-act="fav" title="收藏">' +
        (store.isFav(q.id) ? '★' : '☆') + '</button></div>';
    html += stemHtml(q);
    html += optionsHtml(q2, st ? st.picked : [], { reveal: !!(st && st.done) });

    if (q.type === 'multi' && !(st && st.done)) {
      html += '<div class="multi-tip">多选题：选好后点「提交答案」</div>';
    }

    if (q.type === 'essay') {
      html += essayBlockHtml(q, st);
    } else {
      html += feedbackHtml(q, st, optList);
    }

    html += '<div class="qfoot">' +
      '<button class="btn btn-ghost" data-act="prev" ' + (s.idx === 0 ? 'disabled' : '') + '>‹ 上一题</button>' +
      '<div class="qfoot-mid">' +
        (q.type === 'multi' && !(st && st.done) ? '<button class="btn btn-primary" data-act="submit">提交答案</button>' : '') +
        '<button class="btn ai-btn" data-act="ask-ai" title="不会就点这里，让 AI 讲解"><span class="ai-spark">✦</span>问 AI</button>' +
      '</div>' +
      '<button class="btn btn-primary" data-act="next">' + (s.idx === s.pool.length - 1 ? '完成' : '下一题 ›') + '</button>' +
    '</div>';
    html += '</div>';
    return html;
  }

  function practiceDoneHtml() {
    var s = S.practice;
    var done = 0, right = 0;
    for (var k in s.answers) { if (s.answers[k].done) { done++; if (s.answers[k].ok) right++; } }
    var sec = (Date.now() - s.startedAt) / 1000;
    var html = '<div class="qcard done-card">' +
      '<div class="done-ico">✓</div>' +
      '<h2>本组练习完成</h2>' +
      '<div class="done-stats">' +
        '<div><b>' + done + '</b><span>已答</span></div>' +
        '<div><b>' + (done ? Math.round(right / done * 100) : 0) + '%</b><span>正确率</span></div>' +
        '<div><b>' + U.fmtDur(sec) + '</b><span>用时</span></div>' +
        '<div><b>' + (done - right) + '</b><span>错题</span></div>' +
      '</div>' +
      '<div class="done-actions">' +
        '<button class="btn btn-primary" data-act="again">再来一组</button>' +
        '<button class="btn btn-ghost" data-act="review-wrong">看错题</button>' +
        '<a class="btn btn-text" href="#/home">回首页</a>' +
      '</div></div>';
    return html;
  }

  Views.practice = function () {
    if (!S.practice) {
      return {
        html: '<div class="page">' + empty('准备开始刷题', '按章节、题型随机抽题，答题即时判分，错题自动收集。',
          '<button class="btn btn-primary btn-lg" data-act="open-setup">选择题库范围</button>') + '</div>',
        mount: mountPractice
      };
    }
    var s = S.practice;
    var answered = answeredCount(s);
    var html = '<div class="page">' +
      '<div class="practice-top">' +
        '<div class="pt-left">' +
          '<button class="btn btn-sm btn-ghost" data-act="open-setup">筛选</button>' +
          '<span class="muted">已答 ' + answered + ' / ' + s.pool.length + '</span>' +
        '</div>' +
        '<div class="pt-right">' +
          '<button class="btn btn-sm btn-ghost" data-act="restart">重开</button>' +
        '</div>' +
      '</div>' +
      progressBar(answered / Math.max(1, s.pool.length)) +
      '<div id="practice-card" data-qid="' + (currentPracticeQ() ? currentPracticeQ().id : '') + '">' +
        practiceCardHtml() + '</div>' +
      '</div>';

    return { html: html, mount: mountPractice };
  };

  function mountPractice(root) {
    root.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act],[data-pick],.opt');
      if (!el) return;
      var act = el.getAttribute('data-act');
      var s = S.practice;

      if (el.classList.contains('opt') || el.hasAttribute('data-pick')) {
        if (!s) return;
        var q = currentPracticeQ();
        if (!q) return;
        var st = s.answers[q.id];
        if (st && st.done) return;
        var pick = el.getAttribute('data-pick');
        if (q.type === 'multi') {
          st = s.answers[q.id] || (s.answers[q.id] = { picked: [], done: false });
          var i = st.picked.indexOf(pick);
          if (i >= 0) st.picked.splice(i, 1); else st.picked.push(pick);
          refreshCard(root);
          return;
        }
        // 单选 / 判断：立即判定
        s.answers[q.id] = { picked: [pick], done: true, ok: QB.judgeAnswer(q, [pick]) };
        store.record(q, s.answers[q.id].ok);
        saveSession();
        refreshCard(root);
        if (store.settings.autoNext && s.answers[q.id].ok) {
          scheduleAutoNext(root, s, q.id, s.idx);
        }
        return;
      }

      switch (act) {
        case 'open-setup': openPracticeSetup(); break;
        case 'fav':
          if (!s) return;
          var qq = currentPracticeQ();
          var added = store.toggleFav(qq.id);
          U.toast(added ? '已收藏' : '已取消收藏');
          refreshCard(root);
          break;
        case 'ask-ai':
          if (App.ai) App.ai.ask(currentPracticeQ());
          break;
        case 'submit':
          var q2 = currentPracticeQ();
          var st2 = s.answers[q2.id] || { picked: [], done: false };
          if (!st2.picked.length) { U.toast('请先选择答案', 'warn'); return; }
          st2.done = true;
          st2.ok = QB.judgeAnswer(q2, st2.picked);
          s.answers[q2.id] = st2;
          store.record(q2, st2.ok);
          saveSession();
          refreshCard(root);
          break;
        case 'next': nextQ(root); break;
        case 'prev':
          cancelAutoNext();
          if (s.idx > 0) { s.idx -= 1; s._dir = 'prev'; saveSession(); refreshCard(root); }
          break;
        case 'reveal':
          var q3 = currentPracticeQ();
          var st3 = s.answers[q3.id] || (s.answers[q3.id] = { picked: [] });
          st3.submitted = true;
          saveSession();
          refreshCard(root);
          break;
        case 'essay-submit':
          var q5 = currentPracticeQ();
          var st5 = s.answers[q5.id] || (s.answers[q5.id] = { picked: [] });
          if (!String(st5.text || '').trim()) {
            U.toast('还没写内容，可以先写几句，或者点「直接看参考答案」');
            return;
          }
          st5.submitted = true;
          saveSession();
          refreshCard(root);
          break;
        case 'essay-yes':
        case 'essay-no':
          var q4 = currentPracticeQ();
          var yes = act === 'essay-yes';
          var st4 = s.answers[q4.id] || (s.answers[q4.id] = { picked: [] });
          st4.done = true;
          st4.ok = yes;
          st4.submitted = true;
          store.recordEssay(q4, yes);
          saveSession();
          refreshCard(root);
          break;
        case 'restart':
          if (s) startPractice(s.filter);
          break;
        case 'again':
          startPractice(s ? s.filter : defaultFilter());
          break;
        case 'review-wrong':
          if (s) startPractice({ chapters: [], types: ['single', 'multi', 'judge'], range: 'wrong', limit: 0, order: 'random' });
          break;
      }
    });

    if (App.speech) App.speech.bind(root);

    root.addEventListener('input', function (e) {
      var ta = e.target.closest ? e.target.closest('textarea[data-essay]') : null;
      if (!ta) return;
      var q = currentPracticeQ();
      if (!q || !S.practice) return;
      var st = S.practice.answers[q.id] || (S.practice.answers[q.id] = { picked: [] });
      st.text = ta.value;
      clearTimeout(essaySaveTimer);
      essaySaveTimer = setTimeout(function () { saveSession(); }, 500);
    });

    root.addEventListener('keydown', function (e) { handleHotkey(e, root); });
  }

  function handleHotkey(e, root) {
    var s = S.practice;
    if (!s || s.idx >= s.pool.length) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input' || e.target.isContentEditable) return;
    var q = currentPracticeQ();
    if (!q) return;
    var st = s.answers[q.id];
    if (e.key >= '1' && e.key <= '4' && q.type !== 'essay') {
      var keys = q.type === 'judge' ? ['对', '错'] : q.options.map(function (o) { return o.k; });
      var k = keys[parseInt(e.key, 10) - 1];
      if (!k) return;
      e.preventDefault();
      if (st && st.done) return;
      if (q.type === 'multi') {
        st = s.answers[q.id] || (s.answers[q.id] = { picked: [], done: false });
        var i = st.picked.indexOf(k);
        if (i >= 0) st.picked.splice(i, 1); else st.picked.push(k);
        refreshCard(root);
      } else {
        s.answers[q.id] = { picked: [k], done: true, ok: QB.judgeAnswer(q, [k]) };
        store.record(q, s.answers[q.id].ok);
        saveSession();
        refreshCard(root);
        if (store.settings.autoNext && s.answers[q.id].ok) {
          scheduleAutoNext(root, s, q.id, s.idx);
        }
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (q.type === 'multi' && !(st && st.done)) {
        var st3 = s.answers[q.id] || { picked: [], done: false };
        if (!st3.picked.length) return;
        st3.done = true;
        st3.ok = QB.judgeAnswer(q, st3.picked);
        s.answers[q.id] = st3;
        store.record(q, st3.ok);
        saveSession();
        refreshCard(root);
      } else nextQ(root);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault(); nextQ(root);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (s.idx > 0) { s.idx -= 1; saveSession(); refreshCard(root); }
    }
  }

  function nextQ(root) {
    var s = S.practice;
    if (!s) return;
    cancelAutoNext();
    s.idx += 1;
    s._dir = 'next';
    saveSession();
    refreshCard(root);
  }

  function finishPractice() {
    var s = S.practice;
    var done = 0, right = 0;
    for (var k in s.answers) { if (s.answers[k].done) { done++; if (s.answers[k].ok) right++; } }
    if (done) {
      store.addHistory({
        type: 'practice', at: Date.now(), total: done, right: right,
        dur: Math.round((Date.now() - s.startedAt) / 1000),
        name: '随机练习'
      });
    }
    store.clearSession();
    if (App.motion && done) {
      setTimeout(function () { App.motion.confetti({ count: 70 }); }, 220);
    }
  }

  function refreshCard(root) {
    var box = root.querySelector('#practice-card');
    var s = S.practice;
    if (!box) { App.render(); return; }
    var cur = s ? currentPracticeQ() : null;
    var same = !!(cur && box.getAttribute('data-qid') === cur.id);
    box.innerHTML = practiceCardHtml();
    box.classList.toggle('no-anim', same);
    if (cur) box.setAttribute('data-qid', cur.id);
    if (!same && s && s._dir) {
      var card = box.querySelector('.qcard');
      if (card) card.classList.add(s._dir === 'prev' ? 'slide-prev' : 'slide-next');
      s._dir = null;
    }
    var top = root.querySelector('.practice-top .muted');
    if (top && s) top.textContent = '已答 ' + answeredCount(s) + ' / ' + s.pool.length;
    var bar = root.querySelector('.practice-top + .bar > i');
    if (bar && s) bar.style.width = Math.min(100, Object.keys(s.answers).length / Math.max(1, s.pool.length) * 100) + '%';
    if (s && s.idx >= s.pool.length && !s._finished) { s._finished = true; finishPractice(); }
  }

  function saveSession() {
    var s = S.practice;
    if (!s) return;
    store.saveSession({ pool: s.pool, idx: s.idx, answers: s.answers, startedAt: s.startedAt, filter: s.filter, shuffle: s.shuffle, order: s.order });
  }

  /* ================= 考试 ================= */
  var KIND_LIST = [
    { k: 'single', name: '单选题' },
    { k: 'multi', name: '多选题' },
    { k: 'judge', name: '判断题' },
    { k: 'short', name: '简答题' },
    { k: 'calc', name: '计算题' },
    { k: 'essay', name: '综合题' }
  ];
  var KIND_NAME = {};
  KIND_LIST.forEach(function (x) { KIND_NAME[x.k] = x.name; });

  /* 考试大纲给的分值结构：整卷 150 分 */
  var PAPER_PRESETS = {
    '综合化学': {
      counts: { single: 40, multi: 0, judge: 20, short: 6, calc: 2, essay: 0 },
      scores: { single: 2, multi: 2, judge: 1, short: 5, calc: 10, essay: 10 },
      minutes: 120
    },
    '化工原理': {
      counts: { single: 50, multi: 10, judge: 20, short: 0, calc: 0, essay: 2 },
      scores: { single: 2, multi: 1, judge: 1, short: 5, calc: 10, essay: 10 },
      minutes: 120
    }
  };
  /* 章节占比（综合化学：无机 30 / 分析 30 / 有机 20 / 物化 20） */
  var SUBJECT_WEIGHTS = {
    '综合化学': { '无机化学': 30, '分析化学': 30, '有机化学': 20, '物理化学': 20 }
  };

  function defaultCfg() {
    var subj = (store.subjects[0] && store.subjects[0].name) || '';
    var p = PAPER_PRESETS[subj] || {
      counts: { single: 30, multi: 0, judge: 20, short: 4, calc: 2, essay: 0 },
      scores: { single: 2, multi: 2, judge: 1, short: 5, calc: 10, essay: 10 },
      minutes: 120
    };
    return {
      subject: subj,
      counts: Object.assign({}, p.counts),
      scores: Object.assign({}, p.scores),
      chapters: [],
      minutes: p.minutes,
      shuffle: false
    };
  }

  function applyPreset(cfg, subject) {
    var p = PAPER_PRESETS[subject];
    cfg.subject = subject;
    cfg.chapters = [];
    if (p) {
      cfg.counts = Object.assign({}, p.counts);
      cfg.scores = Object.assign({}, p.scores);
      cfg.minutes = p.minutes;
    }
  }

  function paperTotal(cfg) {
    var s = 0;
    KIND_LIST.forEach(function (K) {
      s += (cfg.counts[K.k] || 0) * (cfg.scores[K.k] || 0);
    });
    return s;
  }
  function paperCount(cfg) {
    var n = 0;
    KIND_LIST.forEach(function (K) { n += cfg.counts[K.k] || 0; });
    return n;
  }
  function availOf(cfg, kind) {
    return store.validQuestions.filter(function (q) {
      if (q.kind !== kind) return false;
      if (cfg.subject && q.subjectId !== cfg.subject) return false;
      if (cfg.chapters.length && cfg.chapters.indexOf(q.chapterId) < 0) return false;
      return true;
    }).length;
  }

  function examConfigHtml(cfg) {
    var h = '<div class="exam-config">';

    h += '<div class="cfg-sec"><h4>考试科目</h4><div class="chips">';
    h += '<button class="chip chip-btn ' + (!cfg.subject ? 'on' : '') + '" data-sub="">全部科目</button>';
    store.subjects.forEach(function (s) {
      h += '<button class="chip chip-btn ' + (cfg.subject === s.name ? 'on' : '') + '" data-sub="' + esc(s.name) + '">' +
        esc(s.name) + '</button>';
    });
    h += '</div>';
    if (PAPER_PRESETS[cfg.subject]) {
      h += '<div class="cfg-hint muted small">已套用「' + esc(cfg.subject) + ' 150 分标准卷」结构，可自由调整题数与分值。</div>';
    }
    h += '</div>';

    h += '<div class="cfg-sec"><h4>题型 / 分值</h4><div class="cfg-types">';
    KIND_LIST.forEach(function (K) {
      var avail = availOf(cfg, K.k);
      var n = cfg.counts[K.k] || 0;
      var sc = cfg.scores[K.k] || 0;
      h += '<div class="cfg-row' + (avail ? '' : ' cfg-disabled') + '">' +
        '<span class="cfg-name">' + K.name + '<i class="muted">（可用 ' + fmtCount(avail) + '）</i></span>' +
        '<div class="cfg-nums">' +
          '<div class="stepper"><button data-step="-1" data-t="' + K.k + '">−</button>' +
          '<input type="number" min="0" value="' + n + '" data-count="' + K.k + '">' +
          '<button data-step="1" data-t="' + K.k + '">+</button></div>' +
          '<span class="cfg-x">×</span>' +
          '<input class="input cfg-score" type="number" min="0" max="100" value="' + sc + '" data-score="' + K.k + '">' +
          '<span class="cfg-sub muted small" data-subtotal="' + K.k + '">' + (n * sc) + ' 分</span>' +
        '</div></div>';
    });
    h += '</div></div>';

    var total = paperTotal(cfg);
    h += '<div class="cfg-total ' + (total === 150 ? 'ok' : '') + '">' +
      '<span>总分</span><b id="exam-total">' + total + '</b><span>分</span>' +
      '<span class="muted small">&nbsp;共 ' + paperCount(cfg) + ' 题' +
      (total === 150 ? ' · 标准卷' : ' · 非 150 分') + '</span></div>';

    h += '<div class="cfg-sec"><h4>章节范围</h4><div class="chapter-picker">';
    store.chaptersOf(cfg.subject ? [cfg.subject] : []).forEach(function (c) {
      var on = !cfg.chapters.length || cfg.chapters.indexOf(c.id) >= 0;
      h += '<label class="pick ' + (on ? 'on' : '') + '"><input type="checkbox" data-xchapter="' + c.id + '" ' +
        (on ? 'checked' : '') + '><span>' + esc(c.name) + '</span></label>';
    });
    h += '</div><div class="muted small">' + (cfg.chapters.length
      ? '已选 ' + cfg.chapters.length + ' 个章节（可继续点击增减）'
      : '默认包含该科目全部章节，点击可取消个别章节') + '</div></div>';

    h += '<div class="cfg-sec"><h4>考试时长（分钟）</h4><div class="chips">';
    [30, 45, 60, 90, 120, 150, 0].forEach(function (m) {
      h += '<button class="chip chip-btn ' + (cfg.minutes === m ? 'on' : '') + '" data-min="' + m + '">' + (m ? m + ' 分钟' : '不限时') + '</button>';
    });
    h += '</div></div>';
    h += '<div class="cfg-sec"><h4>选项</h4><div class="set-row flat"><div><b>打乱选项顺序</b>' +
      '<div class="muted small">避免死记选项位置</div></div>' +
      '<label class="switch"><input type="checkbox" data-shuffle ' + (cfg.shuffle ? 'checked' : '') + '><i></i></label></div></div>';
    h += '</div>';
    return h;
  }

  /* 按题型抽题，综合化学再按章节权重分配 */
  function pickKind(cfg, kind, n) {
    if (!n) return [];
    var pool = store.validQuestions.filter(function (q) {
      if (q.kind !== kind) return false;
      if (cfg.subject && q.subjectId !== cfg.subject) return false;
      if (cfg.chapters.length && cfg.chapters.indexOf(q.chapterId) < 0) return false;
      return true;
    });
    if (!pool.length) return [];
    var weights = cfg.subject && !cfg.chapters.length ? SUBJECT_WEIGHTS[cfg.subject] : null;
    if (!weights) return U.shuffle(pool).slice(0, n);

    var byCh = {};
    pool.forEach(function (q) { (byCh[q.chapter] = byCh[q.chapter] || []).push(q); });
    var chs = Object.keys(byCh);
    var totalW = 0;
    chs.forEach(function (c) { totalW += weights[c] || 1; });

    var out = [], spare = [];
    chs.forEach(function (c) {
      var want = Math.round(n * (weights[c] || 1) / totalW);
      var list = U.shuffle(byCh[c]);
      out = out.concat(list.slice(0, want));
      spare = spare.concat(list.slice(want));
    });
    if (out.length < n) out = out.concat(U.shuffle(spare).slice(0, n - out.length));
    if (out.length > n) out = U.shuffle(out).slice(0, n);
    return out;
  }

  function buildPaper(cfg) {
    var items = [];
    KIND_LIST.forEach(function (K) {
      var n = cfg.counts[K.k] || 0;
      if (!n) return;
      var score = cfg.scores[K.k] || 1;
      pickKind(cfg, K.k, n).forEach(function (q) {
        items.push({ id: q.id, score: score, kind: K.k });
      });
    });
    return items;
  }

  Views.exam = function () {
    if (S.exam && !S.exam.submitted) return examRunView();
    if (S.result) return examResultView();
    return examSetupView();
  };

  function examSetupView() {
    var cfg = S.examCfg || (S.examCfg = defaultCfg());
    var html = '<div class="page">' +
      '<div class="page-head"><h1>组卷考试</h1>' +
        '<p class="muted">按科目与题型自动抽题，整卷 150 分，限时作答，交卷即时评分。</p></div>' +
      '<div class="card">' + examConfigHtml(cfg) + '</div>' +
      '<div class="exam-start"><span class="muted">共 <b id="exam-count">' + paperCount(cfg) + '</b> 题 · <b id="exam-total2">' + paperTotal(cfg) + '</b> 分</span>' +
      '<div class="exam-start-actions">' +
        '<button class="btn btn-ghost btn-lg" data-act="print-paper">生成试卷</button>' +
        '<button class="btn btn-primary btn-lg" data-act="start-exam">开始考试</button>' +
      '</div></div>' +
      '</div>';

    function refreshNumbers(root) {
      KIND_LIST.forEach(function (K) {
        var el = root.querySelector('[data-subtotal="' + K.k + '"]');
        if (el) el.textContent = ((cfg.counts[K.k] || 0) * (cfg.scores[K.k] || 0)) + ' 分';
      });
      var total = paperTotal(cfg);
      var t1 = root.querySelector('#exam-total');
      if (t1) t1.textContent = total;
      var box = root.querySelector('.cfg-total');
      if (box) box.classList.toggle('ok', total === 150);
      var t2 = root.querySelector('#exam-total2');
      if (t2) t2.textContent = total;
      var c1 = root.querySelector('#exam-count');
      if (c1) c1.textContent = paperCount(cfg);
    }

    return {
      html: html,
      mount: function (root) {
        root.addEventListener('click', function (e) {
          var el = e.target.closest('[data-step],[data-min],[data-sub],[data-act]');
          if (!el) return;

          if (el.hasAttribute('data-step')) {
            var t = el.getAttribute('data-t');
            var d = parseInt(el.getAttribute('data-step'), 10);
            var inp = root.querySelector('input[data-count="' + t + '"]');
            var v = Math.max(0, Math.min(999, (parseInt(inp.value, 10) || 0) + d));
            inp.value = v;
            cfg.counts[t] = v;
            refreshNumbers(root);
            return;
          }
          if (el.hasAttribute('data-min')) {
            cfg.minutes = parseInt(el.getAttribute('data-min'), 10);
            $$('.chips [data-min]', root).forEach(function (b) { b.classList.toggle('on', b === el); });
            return;
          }
          if (el.hasAttribute('data-sub')) {
            var sub = el.getAttribute('data-sub');
            if (sub) applyPreset(cfg, sub);
            else { cfg.subject = ''; cfg.chapters = []; }
            App.render();
            return;
          }

          var act = el.getAttribute('data-act');
          if (act === 'print-paper') {
            var items0 = buildPaper(cfg);
            if (!items0.length) { U.toast('没有符合条件的题目', 'warn'); return; }
            var cnt = {};
            items0.forEach(function (x) { cnt[x.kind] = (cnt[x.kind] || 0) + 1; });
            U.modal({
              title: '生成试卷（' + items0.length + ' 题 · ' + paperTotal(cfg) + ' 分）',
              size: 'md',
              html: '<p class="muted">将打开浏览器打印窗口，可另存为 PDF 或直接打印。</p>' +
                    '<div class="chips" style="margin-top:12px"><b>包含：</b>' +
                    KIND_LIST.filter(function (K) { return cnt[K.k]; }).map(function (K) {
                      return '<span class="chip">' + K.name + ' ' + cnt[K.k] + ' × ' + (cfg.scores[K.k] || 1) + ' 分</span>';
                    }).join('') + '</div>',
              footer: '<button class="btn btn-ghost" data-print="0">打印（不含答案）</button>' +
                      '<button class="btn btn-primary" data-print="1">打印（含答案）</button>',
              onMount: function (wrap, close) {
                U.on(wrap, 'click', '[data-print]', function (ev, b) {
                  var withAns = b.getAttribute('data-print') === '1';
                  close();
                  printPaper(items0.map(function (x) {
                    return { q: store.get(x.id), picked: null, score: x.score };
                  }), withAns, paperTotal(cfg));
                });
              }
            });
            return;
          }
          if (act === 'start-exam') {
            if (!paperCount(cfg)) { U.toast('请先设置题目数量', 'warn'); return; }
            var items = buildPaper(cfg);
            if (!items.length) { U.toast('没有符合条件的题目', 'warn'); return; }
            if (items.length < paperCount(cfg)) {
              U.toast('题库数量不足，实际出卷 ' + items.length + ' 题', 'warn');
            }
            S.exam = {
              items: items,
              idx: 0,
              answers: {},
              startedAt: Date.now(),
              duration: cfg.minutes * 60,
              submitted: false,
              shuffle: cfg.shuffle,
              order: {},
              full: items.reduce(function (a, b) { return a + b.score; }, 0),
              name: cfg.subject || '综合'
            };
            S.result = null;
            App.render();
          }
        });
        root.addEventListener('change', function (e) {
          var inp = e.target.closest('input[data-count]');
          if (inp) {
            cfg.counts[inp.getAttribute('data-count')] = Math.max(0, parseInt(inp.value, 10) || 0);
            refreshNumbers(root);
            return;
          }
          var sc = e.target.closest('input[data-score]');
          if (sc) {
            cfg.scores[sc.getAttribute('data-score')] = Math.max(0, parseInt(sc.value, 10) || 0);
            refreshNumbers(root);
            return;
          }
          var cb = e.target.closest('input[data-xchapter]');
          if (cb) {
            var all = $$('input[data-xchapter]', root);
            var checked = all.filter(function (x) { return x.checked; }).map(function (x) { return x.getAttribute('data-xchapter'); });
            cfg.chapters = checked.length === all.length ? [] : checked;
            cb.parentNode.classList.toggle('on', cb.checked);
            return;
          }
          if (e.target.matches('input[data-shuffle]')) cfg.shuffle = e.target.checked;
        });
      }
    };
  }

  function examQ() {
    var e = S.exam;
    if (!e) return null;
    return store.get(e.items[e.idx].id);
  }
  function examScoreNow() {
    var e = S.exam;
    if (!e) return 0;
    return e.items[e.idx].score;
  }

  function examRunView() {
    var e = S.exam;
    var answered = Object.keys(e.answers).filter(function (k) { var x = e.answers[k]; return (x.picked || []).length || x.done || (x.text && x.text.trim()); }).length;
    var html = '<div class="page exam-page">' +
      '<div class="exam-bar">' +
        '<div class="exam-timer" id="exam-timer">' + (e.duration ? U.fmtClock(e.duration - (Date.now() - e.startedAt) / 1000) : '不限时') + '</div>' +
        '<div class="exam-progress">已答 <b>' + answered + '</b> / ' + e.items.length + '　·　满分 ' + e.full + ' 分</div>' +
        '<button class="btn btn-danger" data-act="submit-exam">交卷</button>' +
      '</div>' +
      '<div class="exam-layout">' +
        '<div class="exam-main" id="exam-card">' + examCardHtml() + '</div>' +
        '<aside class="exam-side">' +
          '<div class="side-title">答题卡</div>' +
          '<div class="sheet">' + e.items.map(function (it, i) {
            var a = e.answers[it.id];
            var cls = 'sheet-item';
            if (a && ((a.picked && a.picked.length) || a.done)) cls += ' done';
            if (i === e.idx) cls += ' cur';
            return '<button class="' + cls + '" data-jump="' + i + '">' + (i + 1) + '</button>';
          }).join('') + '</div>' +
          '<div class="side-legend"><span><i class="dot done"></i>已答</span><span><i class="dot"></i>未答</span></div>' +
        '</aside>' +
      '</div></div>';

    return {
      html: html,
      mount: function (root) {
        root.addEventListener('click', function (ev) {
          var el = ev.target.closest('[data-pick],[data-act],[data-jump]');
          if (!el) return;
          var e2 = S.exam;
          if (el.hasAttribute('data-jump')) {
            e2.idx = parseInt(el.getAttribute('data-jump'), 10);
            App.render();
            return;
          }
          if (el.hasAttribute('data-pick')) {
            var q = examQ();
            if (!q) return;
            var pick = el.getAttribute('data-pick');
            var a = e2.answers[q.id] || (e2.answers[q.id] = { picked: [] });
            if (q.type === 'multi') {
              var i = a.picked.indexOf(pick);
              if (i >= 0) a.picked.splice(i, 1); else a.picked.push(pick);
            } else {
              a.picked = [pick];
            }
            refreshExam(root);
            return;
          }
          var act = el.getAttribute('data-act');
          if (act === 'next') {
            if (e2.idx < e2.items.length - 1) { e2.idx += 1; App.render(); }
            else U.toast('已经是最后一题了，可以交卷');
          } else if (act === 'prev') {
            if (e2.idx > 0) { e2.idx -= 1; App.render(); }
          } else if (act === 'submit-exam') {
            var left = e2.items.length - Object.keys(e2.answers).filter(function (k) {
              var x = e2.answers[k];
              return (x.picked && x.picked.length) || x.done || (x.text && x.text.trim());
            }).length;
            if (left > 0 && !confirm('还有 ' + left + ' 题未作答，确定交卷吗？')) return;
            submitExam();
          }
        });
        root.addEventListener('input', function (ev) {
          var ta = ev.target.closest ? ev.target.closest('textarea[data-essay]') : null;
          if (!ta || !S.exam) return;
          var q = examQ();
          if (!q) return;
          var a = S.exam.answers[q.id] || (S.exam.answers[q.id] = { picked: [] });
          a.text = ta.value;
          var b = root.querySelector('.exam-progress b');
          if (b) {
            b.textContent = Object.keys(S.exam.answers).filter(function (k) {
              var x = S.exam.answers[k];
              return (x.picked && x.picked.length) || x.done || (x.text && x.text.trim());
            }).length;
          }
        });
        if (App.speech) App.speech.bind(root);
        startExamTimer();
      }
    };
  }

  function examCardHtml() {
    var q = examQ();
    if (!q) return '';
    var e = S.exam;
    var a = e.answers[q.id] || { picked: [] };
    var list = q.type === 'judge' ? q : { type: q.type, options: shownOptions(q, e), answer: q.answer, stem: q.stem };
    var h = '<div class="qcard">';
    h += '<div class="qmeta">' + metaLine(q) +
      '<span class="qcount">第 ' + (e.idx + 1) + ' / ' + e.items.length + ' 题 · ' + examScoreNow() + ' 分</span></div>';
    h += stemHtml(q);
    h += optionsHtml(list, a.picked, {});
    if (q.type === 'essay') {
      h += '<div class="essay-block"><div class="essay-label">在下方作答（本题 ' + examScoreNow() +
        ' 分，交卷后可与参考答案对比并自评）</div>' +
        '<textarea class="essay-input" data-essay rows="6" placeholder="把解答写在这里…">' +
        esc(a.text || '') + '</textarea>' + (App.speech ? App.speech.html() : '') + '</div>';
    }
    h += '<div class="qfoot"><button class="btn btn-ghost" data-act="prev" ' + (e.idx === 0 ? 'disabled' : '') + '>‹ 上一题</button>' +
      '<div></div><button class="btn btn-primary" data-act="next" ' + (e.idx === e.items.length - 1 ? 'disabled' : '') + '>下一题 ›</button></div>';
    return h + '</div>';
  }

  function refreshExam(root) {
    var box = root.querySelector('#exam-card');
    if (box) box.innerHTML = examCardHtml();
    var e = S.exam;
    var answered = Object.keys(e.answers).filter(function (k) {
      var a = e.answers[k]; return a && ((a.picked && a.picked.length) || a.done);
    }).length;
    var p = root.querySelector('.exam-progress b');
    if (p) p.textContent = answered;
    $$('.sheet-item', root).forEach(function (b, i) {
      var a = e.answers[e.items[i].id];
      b.classList.toggle('done', !!(a && ((a.picked && a.picked.length) || (a.text && a.text.trim()))));
      b.classList.toggle('cur', i === e.idx);
    });
  }

  var examTimer = null;
  function startExamTimer() {
    clearInterval(examTimer);
    var e = S.exam;
    if (!e || !e.duration) return;
    examTimer = setInterval(function () {
      var left = e.duration - (Date.now() - e.startedAt) / 1000;
      var el = document.getElementById('exam-timer');
      if (el) {
        el.textContent = U.fmtClock(left);
        el.classList.toggle('warn', left < 300);
      }
      if (left <= 0) {
        clearInterval(examTimer);
        U.toast('时间到，已自动交卷', 'warn');
        submitExam();
      }
    }, 1000);
  }

  function submitExam() {
    clearInterval(examTimer);
    var e = S.exam;
    if (!e) return;
    e.submitted = true;
    var perQ = [];
    var right = 0, graded = 0, earned = 0, full = 0;
    e.items.forEach(function (it) {
      var q = store.get(it.id);
      if (!q) return;
      var a = e.answers[it.id] || { picked: [] };
      full += it.score;
      var ok = null, got = 0;
      if (q.type === 'essay') {
        ok = null;
      } else {
        ok = QB.judgeAnswer(q, a.picked);
        graded += 1;
        if (ok) { right += 1; got = it.score; earned += it.score; }
        store.record(q, ok);
      }
      perQ.push({
        id: it.id, picked: a.picked, ok: ok,
        score: got, max: it.score, kind: it.kind,
        text: a.text || '',
        manual: q.type === 'essay'
      });
    });
    S.result = {
      at: Date.now(),
      total: perQ.length,
      graded: graded,
      right: right,
      earned: earned,
      full: full,
      score: full ? Math.round(earned / full * 100) : 0,
      dur: Math.round((Date.now() - e.startedAt) / 1000),
      perQ: perQ,
      name: e.name || '模拟考试'
    };
    store.addHistory({
      type: 'exam', at: Date.now(), total: perQ.length, right: right,
      score: S.result.score, earned: earned, full: full,
      dur: S.result.dur, name: S.result.name
    });
    S.exam = null;
    App.render();
    if (App.motion && earned >= full * 0.6) {
      setTimeout(function () { App.motion.confetti({ count: 110 }); }, 260);
    }
  }

  function recalcResult(root) {
    var r = S.result;
    if (!r) return;
    var earned = 0;
    r.perQ.forEach(function (x) { earned += x.score || 0; });
    r.earned = earned;
    r.score = r.full ? Math.round(earned / r.full * 100) : 0;
    var el = root.querySelector('#res-earned');
    if (el) el.textContent = earned;
    var pc = root.querySelector('#res-pct');
    if (pc) pc.textContent = r.score + '%';
    var hero = root.querySelector('.result-hero');
    if (hero) {
      hero.classList.toggle('pass', earned >= r.full * 0.6);
      hero.classList.toggle('fail', earned < r.full * 0.6);
    }
    var t = root.querySelector('.result-info h2');
    if (t) t.textContent = earned >= r.full * 0.6 ? '恭喜通过' : '继续加油';
  }

  function examResultView() {
    var r = S.result;
    var pass = r.earned >= r.full * 0.6;
    var html = '<div class="page">';
    html += '<div class="result-hero ' + (pass ? 'pass' : 'fail') + '">' +
      '<div class="result-score"><b id="res-earned">' + r.earned + '</b><span>/ ' + r.full + ' 分</span></div>' +
      '<div class="result-info">' +
        '<h2>' + (pass ? '恭喜通过' : '继续加油') + '</h2>' +
        '<p>客观题答对 ' + r.right + ' / ' + r.graded + ' 题 · 得分率 <b id="res-pct">' + r.score + '%</b> · 用时 ' + U.fmtDur(r.dur) + '</p>' +
      '</div>' +
      '<div class="result-actions">' +
        '<button class="btn btn-ghost" data-act="print">打印试卷</button>' +
        '<a class="btn btn-primary" href="#/exam" data-act="new-exam">再考一次</a>' +
      '</div>' +
    '</div>';

    var manual = r.perQ.filter(function (x) { return x.manual; }).length;
    if (manual) {
      html += '<div class="alert alert-warn">本卷含 ' + manual + ' 道主观题（简答 / 计算 / 综合），系统不自动判分。' +
        '请对照参考答案在下方逐题打分，总分会自动更新。</div>';
    }

    html += '<div class="card"><div class="card-head"><h2>逐题解析</h2><span class="muted">可对照答案复习</span></div>';
    r.perQ.forEach(function (item, i) {
      var q = store.get(item.id);
      if (!q) return;
      var cls = item.manual ? 'skip' : (item.ok ? 'ok' : 'bad');
      html += '<div class="review-item ' + cls + '">' +
        '<div class="review-head"><span class="review-no">' + (i + 1) + '</span>' + metaLine(q) +
        '<span class="tag">' + item.max + ' 分</span>' +
        '<span class="review-mark">' + (item.manual ? '主观题' : (item.ok ? '✓ 得 ' + item.max + ' 分' : '✕ 0 分')) + '</span></div>' +
        stemHtml(q);
      if (q.type !== 'essay') {
        html += optionsHtml(q, item.picked, { reveal: true });
        html += '<div class="review-ans">你的答案：<b>' + (item.picked.join('') || '未作答') + '</b>　正确答案：<b>' + esc(QB.answerText(q)) + '</b></div>';
        if (q.analysis) html += '<div class="review-expl"><b>解析：</b>' + chemHtml(q.analysis) + '</div>';
      } else {
        html += essayCompareHtml(q, { text: item.text });
      }
      if (item.manual) {
        html += '<div class="grade-row">' +
          '<span class="muted small">自评得分</span>' +
          '<input class="input grade-input" type="number" min="0" max="' + item.max + '" step="1" value="' + (item.score || 0) + '" data-grade="' + i + '">' +
          '<span class="muted small">/ ' + item.max + ' 分</span>' +
          '<button class="btn btn-xs btn-ghost" data-grade-set="0" data-idx="' + i + '">0 分</button>' +
          '<button class="btn btn-xs btn-ghost" data-grade-set="' + item.max + '" data-idx="' + i + '">满分</button>' +
          '</div>';
      }
      html += '</div>';
    });
    html += '</div></div>';

    return {
      html: html,
      mount: function (root) {
        root.addEventListener('input', function (e) {
          var inp = e.target.closest('input[data-grade]');
          if (!inp) return;
          var idx = parseInt(inp.getAttribute('data-grade'), 10);
          var item = S.result.perQ[idx];
          if (!item) return;
          var v = parseInt(inp.value, 10);
          if (isNaN(v)) v = 0;
          item.score = Math.max(0, Math.min(item.max, v));
          recalcResult(root);
        });
        root.addEventListener('change', function (e) {
          var inp = e.target.closest('input[data-grade]');
          if (!inp) return;
          var idx = parseInt(inp.getAttribute('data-grade'), 10);
          var item = S.result.perQ[idx];
          if (item) { inp.value = item.score; }
        });
        root.addEventListener('click', function (e) {
          var setBtn = e.target.closest('[data-grade-set]');
          if (setBtn) {
            var idx2 = parseInt(setBtn.getAttribute('data-idx'), 10);
            var item2 = S.result.perQ[idx2];
            if (item2) {
              item2.score = parseInt(setBtn.getAttribute('data-grade-set'), 10) || 0;
              var inp2 = root.querySelector('input[data-grade="' + idx2 + '"]');
              if (inp2) inp2.value = item2.score;
              recalcResult(root);
            }
            return;
          }
          var el = e.target.closest('[data-act]');
          if (!el) return;
          if (el.getAttribute('data-act') === 'print') printExam(S.result);
          if (el.getAttribute('data-act') === 'new-exam') { S.result = null; }
        });
      }
    };
  }

  function printPaper(items, withAnswers, totalScore) {
    var area = document.getElementById('print-area');
    if (!area) {
      area = document.createElement('div');
      area.id = 'print-area';
      document.body.appendChild(area);
    }
    var sum = totalScore || items.reduce(function (a, b) { return a + (b.score || 0); }, 0);
    var h = '<h1>试卷</h1><p class="print-meta">共 ' + items.length + ' 题' +
      (sum ? ' · 满分 ' + sum + ' 分' : '') + ' · ' +
      U.fmtDate(Date.now()) + (withAnswers ? ' · 含答案' : '') + '</p>';
    items.forEach(function (item, i) {
      var q = item.q;
      if (!q) return;
      h += '<div class="print-q"><div class="pq-stem">' + (i + 1) + '. ' + chemHtml(q.stem) +
        (item.score ? '<span class="pq-score">（' + item.score + ' 分）</span>' : '') + '</div>';
      if (q.options && q.options.length) {
        h += '<div class="pq-opts">' + q.options.map(function (o) {
          return '<span>' + o.k + '. ' + chemHtml(o.t) + '</span>';
        }).join('') + '</div>';
      }
      if (withAnswers) {
        h += '<div class="pq-ans">答案：' + esc(q.type === 'essay' ? (q.analysis || '') : QB.answerText(q)) +
          (item.picked ? '　（作答：' + esc(item.picked.join('') || '未答') + '）' : '') + '</div>';
      } else {
        h += '<div class="pq-blank"></div>';
      }
      h += '</div>';
    });
    area.innerHTML = h;
    window.print();
  }

  function printExam(r) {
    printPaper(r.perQ.map(function (it) {
      return { q: store.get(it.id), picked: it.picked, score: it.max };
    }).filter(function (x) { return !!x.q; }), true, r.full);
  }

  App.views = Views;
  App.practiceHotkey = handleHotkey;
  App.openPracticeSetup = openPracticeSetup;
  App.printPaper = printPaper;
  App.startPracticeByIds = function (ids) {
    startPractice({ chapters: [], types: [], range: 'all', limit: 0, order: 'none' }, ids.slice());
  };
})(window);
