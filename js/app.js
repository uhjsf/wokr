/* app.js —— 路由、启动、主题 */
(function (global) {
  'use strict';
  var App = global.App, U = App.util, store = App.store;
  var ROUTES = { home: '首页', practice: '刷题', exam: '考试', bank: '题库', wrong: '错题本', fav: '收藏', stats: '统计', settings: '设置' };

  function routeName() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var name = h.split('/')[0] || 'home';
    return ROUTES[name] ? name : 'home';
  }

  function highlightNav(name) {
    U.$$('[data-nav]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === name);
    });
    var map = { bank: 'home', wrong: 'practice', fav: 'practice' };
    var tab = map[name] || name;
    U.$$('.tabbar [data-nav]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === tab);
    });
  }

  App.render = function () {
    var name = routeName();
    // 每次渲染换一个新的 #view 节点，避免事件监听器叠加
    var old = document.getElementById('view');
    var view = old.cloneNode(false);
    old.parentNode.replaceChild(view, old);
    var fn = App.views && App.views[name];
    var r;
    try {
      r = fn ? fn() : null;
    } catch (err) {
      console.error(err);
      view.innerHTML = '<div class="page"><div class="alert alert-warn">页面渲染出错：' + U.esc(err.message || err) + '</div></div>';
      return;
    }
    if (!r) {
      view.innerHTML = '<div class="page">' + App.ui.empty('页面不存在', '', '<a class="btn btn-primary" href="#/home">回首页</a>') + '</div>';
      return;
    }
    view.innerHTML = r.html;
    if (r.mount) {
      try { r.mount(view); } catch (err) { console.error(err); }
    }
    highlightNav(name);
    document.title = ROUTES[name] + ' · 题库刷题系统';
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  App.applyTheme = function () {
    var t = store.settings.theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    var btn = document.getElementById('btn-theme');
    if (btn) btn.textContent = t === 'dark' ? '☀' : '◐';
  };

  App.applyFont = function () {
    var s = store.settings.fontScale || 1;
    document.documentElement.style.setProperty('--qscale', s);
  };

  function boot() {
    store.loadBank();
    App.applyTheme();
    App.applyFont();

    if (!location.hash) location.hash = '#/home';
    App.render();

    window.addEventListener('hashchange', function () { App.render(); });

    var themeBtn = document.getElementById('btn-theme');
    if (themeBtn) {
      themeBtn.addEventListener('click', function () {
        store.settings.theme = store.settings.theme === 'dark' ? 'light' : 'dark';
        store.saveSettings();
        App.applyTheme();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (routeName() !== 'practice') return;
      var t = e.target;
      var tag = (t.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!App.practiceHotkey) return;
      App.practiceHotkey(e, document.getElementById('view'));
    });

    // 练习会话恢复提示
    var saved = store.loadSession();
    if (saved && saved.idx > 0 && routeName() === 'home') {
      // 仅在首页给一个入口（已在首页 UI 中体现），这里不打扰
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
