/* motion.js —— 动效增强：数字滚动、进度/图表/环形入场、撒花 */
(function (global) {
  'use strict';
  var App = global.App || (global.App = {});
  var reduce = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var M = App.motion = { enabled: !reduce };

  function raf(fn) { return global.requestAnimationFrame(fn); }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  /* ---------------- 数字滚动 ---------------- */
  function splitNumber(raw) {
    var m = /^(\d[\d,]*)([\s\S]*)$/.exec(raw);
    if (!m) return null;
    return {
      value: parseInt(m[1].replace(/,/g, ''), 10),
      grouped: m[1].indexOf(',') >= 0,
      rest: m[2]
    };
  }

  function tweenNode(node, to, dur, grouped, rest) {
    var start = (global.performance || Date).now();
    var stopped = false;
    function paint(v) {
      node.nodeValue = (grouped ? v.toLocaleString('zh-CN') : String(v)) + rest;
    }
    function frame() {
      if (stopped) return;
      var t = Math.min(1, ((global.performance || Date).now() - start) / dur);
      paint(Math.round(to * easeOut(t)));
      if (t < 1) raf(frame);
      else stopped = true;
    }
    raf(frame);
    // 兜底：即使 rAF 被浏览器挂起（切到后台标签页等），也一定落到最终值
    setTimeout(function () {
      stopped = true;
      paint(to);
    }, dur + 90);
  }

  M.countUp = function (root) {
    if (!M.enabled) return;
    each(root.querySelectorAll('.stat-value, .ring-label b, .result-score b, .done-stats b'), function (el) {
      var node = el.firstChild;
      if (!node || node.nodeType !== 3) return;
      var p = splitNumber(node.nodeValue);
      if (!p || p.value <= 0) return;
      tweenNode(node, p.value, Math.min(900, 420 + p.value * 4), p.grouped, p.rest);
    });
  };

  /* ---------------- 进度条 / 图表 / 环形 ---------------- */
  M.bars = function (root) {
    if (!M.enabled) return;
    each(root.querySelectorAll('.bar > i'), function (el, i) {
      var target = el.style.width;
      if (!target || target === '0%') return;
      el.style.width = '0%';
      setTimeout(function () { el.style.width = target; }, 70 + Math.min(i, 14) * 45);
    });
  };

  M.charts = function (root) {
    if (!M.enabled) return;
    each(root.querySelectorAll('.chart-bar'), function (el, i) {
      var target = el.style.height;
      if (!target || target === '0%') return;
      el.style.height = '0%';
      setTimeout(function () { el.style.height = target; }, 50 + i * 28);
    });
  };

  M.ring = function (root) {
    if (!M.enabled) return;
    var el = root.querySelector('.ring-fg');
    if (!el) return;
    var dash = parseFloat(el.style.strokeDasharray);
    var target = el.style.strokeDashoffset;
    if (!dash || !target) return;
    el.style.strokeDashoffset = dash;
    setTimeout(function () { el.style.strokeDashoffset = target; }, 90);
  };

  /* ---------------- 撒花 ---------------- */
  M.confetti = function (opts) {
    if (!M.enabled) return;
    opts = opts || {};
    var count = opts.count || 80;
    var colors = ['#6366f1', '#8b5cf6', '#22d3ee', '#f472b6', '#fbbf24', '#34d399'];
    var W = global.innerWidth;
    var H = global.innerHeight;
    var dpr = Math.min(2, global.devicePixelRatio || 1);

    var cv = document.createElement('canvas');
    cv.className = 'confetti-canvas';
    cv.width = W * dpr;
    cv.height = H * dpr;
    document.body.appendChild(cv);
    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);

    var parts = [];
    for (var i = 0; i < count; i++) {
      parts.push({
        x: W / 2 + (Math.random() - 0.5) * W * 0.35,
        y: H * 0.46 + (Math.random() - 0.5) * 70,
        vx: (Math.random() - 0.5) * 10,
        vy: -Math.random() * 12 - 3,
        g: 0.34 + Math.random() * 0.2,
        w: 5 + Math.random() * 6,
        h: 8 + Math.random() * 9,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.32,
        color: colors[(Math.random() * colors.length) | 0]
      });
    }

    var start = (global.performance || Date).now();
    function frame() {
      var sec = ((global.performance || Date).now() - start) / 1000;
      ctx.clearRect(0, 0, W, H);
      var alive = 0;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.vy += p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        var life = Math.max(0, 1 - sec / 2.0);
        if (p.y > H + 60) life = 0;
        if (life <= 0) continue;
        alive++;
        ctx.save();
        ctx.globalAlpha = life;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (alive && sec < 2.4) raf(frame);
      else if (cv.parentNode) cv.parentNode.removeChild(cv);
    }
    raf(frame);
  };

  /* ---------------- 页面级总入口 ---------------- */
  M.page = function (root) {
    if (!root) return;
    M.ring(root);
    M.bars(root);
    M.charts(root);
    M.countUp(root);
  };
})(window);
