/* views.js —— 共享组件 / 首页 / 刷题 / 考试 */
(function (global) {
  'use strict';
  var App = global.App, U = App.util, QB = global.QB, store = App.store;
  var esc = U.esc, $ = U.$, $$ = U.$$;
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
    if (q.chapter) h += '<span class="tag">' + esc(q.chapter) + '</span>';
    if (q.level) h += '<span class="tag">' + esc(q.level) + '</span>';
    if (!q.valid) h += '<span class="tag tag-warn">题目信息不完整</span>';
    return h;
  }
  function stemHtml(q) {
    var s = esc(q.stem)
      .replace(/（\s*）/g, '（<i class="blank"></i>）')
      .replace(/\(\s*\)/g, '（<i class="blank"></i>）');
    return '<div class="qstem">' + s + '</div>';
  }
  function optLetter(k) { return '<span class="ok">' + k + '</span>'; }

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
          optLetter(o.k) + '<span class="otxt">' + esc(o.t) + '</span>' +
          (opts.reveal && q.answer.indexOf(o.k) >= 0 ? '<span class="mark">✓</span>' : '') +
          '</button>';
      });
    }
    html += '</div>';
    return html;
  }

  function feedbackHtml(q, st) {
    if (!st || !st.done) return '';
    var ok = st.ok;
    var h = '<div class="feedback ' + (ok ? 'ok' : 'bad') + '">';
    h += '<div class="fb-title">' + (ok ? '✓ 回答正确' : '✕ 回答错误') + '</div>';
    if (q.type === 'essay') {
      h += '<div class="fb-answer"><b>参考答案：</b>' + esc(q.analysis || '（无参考答案）') + '</div>';
      return h + '</div>';
    }
    if (!ok) {
      h += '<div class="fb-answer"><b>正确答案：</b>' + esc(QB.answerText(q)) + '</div>';
    }
    if (q.analysis) h += '<div class="fb-answer"><b>解析：</b>' + esc(q.analysis) + '</div>';
    h += '</div>';
    return h;
  }

  function progressBar(pct) {
    return '<div class="bar"><i style="width:' + Math.min(100, Math.max(0, pct * 100)).toFixed(1) + '%"></i></div>';
  }

  function empty(title, desc, action) {
    return '<div class="empty"><div class="empty-ico">◍</div><h3>' + esc(title) + '</h3>' +
      '<p>' + esc(desc || '') + '</p>' + (action || '') + '</div>';
  }

  function statCard(label, value, sub, tone) {
    return '<div class="stat-card ' + (tone || '') + '">' +
      '<div class="stat-label">' + esc(label) + '</div>' +
      '<div class="stat-value">' + value + '</div>' +
      (sub ? '<div class="stat-sub">' + sub + '</div>' : '') + '</div>';
  }

  function fmtCount(n) { return (n || 0).toLocaleString('zh-CN'); }
  function pct(x) { return (x * 100).toFixed(x >= 0.995 || x === 0 ? 0 : 1) + '%'; }

  App.ui = {
    typeChip: typeChip, metaLine: metaLine, stemHtml: stemHtml, optionsHtml: optionsHtml,
    feedbackHtml: feedbackHtml, progressBar: progressBar, empty: empty, statCard: statCard,
    fmtCount: fmtCount, pct: pct, TYPE_CLASS: TYPE_CLASS
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
        '<svg viewBox="0 0 120 120" class="ring"><circle cx="60" cy="60" r="52" class="ring-bg"/>' +
        '<circle cx="60" cy="60" r="52" class="ring-fg" style="stroke-dasharray:' + (2 * Math.PI * 52).toFixed(1) +
          ';stroke-dashoffset:' + (2 * Math.PI * 52 * (1 - st.coverage)).toFixed(1) + '"/></svg>' +
        '<div class="ring-label"><b>' + Math.round(st.coverage * 100) + '%</b><span>已练习</span></div>' +
      '</div>' +
    '</section>';

    html += '<section class="stat-row">' +
      statCard('已练习题目', fmtCount(st.answered) + '<span class="unit">题</span>', '覆盖 ' + pct(st.coverage)) +
      statCard('累计答题', fmtCount(st.attempts) + '<span class="unit">次</span>', '正确率 ' + (st.attempts ? pct(st.accuracy) : '—'), 'tone-blue') +
      statCard('错题本', fmtCount(st.wrong) + '<span class="unit">题</span>', '答对两次自动移出', 'tone-red') +
      statCard('连续打卡', fmtCount(store.streak()) + '<span class="unit">天</span>', '收藏 ' + fmtCount(st.fav) + ' 题', 'tone-amber') +
    '</section>';

    html += '<div class="grid-2">';

    html += '<section class="card">' +
      '<div class="card-head"><h2>章节掌握度</h2><a class="link" href="#/stats">全部 ></a></div>' +
      '<div class="chapter-list">' +
      cs.slice(0, 8).map(function (c) {
        return '<div class="chapter-row">' +
          '<div class="cr-name" title="' + esc(c.name) + '">' + esc(c.name) + '</div>' +
          '<div class="cr-bar">' + progressBar(c.coverage) + '</div>' +
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
      if (f.types.length && f.types.indexOf(q.type) < 0) return false;
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
    ['single', 'multi', 'judge', 'essay'].forEach(function (t) {
      var on = f.types.indexOf(t) >= 0;
      h += '<button class="chip chip-btn ' + (on ? 'on' : '') + '" data-type="' + t + '">' +
        QB.TYPES[t] + ' <i>' + store.questions.filter(function (q) { return q.type === t; }).length + '</i></button>';
    });
    h += '</div></div>';

    h += '<div class="fp-group"><div class="fp-title">范围</div><div class="chips">';
    ranges.forEach(function (r) {
      h += '<button class="chip chip-btn ' + (f.range === r.k ? 'on' : '') + '" data-range="' + r.k + '">' + r.t + '</button>';
    });
    h += '</div></div>';

    h += '<div class="fp-group"><div class="fp-title">章节 <button class="link" data-act="all-chapters">全选</button>' +
      '<button class="link" data-act="none-chapters">清空</button></div>' +
      '<div class="chapter-picker">';
    store.chapters.forEach(function (c) {
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
          var t = e.target.closest('[data-type],[data-range],[data-limit],[data-act]');
          if (!t) return;
          if (t.hasAttribute('data-type')) {
            var ty = t.getAttribute('data-type');
            var i = f.types.indexOf(ty);
            if (i >= 0) f.types.splice(i, 1); else f.types.push(ty);
          } else if (t.hasAttribute('data-range')) {
            f.range = t.getAttribute('data-range');
          } else if (t.hasAttribute('data-limit')) {
            f.limit = parseInt(t.getAttribute('data-limit'), 10);
          } else if (t.getAttribute('data-act') === 'all-chapters') {
            f.chapters = store.chapters.map(function (c) { return c.id; });
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
      if (f.types.length && f.types.indexOf(q.type) < 0) return false;
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

  function practiceCardHtml() {
    var s = S.practice;
    if (!s) return '';
    while (s.idx < s.pool.length && !store.get(s.pool[s.idx])) s.idx += 1;
    if (s.idx >= s.pool.length) return practiceDoneHtml();
    var q = currentPracticeQ();
    if (!q) return practiceDoneHtml();
    var st = s.answers[q.id] || null;
    var optList = q.type === 'judge' ? null : orderedOptions(q, s);
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
      if (st && st.done) {
        html += feedbackHtml(q, st);
      }
      html += '<div class="essay-actions">' +
        (st && st.done
          ? '<span class="muted">已自评：' + (st.ok ? '会做' : '不会') + '</span>'
          : '<button class="btn btn-ghost" data-act="reveal">查看参考答案</button>' +
            '<button class="btn btn-danger-soft" data-act="essay-no">不会</button>' +
            '<button class="btn btn-success" data-act="essay-yes">会做</button>') +
        '</div>';
    }

    html += feedbackHtml(q, st);

    html += '<div class="qfoot">' +
      '<button class="btn btn-ghost" data-act="prev" ' + (s.idx === 0 ? 'disabled' : '') + '>‹ 上一题</button>' +
      '<div class="qfoot-mid">' +
        (q.type === 'multi' && !(st && st.done) ? '<button class="btn btn-primary" data-act="submit">提交答案</button>' : '') +
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
    var answered = Object.keys(s.answers).length;
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
      '<div id="practice-card">' + practiceCardHtml() + '</div>' +
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
          if (s.idx > 0) { s.idx -= 1; saveSession(); refreshCard(root); }
          break;
        case 'reveal':
          var q3 = currentPracticeQ();
          U.modal({
            title: '参考答案',
            html: '<div class="answer-block">' + esc(q3.analysis || '（无参考答案）') + '</div>'
          });
          break;
        case 'essay-yes':
        case 'essay-no':
          var q4 = currentPracticeQ();
          var yes = act === 'essay-yes';
          s.answers[q4.id] = { picked: [], done: true, ok: yes };
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

    root.addEventListener('keydown', function (e) { handleHotkey(e, root); });
  }

  function handleHotkey(e, root) {
    var s = S.practice;
    if (!s || s.idx >= s.pool.length) return;
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
  }

  function refreshCard(root) {
    var box = root.querySelector('#practice-card');
    var s = S.practice;
    if (!box) { App.render(); return; }
    box.innerHTML = practiceCardHtml();
    var top = root.querySelector('.practice-top .muted');
    if (top && s) top.textContent = '已答 ' + Object.keys(s.answers).length + ' / ' + s.pool.length;
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
  function examConfigHtml(cfg) {
    var h = '<div class="exam-config">';
    h += '<div class="cfg-sec"><h4>题型与数量</h4><div class="cfg-types">';
    ['single', 'multi', 'judge', 'essay'].forEach(function (t) {
      var avail = store.validQuestions.filter(function (q) { return q.type === t; }).length;
      h += '<div class="cfg-row"><span class="cfg-name">' + QB.TYPES[t] + '<i class="muted">（题库 ' + fmtCount(avail) + ' 道）</i></span>' +
        '<div class="stepper"><button data-step="-1" data-t="' + t + '">−</button>' +
        '<input type="number" min="0" value="' + (cfg.counts[t] || 0) + '" data-count="' + t + '">' +
        '<button data-step="1" data-t="' + t + '">+</button></div></div>';
    });
    h += '</div></div>';
    h += '<div class="cfg-sec"><h4>章节范围</h4><div class="chapter-picker">';
    store.chapters.forEach(function (c) {
      var on = !cfg.chapters.length || cfg.chapters.indexOf(c.id) >= 0;
      h += '<label class="pick ' + (on ? 'on' : '') + '"><input type="checkbox" data-xchapter="' + c.id + '" ' + (on ? 'checked' : '') + '><span>' + esc(c.name) + '</span></label>';
    });
    h += '</div><div class="muted small">' + (cfg.chapters.length && cfg.chapters.length < store.chapters.length
      ? '已选 ' + cfg.chapters.length + ' 个章节（可继续点击增减）' : '默认包含全部章节，点击可取消个别章节') + '</div></div>';
    h += '<div class="cfg-sec"><h4>考试时长（分钟）</h4><div class="chips">';
    [10, 20, 30, 45, 60, 90, 0].forEach(function (m) {
      h += '<button class="chip chip-btn ' + (cfg.minutes === m ? 'on' : '') + '" data-min="' + m + '">' + (m ? m + ' 分钟' : '不限时') + '</button>';
    });
    h += '</div></div>';
    h += '<div class="cfg-sec"><h4>选项</h4><div class="set-row flat"><div><b>打乱选项顺序</b>' +
      '<div class="muted small">避免死记选项位置</div></div>' +
      '<label class="switch"><input type="checkbox" data-shuffle ' + (cfg.shuffle ? 'checked' : '') + '><i></i></label></div></div>';
    h += '</div>';
    return h;
  }

  function examPoolFor(cfg) {
    var pool = [];
    cfg.types.forEach(function (t) {
      var n = cfg.counts[t] || 0;
      if (!n) return;
      var list = store.validQuestions.filter(function (q) {
        if (q.type !== t) return false;
        if (cfg.chapters.length && cfg.chapters.indexOf(q.chapterId) < 0) return false;
        return true;
      });
      pool = pool.concat(U.shuffle(list).slice(0, n));
    });
    return U.shuffle(pool);
  }

  function totalOf(cfg) {
    var n = 0;
    for (var t in cfg.counts) n += cfg.counts[t] || 0;
    return n;
  }

  Views.exam = function () {
    if (S.exam && !S.exam.submitted) return examRunView();
    if (S.result) return examResultView();
    return examSetupView();
  };

  function examSetupView() {
    var cfg = S.examCfg || (S.examCfg = {
      types: ['single', 'multi', 'judge'],
      counts: { single: 30, multi: 10, judge: 20, essay: 0 },
      chapters: [], minutes: 45, shuffle: false
    });
    var html = '<div class="page">' +
      '<div class="page-head"><h1>组卷考试</h1><p class="muted">按题型与章节自动抽取题目，限时作答，交卷即时评分。</p></div>' +
      '<div class="card">' + examConfigHtml(cfg) + '</div>' +
      '<div class="exam-start"><span class="muted">共 <b id="exam-total">' + totalOf(cfg) + '</b> 题</span>' +
      '<div class="exam-start-actions">' +
        '<button class="btn btn-ghost btn-lg" data-act="print-paper">生成试卷</button>' +
        '<button class="btn btn-primary btn-lg" data-act="start-exam">开始考试</button>' +
      '</div></div>' +
      '</div>';

    return {
      html: html,
      mount: function (root) {
        root.addEventListener('click', function (e) {
          var el = e.target.closest('[data-step],[data-min],[data-act]');
          if (!el) return;
          if (el.hasAttribute('data-step') || el.hasAttribute('data-min')) {
            if (el.hasAttribute('data-step')) {
              var t = el.getAttribute('data-t');
              var d = parseInt(el.getAttribute('data-step'), 10);
              var inp = root.querySelector('input[data-count="' + t + '"]');
              var v = Math.max(0, Math.min(999, (parseInt(inp.value, 10) || 0) + d));
              inp.value = v;
              cfg.counts[t] = v;
              if (v > 0 && cfg.types.indexOf(t) < 0) cfg.types.push(t);
              root.querySelector('#exam-total').textContent = totalOf(cfg);
            } else {
              cfg.minutes = parseInt(el.getAttribute('data-min'), 10);
              $$('.chips [data-min]', root).forEach(function (b) { b.classList.toggle('on', b === el); });
            }
            return;
          }
          var act = el && el.getAttribute('data-act');
          if (act === 'print-paper') {
            var p2 = examPoolFor(cfg);
            if (!p2.length) { U.toast('没有符合条件的题目', 'warn'); return; }
            U.modal({
              title: '生成试卷（' + p2.length + ' 题）',
              size: 'md',
              html: '<p class="muted">将打开浏览器打印窗口，可另存为 PDF 或直接打印。</p>' +
                    '<div class="chips" style="margin-top:12px">' +
                    '<b>包含：</b>' + (function () {
                      var c = {};
                      p2.forEach(function (x) { c[x.type] = (c[x.type] || 0) + 1; });
                      return QB.TYPE_ORDER.filter(function (t) { return c[t]; })
                        .map(function (t) { return '<span class="chip ' + TYPE_CLASS[t] + '">' + QB.TYPES[t] + ' ' + c[t] + '</span>'; }).join('');
                    })() + '</div>',
              footer: '<button class="btn btn-ghost" data-print="0">打印（不含答案）</button>' +
                      '<button class="btn btn-primary" data-print="1">打印（含答案）</button>',
              onMount: function (wrap, close) {
                U.on(wrap, 'click', '[data-print]', function (e, b) {
                  var withAns = b.getAttribute('data-print') === '1';
                  close();
                  printPaper(p2.map(function (x) { return { q: x, picked: null }; }), withAns);
                });
              }
            });
            return;
          }
          if (act === 'start-exam') {
            var total = totalOf(cfg);
            if (!total) { U.toast('请先设置题目数量', 'warn'); return; }
            var pool = examPoolFor(cfg);
            if (!pool.length) { U.toast('没有符合条件的题目', 'warn'); return; }
            S.exam = {
              pool: pool.map(function (q) { return q.id; }),
              idx: 0,
              answers: {},
              startedAt: Date.now(),
              duration: cfg.minutes * 60,
              submitted: false,
              shuffle: cfg.shuffle,
              order: {}
            };
            S.result = null;
            App.render();
          }
        });
        root.addEventListener('change', function (e) {
          var inp = e.target.closest('input[data-count]');
          if (inp) {
            var t2 = inp.getAttribute('data-count');
            cfg.counts[t2] = Math.max(0, parseInt(inp.value, 10) || 0);
            root.querySelector('#exam-total').textContent = totalOf(cfg);
            return;
          }
          var cb = e.target.closest('input[data-xchapter]');
          if (cb) {
            var id = cb.getAttribute('data-xchapter');
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
    return store.get(e.pool[e.idx]);
  }

  function examRunView() {
    var e = S.exam;
    var answered = Object.keys(e.answers).filter(function (k) { return (e.answers[k].picked || []).length || e.answers[k].done; }).length;
    var html = '<div class="page exam-page">' +
      '<div class="exam-bar">' +
        '<div class="exam-timer" id="exam-timer">' + (e.duration ? U.fmtClock(e.duration - (Date.now() - e.startedAt) / 1000) : '不限时') + '</div>' +
        '<div class="exam-progress">已答 <b>' + answered + '</b> / ' + e.pool.length + '</div>' +
        '<button class="btn btn-danger" data-act="submit-exam">交卷</button>' +
      '</div>' +
      '<div class="exam-layout">' +
        '<div class="exam-main" id="exam-card">' + examCardHtml() + '</div>' +
        '<aside class="exam-side">' +
          '<div class="side-title">答题卡</div>' +
          '<div class="sheet">' + e.pool.map(function (id, i) {
            var a = e.answers[id];
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
            if (e2.idx < e2.pool.length - 1) { e2.idx += 1; App.render(); }
            else if (e2.duration && (Date.now() - e2.startedAt) / 1000 >= e2.duration) submitExam();
            else U.toast('已经是最后一题了');
          } else if (act === 'prev') {
            if (e2.idx > 0) { e2.idx -= 1; App.render(); }
          } else if (act === 'submit-exam') {
            var left = e2.pool.length - Object.keys(e2.answers).filter(function (k) {
              var x = e2.answers[k]; return (x.picked && x.picked.length) || x.done;
            }).length;
            if (left > 0 && !confirm('还有 ' + left + ' 题未作答，确定交卷吗？')) return;
            submitExam();
          }
        });
        startExamTimer();
      }
    };
  }

  function examCardHtml() {
    var q = examQ();
    if (!q) return '';
    var e = S.exam;
    var a = e.answers[q.id] || { picked: [] };
    var list = q.type === 'judge' ? q : { type: q.type, options: orderedOptions(q, e), answer: q.answer, stem: q.stem };
    var h = '<div class="qcard">';
    h += '<div class="qmeta">' + metaLine(q) + '<span class="qcount">第 ' + (e.idx + 1) + ' / ' + e.pool.length + ' 题</span></div>';
    h += stemHtml(q);
    h += optionsHtml(list, a.picked, {});
    if (q.type === 'essay') {
      h += '<div class="muted small" style="margin-top:12px">综合题不参与自动判分，交卷后可在解析中对照参考答案。</div>';
    }
    h += '<div class="qfoot"><button class="btn btn-ghost" data-act="prev" ' + (e.idx === 0 ? 'disabled' : '') + '>‹ 上一题</button>' +
      '<div></div><button class="btn btn-primary" data-act="next" ' + (e.idx === e.pool.length - 1 ? 'disabled' : '') + '>下一题 ›</button></div>';
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
      var id = e.pool[i];
      var a = e.answers[id];
      b.classList.toggle('done', !!(a && a.picked && a.picked.length));
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
    var right = 0, graded = 0;
    e.pool.forEach(function (id) {
      var q = store.get(id);
      if (!q) return;
      var a = e.answers[id] || { picked: [] };
      var ok;
      if (q.type === 'essay') {
        ok = null;
      } else {
        ok = QB.judgeAnswer(q, a.picked);
        graded += 1;
        if (ok) right += 1;
        store.record(q, ok);
      }
      perQ.push({ id: id, picked: a.picked, ok: ok });
    });
    var score = graded ? Math.round(right / graded * 100) : 0;
    S.result = {
      at: Date.now(),
      total: e.pool.length,
      graded: graded,
      right: right,
      score: score,
      dur: Math.round((Date.now() - e.startedAt) / 1000),
      perQ: perQ,
      name: '模拟考试'
    };
    store.addHistory({
      type: 'exam', at: Date.now(), total: graded, right: right, score: score,
      dur: S.result.dur, name: '模拟考试'
    });
    S.exam = null;
    App.render();
  }

  function examResultView() {
    var r = S.result;
    var html = '<div class="page">';
    html += '<div class="result-hero ' + (r.score >= 60 ? 'pass' : 'fail') + '">' +
      '<div class="result-score"><b>' + r.score + '</b><span>分</span></div>' +
      '<div class="result-info">' +
        '<h2>' + (r.score >= 60 ? '恭喜通过' : '继续加油') + '</h2>' +
        '<p>答对 ' + r.right + ' / ' + r.graded + ' 题 · 用时 ' + U.fmtDur(r.dur) + '</p>' +
      '</div>' +
      '<div class="result-actions">' +
        '<button class="btn btn-ghost" data-act="print">打印试卷</button>' +
        '<a class="btn btn-primary" href="#/exam" data-act="new-exam">再考一次</a>' +
      '</div>' +
    '</div>';

    html += '<div class="card"><div class="card-head"><h2>逐题解析</h2><span class="muted">可对照答案复习</span></div>';
    r.perQ.forEach(function (item, i) {
      var q = store.get(item.id);
      if (!q) return;
      var cls = item.ok === null ? 'skip' : (item.ok ? 'ok' : 'bad');
      html += '<div class="review-item ' + cls + '">' +
        '<div class="review-head"><span class="review-no">' + (i + 1) + '</span>' + metaLine(q) +
        '<span class="review-mark">' + (item.ok === null ? '未判分' : (item.ok ? '✓ 正确' : '✕ 错误')) + '</span></div>' +
        stemHtml(q);
      if (q.type !== 'essay') {
        html += optionsHtml(q, item.picked, { reveal: true });
        html += '<div class="review-ans">你的答案：<b>' + (item.picked.join('') || '未作答') + '</b>　正确答案：<b>' + esc(QB.answerText(q)) + '</b></div>';
      }
      if (q.analysis) html += '<div class="review-expl"><b>解析：</b>' + esc(q.analysis) + '</div>';
      html += '</div>';
    });
    html += '</div></div>';

    return {
      html: html,
      mount: function (root) {
        root.addEventListener('click', function (e) {
          var el = e.target.closest('[data-act]');
          if (!el) return;
          if (el.getAttribute('data-act') === 'print') printExam(S.result);
          if (el.getAttribute('data-act') === 'new-exam') { S.result = null; }
        });
      }
    };
  }

  function printPaper(items, withAnswers) {
    var area = document.getElementById('print-area');
    if (!area) {
      area = document.createElement('div');
      area.id = 'print-area';
      document.body.appendChild(area);
    }
    var h = '<h1>试卷</h1><p class="print-meta">共 ' + items.length + ' 题 · ' +
      U.fmtDate(Date.now()) + (withAnswers ? ' · 含答案' : '') + '</p>';
    items.forEach(function (item, i) {
      var q = item.q;
      if (!q) return;
      h += '<div class="print-q"><div class="pq-stem">' + (i + 1) + '. ' + esc(q.stem) + '</div>';
      if (q.options && q.options.length) {
        h += '<div class="pq-opts">' + q.options.map(function (o) {
          return '<span>' + o.k + '. ' + esc(o.t) + '</span>';
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
      return { q: store.get(it.id), picked: it.picked };
    }).filter(function (x) { return !!x.q; }), true);
  }

  App.views = Views;
  App.practiceHotkey = handleHotkey;
  App.openPracticeSetup = openPracticeSetup;
  App.printPaper = printPaper;
  App.startPracticeByIds = function (ids) {
    startPractice({ chapters: [], types: [], range: 'all', limit: 0, order: 'none' }, ids.slice());
  };
})(window);
