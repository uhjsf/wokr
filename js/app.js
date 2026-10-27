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
    document.title = ROUTES[name] + ' · 智题';
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (App.motion) {
      try { App.motion.page(view); } catch (err) { console.error(err); }
    }
  };

  /* 视觉氛围（胶片颗粒 + 暗角）单独开关，随时可以关掉 */
  App.applyFx = function () {
    var on = store.settings.grain !== false;
    document.documentElement.setAttribute('data-fx', on ? 'on' : 'off');
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
    App.applyFx();
    App.applyFont();

    if (!location.hash) location.hash = '#/home';
    App.render();

    window.addEventListener('hashchange', function () { App.render(); });

    // 顶栏：滚动后加深阴影，产生"浮起来"的层次
    var topbar = document.querySelector('.topbar');
    if (topbar) {
      var scrollTick = false;
      var bgShift = -1;
      window.addEventListener('scroll', function () {
        if (scrollTick) return;
        scrollTick = true;
        requestAnimationFrame(function () {
          scrollTick = false;
          var y = window.scrollY || 0;
          topbar.classList.toggle('scrolled', y > 6);
          // 背景极光随滚动轻微下移，制造前后层视差（上限 140px，越滚越慢）
          var v = Math.min(140, y * 0.08);
          if (Math.abs(v - bgShift) > 0.5) {
            bgShift = v;
            document.documentElement.style.setProperty('--bg-shift', v.toFixed(1) + 'px');
          }
        });
      }, { passive: true });
    }

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

    // 卡片鼠标聚光：把指针位置写进 CSS 变量
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce && window.matchMedia && window.matchMedia('(hover: hover)').matches) {
      var pending = false, lastEvt = null;
      document.addEventListener('pointermove', function (e) {
        lastEvt = e;
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () {
          pending = false;
          var t = lastEvt.target;
          var el = t && t.closest ? t.closest('.card, .stat-card, .hero') : null;
          if (!el) return;
          var r = el.getBoundingClientRect();
          el.style.setProperty('--mx', (lastEvt.clientX - r.left).toFixed(0) + 'px');
          el.style.setProperty('--my', (lastEvt.clientY - r.top).toFixed(0) + 'px');
        });
      }, { passive: true });
    }

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
