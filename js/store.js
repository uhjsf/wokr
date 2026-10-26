/* store.js —— 题库加载、进度、错题、收藏、统计 */
(function (global) {
  'use strict';
  var App = global.App || (global.App = {});
  var U = App.util;
  var K = {
    settings: 'qb.settings.v1',
    progress: 'qb.progress.v1',
    wrong: 'qb.wrong.v1',
    fav: 'qb.fav.v1',
    history: 'qb.history.v1',
    days: 'qb.days.v1',
    customBank: 'qb.customBank.v1',
    session: 'qb.session.v1'
  };

  var DEFAULTS = {
    theme: 'light',
    autoNext: true,
    shuffleOptions: false,
    fontScale: 1,
    lastChapter: ''
  };

  var store = {};

  /* ---------- 题库 ---------- */
  store.bank = null;
  store.map = {};
  store.questions = [];
  store.chapters = [];
  store.sections = [];
  store.isCustomBank = false;

  store.loadBank = function () {
    var custom = U.Storage.get(K.customBank, null);
    var bank = null;
    if (custom && custom.questions && custom.questions.length) {
      bank = custom;
      store.isCustomBank = true;
    } else if (global.QBANK && global.QBANK.questions) {
      bank = global.QBANK;
      store.isCustomBank = false;
    }
    if (!bank) bank = { meta: { title: '空题库', count: 0 }, chapters: [], sections: [], questions: [] };
    store.applyBank(bank);
    return store.bank;
  };

  store.applyBank = function (bank) {
    // 统一字段，兼容手工制作的 JSON
    if (!bank.meta) bank.meta = {};
    var qs = bank.questions || [];
    var chapters = bank.chapters || [];

    // ---- 科目 ----
    var subjects = bank.subjects && bank.subjects.length ? bank.subjects : null;
    if (!subjects) {
      subjects = [{ id: 's-all', name: (bank.meta && bank.meta.title) || '题库' }];
      chapters.forEach(function (c) { if (!c.subjectId) c.subjectId = 's-all'; });
    }
    var subjectMap = {};
    subjects.forEach(function (s) { subjectMap[s.id] = s; });

    var chByName = {};
    chapters.forEach(function (c) {
      if (!c.subjectId || !subjectMap[c.subjectId]) c.subjectId = subjects[0].id;
      chByName[c.name] = c;
    });

    var map = {};
    var fixed = [];
    for (var i = 0; i < qs.length; i++) {
      var q = qs[i];
      if (!q.id) q.id = 'q' + i;
      if (q.valid === undefined) {
        var ok = true;
        if (q.type === 'single' || q.type === 'multi') {
          if (!q.options || q.options.length < 2) ok = false;
          else if (!q.options.some(function (o) { return String(o.t || '').trim(); })) ok = false;
          if (!q.answer || !q.answer.length) ok = false;
        } else if (q.type === 'judge') {
          if (!q.answer || !q.answer.length) ok = false;
        }
        q.valid = ok;
      }
      if (!q.chapter) q.chapter = '未分章';
      if (!chByName[q.chapter]) {
        chByName[q.chapter] = { id: 'ch' + (chapters.length + 1), name: q.chapter, subjectId: q.subjectId || subjects[0].id };
        chapters.push(chByName[q.chapter]);
      }
      q.chapterId = chByName[q.chapter].id;
      if (!q.subjectId || !subjectMap[q.subjectId]) q.subjectId = chByName[q.chapter].subjectId;
      if (!q.kind) q.kind = (q.type === 'essay' ? 'essay' : q.type);
      map[q.id] = q;
      fixed.push(q);
    }
    store.bank = bank;
    store.questions = fixed;
    store.map = map;
    store.subjects = subjects;
    store.chapters = chapters;
    store.sections = bank.sections || [];
    store.validQuestions = fixed.filter(function (q) { return q.valid; });
    store.meta = bank.meta;
  };

  store.chaptersOf = function (subjectIds) {
    if (!subjectIds || !subjectIds.length) return store.chapters.slice();
    return store.chapters.filter(function (c) { return subjectIds.indexOf(c.subjectId) >= 0; });
  };
  store.subjectName = function (id) {
    for (var i = 0; i < store.subjects.length; i++) if (store.subjects[i].id === id) return store.subjects[i].name;
    return '';
  };

  store.setBank = function (bank) {
    store.applyBank(bank);
    store.isCustomBank = true;
    var saved = U.Storage.set(K.customBank, bank);
    if (!saved) U.toast('题库较大，浏览器存储空间不足：本次仅在当前页面有效', 'warn');
    return saved;
  };

  store.resetBank = function () {
    U.Storage.del(K.customBank);
    store.isCustomBank = false;
    store.loadBank();
  };

  store.get = function (id) { return store.map[id]; };

  /* ---------- 进度 ---------- */
  store.progress = U.Storage.get(K.progress, {});
  store.wrongMap = U.Storage.get(K.wrong, {});
  store.favList = U.Storage.get(K.fav, []);
  store.days = U.Storage.get(K.days, {});
  store.history = U.Storage.get(K.history, []);
  store.settings = Object.assign({}, DEFAULTS, U.Storage.get(K.settings, {}));

  var saveProgress = U.debounce(function () {
    U.Storage.set(K.progress, store.progress);
    U.Storage.set(K.wrong, store.wrongMap);
    U.Storage.set(K.days, store.days);
  }, 400);

  store.saveSettings = function () { U.Storage.set(K.settings, store.settings); };
  store.saveFav = function () { U.Storage.set(K.fav, store.favList); };
  store.saveHistory = function () { U.Storage.set(K.history, store.history.slice(0, 200)); };

  store.record = function (q, correct) {
    if (!q) return;
    var p = store.progress[q.id] || (store.progress[q.id] = { n: 0, ok: 0, t: 0 });
    p.n += 1;
    if (correct) p.ok += 1;
    p.t = Date.now();

    var dk = U.dayKey();
    var d = store.days[dk] || (store.days[dk] = { n: 0, ok: 0 });
    d.n += 1;
    if (correct) d.ok += 1;

    if (correct === false) {
      var w = store.wrongMap[q.id] || (store.wrongMap[q.id] = { c: 0, t: 0 });
      w.c += 1; w.t = Date.now();
      // 连续答对 2 次自动移出错题本
      w.streak = 0;
    } else if (correct === true && store.wrongMap[q.id]) {
      var wr = store.wrongMap[q.id];
      wr.streak = (wr.streak || 0) + 1;
      if (wr.streak >= 2) delete store.wrongMap[q.id];
    }
    saveProgress();
  };

  store.recordEssay = function (q, known) {
    if (!q) return;
    store.record(q, known ? true : false);
    if (known) {
      // 会做的综合题不进入错题本
      delete store.wrongMap[q.id];
      U.Storage.set(K.wrong, store.wrongMap);
    }
  };

  store.isWrong = function (id) { return !!store.wrongMap[id]; };
  store.wrongCount = function () { return Object.keys(store.wrongMap).length; };
  store.removeWrong = function (id) {
    delete store.wrongMap[id];
    U.Storage.set(K.wrong, store.wrongMap);
  };
  store.clearWrong = function () {
    store.wrongMap = {};
    U.Storage.set(K.wrong, store.wrongMap);
  };

  store.isFav = function (id) { return store.favList.indexOf(id) >= 0; };
  store.toggleFav = function (id) {
    var i = store.favList.indexOf(id);
    if (i >= 0) store.favList.splice(i, 1);
    else store.favList.push(id);
    store.saveFav();
    return i < 0;
  };

  store.progressOf = function (id) { return store.progress[id] || null; };

  /* ---------- 统计 ---------- */
  store.stats = function () {
    var answered = 0, attempts = 0, right = 0;
    for (var id in store.progress) {
      var p = store.progress[id];
      answered += 1;
      attempts += p.n;
      right += p.ok;
    }
    var total = store.validQuestions ? store.validQuestions.length : store.questions.length;
    return {
      total: total,
      answered: answered,
      attempts: attempts,
      right: right,
      accuracy: attempts ? right / attempts : 0,
      coverage: total ? answered / total : 0,
      wrong: store.wrongCount(),
      fav: store.favList.length
    };
  };

  store.chapterStats = function () {
    var res = [];
    store.chapters.forEach(function (ch) {
      var qs = store.questions.filter(function (q) { return q.chapterId === ch.id; });
      var valid = qs.filter(function (q) { return q.valid; });
      var done = 0, att = 0, ok = 0;
      qs.forEach(function (q) {
        if (q.type === 'essay') return;
        var p = store.progress[q.id];
        if (p) { done += 1; att += p.n; ok += p.ok; }
      });
      res.push({
        id: ch.id, name: ch.name,
        total: qs.length, practiceable: valid.filter(function (q) { return q.type !== 'essay'; }).length,
        done: done, attempts: att, right: ok,
        accuracy: att ? ok / att : 0,
        coverage: valid.length ? done / valid.length : 0
      });
    });
    return res;
  };

  store.typeStats = function () {
    var out = {};
    ['single', 'multi', 'judge', 'essay'].forEach(function (t) {
      var n = 0, att = 0, ok = 0, done = 0;
      store.questions.forEach(function (q) {
        if (q.type !== t) return;
        n += 1;
        var p = store.progress[q.id];
        if (p) { done += 1; att += p.n; ok += p.ok; }
      });
      out[t] = { total: n, done: done, attempts: att, right: ok, accuracy: att ? ok / att : 0 };
    });
    return out;
  };

  store.recentDays = function (n) {
    var out = [], d = new Date();
    for (var i = n - 1; i >= 0; i--) {
      var dd = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
      var key = U.dayKey(dd.getTime());
      var v = store.days[key] || { n: 0, ok: 0 };
      out.push({ key: key, label: (dd.getMonth() + 1) + '/' + dd.getDate(), n: v.n, ok: v.ok });
    }
    return out;
  };

  store.streak = function () {
    var s = 0, d = new Date();
    for (var i = 0; i < 365; i++) {
      var key = U.dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i).getTime());
      var v = store.days[key];
      if (v && v.n > 0) s += 1;
      else if (i === 0) continue; // 今天还没做不算断
      else break;
    }
    return s;
  };

  store.addHistory = function (entry) {
    store.history.unshift(entry);
    if (store.history.length > 200) store.history.length = 200;
    store.saveHistory();
  };

  store.resetAll = function () {
    [K.progress, K.wrong, K.fav, K.days, K.history, K.session].forEach(function (k) { U.Storage.del(k); });
    store.progress = {};
    store.wrongMap = {};
    store.favList = [];
    store.days = {};
    store.history = [];
  };

  store.K = K;
  store.saveSession = function (s) { U.Storage.set(K.session, s); };
  store.loadSession = function () { return U.Storage.get(K.session, null); };
  store.clearSession = function () { U.Storage.del(K.session); };

  App.store = store;
})(window);
