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

  var S = App.speech = {
    supported: !!SR,
    recording: false,
    _rec: null
  };

  S.html = function () {
    var ok = S.supported;
    return '<div class="essay-tools">' +
      '<button type="button" class="mic-btn" data-act="essay-mic"' +
      (ok ? '' : ' disabled') +
      ' title="' + (ok ? '用嘴说，自动转成文字' : '当前浏览器不支持语音输入') + '">' +
      '<span class="mic-dot"></span><span class="mic-txt">语音输入</span></button>' +
      '<span class="mic-hint muted small">' +
      (ok ? '点一下开始说，说完再点一下' : '当前浏览器不支持语音输入，请用 Chrome / Edge') +
      '</span></div>';
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
    rec.continuous = true;
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
      var defaultHint = S.supported ? '点一下开始说，说完再点一下' : '当前浏览器不支持语音输入，请用 Chrome / Edge';
      var watchdog = null;

      function clearWatch() {
        if (watchdog) { clearTimeout(watchdog); watchdog = null; }
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
      if (hint) hint.textContent = '正在启动麦克风…（第一次会弹出权限询问）';

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

      // 4 秒还没进到「正在听」就认为卡住了
      watchdog = setTimeout(function () {
        if (S.recording) return;
        fail('麦克风没有启动起来：请检查浏览器是否允许麦克风，或改用 Chrome / Edge，并确认网络可用');
        S.stop();
      }, 4000);
    });
  };
})(window);
