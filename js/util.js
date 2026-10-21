/* util.js —— 通用工具：DOM、存储、提示、弹层、格式化 */
(function (global) {
  'use strict';
  var App = global.App || (global.App = {});

  // ---------- DOM ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function on(root, type, sel, fn) {
    root.addEventListener(type, function (e) {
      var t = e.target.closest(sel);
      if (t && root.contains(t)) fn.call(t, e, t);
    });
  }
  function cls() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      if (!a) continue;
      if (typeof a === 'string') out.push(a);
      else if (Array.isArray(a)) out.push(cls.apply(null, a));
      else for (var k in a) if (a[k]) out.push(k);
    }
    return out.join(' ');
  }

  // ---------- 存储 ----------
  var MEM = {};
  var Storage = {
    get: function (key, def) {
      try {
        var raw = global.localStorage.getItem(key);
        if (raw == null) return key in MEM ? MEM[key] : def;
        return JSON.parse(raw);
      } catch (e) {
        return key in MEM ? MEM[key] : def;
      }
    },
    set: function (key, val) {
      MEM[key] = val;
      try {
        global.localStorage.setItem(key, JSON.stringify(val));
        return true;
      } catch (e) {
        return false; // 容量超限等，退化为内存
      }
    },
    del: function (key) {
      delete MEM[key];
      try { global.localStorage.removeItem(key); } catch (e) {}
    },
    available: (function () {
      try {
        var k = '__t' + Date.now();
        global.localStorage.setItem(k, '1');
        global.localStorage.removeItem(k);
        return true;
      } catch (e) { return false; }
    })()
  };

  // ---------- 提示 ----------
  var toastTimer = null;
  function toast(msg, type) {
    var box = $('#toast');
    if (!box) return;
    box.textContent = msg;
    box.className = 'toast show' + (type ? ' toast-' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.className = 'toast'; }, 2400);
  }

  // ---------- 弹层 ----------
  function modal(opts) {
    var root = $('#modal-root');
    var wrap = document.createElement('div');
    wrap.className = 'modal-mask';
    wrap.innerHTML =
      '<div class="modal ' + (opts.size ? 'modal-' + opts.size : '') + '" role="dialog">' +
        '<div class="modal-head">' +
          '<h3>' + esc(opts.title || '') + '</h3>' +
          '<button class="icon-btn" data-close title="关闭">✕</button>' +
        '</div>' +
        '<div class="modal-body">' + (opts.html || '') + '</div>' +
        (opts.footer ? '<div class="modal-foot">' + opts.footer + '</div>' : '') +
      '</div>';
    root.appendChild(wrap);
    document.body.classList.add('modal-open');

    function close() {
      if (!wrap.parentNode) return;
      wrap.parentNode.removeChild(wrap);
      if (!root.children.length) document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', onKey);
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) close(); });
    on(wrap, 'click', '[data-close]', close);
    if (opts.onMount) opts.onMount(wrap, close);
    return { el: wrap, close: close };
  }

  // ---------- 杂项 ----------
  function debounce(fn, wait) {
    var t = null;
    return function () {
      var self = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait || 200);
    };
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDate(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function fmtTime(ts) {
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    if (h) return h + ' 小时 ' + m + ' 分';
    if (m) return m + ' 分 ' + pad(s) + ' 秒';
    return s + ' 秒';
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return (h ? pad(h) + ':' : '') + pad(m) + ':' + pad(s);
  }
  function dayKey(ts) {
    var d = ts ? new Date(ts) : new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function uid(p) {
    return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function download(name, text, mime, noBom) {
    var blob = new Blob([(noBom ? '' : '\ufeff') + text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onerror = function () { reject(r.error); };
      r.onload = function () { resolve(r.result); };
      r.readAsArrayBuffer(file);
    });
  }
  // 先按 UTF-8 解码，出现替换符再按 GBK 解码（兼容 Excel 导出的中文 CSV）
  function decodeBuffer(buf) {
    var u8 = new TextDecoder('utf-8').decode(buf);
    if (u8.indexOf('\ufffd') >= 0) {
      try { return new TextDecoder('gbk').decode(buf); } catch (e) { return u8; }
    }
    return u8;
  }

  App.util = {
    $: $, $$: $$, esc: esc, on: on, cls: cls,
    Storage: Storage, toast: toast, modal: modal,
    debounce: debounce, fmtDate: fmtDate, fmtTime: fmtTime, fmtDur: fmtDur, fmtClock: fmtClock,
    dayKey: dayKey, uid: uid, shuffle: shuffle, download: download,
    readFile: readFile, decodeBuffer: decodeBuffer, pad: pad
  };
})(window);
