/* speech.js —— 主观题语音输入（浏览器自带 Web Speech API，不联网安装任何东西）
 *
 * 支持的浏览器：Chrome / Edge / 部分安卓浏览器。
 * Firefox、Safari 旧版本没有 SpeechRecognition，按钮会置灰并提示。
 * 识别在浏览器里做，但 Chrome 会把音频发到它的语音服务，所以需要联网。
 */
(function (global) {
  'use strict';
  var App = global.App || (global.App = {});
  var SR = global.SpeechRecognition || global.webkitSpeechRecognition;

  var ERR = {
    'not-allowed': '麦克风权限被拒绝，请点地址栏左侧的图标允许麦克风',
    'service-not-allowed': '麦克风权限被拒绝，请点地址栏左侧的图标允许麦克风',
    'no-speech': '没听到声音，靠近一点再说一次',
    'audio-capture': '没有检测到麦克风',
    'network': '连不上语音服务（这个功能需要联网）',
    'aborted': ''
  };

  // iPhone / iPad（含 iPadOS 13+ 伪装成 Mac 的情况）
  var IS_IOS = (function () {
    var ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return true;
    return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  })();

  var HINT_OK = '点一下开始说，说完再点一下';
  var HINT_IOS = 'iPhone / iPad 不支持网页语音，点输入框后用键盘上的 🎤 听写';
  var HINT_NO = '当前浏览器不支持语音输入，请用 Chrome / Edge';
  var HINT = !SR && IS_IOS ? HINT_IOS : (!SR ? HINT_NO : HINT_OK);

  var S = App.speech = {
    supported: !!SR,
    recording: false,
    _rec: null
  };

  S.html = function () {
    // 浏览器不支持时不摆一个点不动的按钮，直接给一条能用的办法
    if (!S.supported) {
      return '<div class="essay-tools">' +
        '<span class="mic-tip muted small">💡 ' +
        (IS_IOS
          ? 'iPhone / iPad 不支持网页语音识别。点进输入框，用键盘上的 🎤 键（系统听写）一样能语音输入。'
          : '当前浏览器不支持网页语音识别。可以换 Chrome / Edge，或点进输入框用输入法的 🎤 键。') +
        '</span></div>';
    }
    return '<div class="essay-tools">' +
      '<button type="button" class="mic-btn" data-act="essay-mic" title="用嘴说，自动转成文字">' +
      '<span class="mic-dot"></span><span class="mic-txt">语音输入</span></button>' +
      '<span class="mic-hint muted small">' + HINT + '</span></div>';
  };

  S.stop = function () {
    var rec = S._rec;
    S._rec = null;
    S.recording = false;
    if (rec) {
      try { rec.stop(); } catch (e) {}
      try { rec.abort(); } catch (e) {}
    }
  };

  S.start = function (opts) {
    opts = opts || {};
    if (!SR) { opts.onError && opts.onError('unsupported'); return; }
    S.stop();
    var rec;
    try {
      rec = new SR();
    } catch (e) {
      opts.onError && opts.onError('unsupported');
      return;
    }
    S._rec = rec;
    rec.lang = opts.lang || 'zh-CN';
    // 安卓 Chrome 对 continuous 支持不好，移动端用单句模式更稳
    rec.continuous = !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = function () {
      S.recording = true;
      opts.onStart && opts.onStart();
    };
    rec.onresult = function (e) {
      var interim = '', finals = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var r = e.results[i];
        if (r.isFinal) finals += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (finals) opts.onFinal && opts.onFinal(finals);
      opts.onInterim && opts.onInterim(interim);
    };
    rec.onerror = function (e) {
      var key = (e && e.error) || 'error';
      S.recording = false;
      opts.onError && opts.onError(key, ERR[key] || ('语音识别出错：' + key));
    };
    rec.onend = function () {
      S.recording = false;
      if (S._rec === rec) S._rec = null;
      opts.onEnd && opts.onEnd();
    };
    try {
      rec.start();
    } catch (err) {
      S._rec = null;
      opts.onError && opts.onError('start-failed', '无法启动语音识别，请稍后再试');
    }
  };

  /* 给一个容器绑定麦克风按钮（练习页、考试页共用） */
  S.bind = function (root) {
    if (!root || root._micBound) return;
    root._micBound = true;
    root.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-act="essay-mic"]');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      var ta = root.querySelector('textarea[data-essay]');
      if (!ta) return;
      var hint = root.querySelector('.mic-hint');
      var defaultHint = HINT;
      var waitTimer = null, killTimer = null;

      function clearWatch() {
        if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }
        if (killTimer) { clearTimeout(killTimer); killTimer = null; }
      }
      function fail(msg) {
        clearWatch();
        btn.classList.remove('on', 'pending');
        if (hint) hint.textContent = msg;
        if (App.util && App.util.toast) App.util.toast(msg, 'warn');
      }

      if (S.recording) {
        clearWatch();
        S.stop();
        btn.classList.remove('on', 'pending');
        if (hint) hint.textContent = defaultHint;
        return;
      }

      // 立刻给反馈，避免「按了没反应」的错觉
      btn.classList.add('pending');
      if (hint) hint.textContent = '正在启动麦克风…（第一次会弹出权限询问，请点「允许」）';

      S.start({
        onStart: function () {
          clearWatch();
          btn.classList.remove('pending');
          btn.classList.add('on');
          if (hint) hint.textContent = '正在听…（说完再点一下按钮）';
        },
        onInterim: function (t) {
          if (hint) hint.textContent = t ? '识别中：' + t : '正在听…（说完再点一下按钮）';
        },
        onFinal: function (t) {
          var v = ta.value;
          var needSpace = v && !/[\s，。；：、]$/.test(v);
          ta.value = v + (needSpace ? '，' : '') + t;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
        },
        onEnd: function () {
          clearWatch();
          btn.classList.remove('on', 'pending');
          if (hint) hint.textContent = defaultHint;
        },
        onError: function (key, msg) {
          if (key === 'aborted') { clearWatch(); return; }
          fail(msg || '语音识别启动失败');
        }
      });

      // 权限弹窗可能停留很久：先只是提醒，不要急着掐断
      waitTimer = setTimeout(function () {
        if (S.recording) return;
        if (hint) hint.textContent = '还在等麦克风…没看到授权询问的话，点地址栏的锁图标允许麦克风';
      }, 6000);

      // 25 秒还没起来，才认为是真的失败了
      killTimer = setTimeout(function () {
        if (S.recording) return;
        fail('麦克风没能启动：请在地址栏允许麦克风；微信 / QQ 内置浏览器不支持，请用 Chrome 或 Edge 打开');
        S.stop();
      }, 25000);
    });
  };
})(window);
