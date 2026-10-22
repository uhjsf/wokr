/* ai.js —— AI 解答（浏览器直连大模型，Key 只存本机） */
(function (global) {
  'use strict';
  var App = global.App, U = App.util;
  var esc = U.esc;
  var K = 'qb.ai.v1';

  /* ---------------------------------------------------------------- 预设 */
  var PRESETS = [
    { id: 'deepseek', name: 'DeepSeek（推荐）', base: 'https://api.deepseek.com', model: 'deepseek-chat' },
    { id: 'siliconflow', name: '硅基流动 SiliconFlow', base: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
    { id: 'moonshot', name: '月之暗面 Kimi', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    { id: 'openai', name: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    { id: 'custom', name: '自定义（OpenAI 兼容）', base: '', model: '' }
  ];

  function presetOf(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return PRESETS[0];
  }

  function loadCfg() {
    var d = U.Storage.get(K, null) || {};
    return {
      provider: d.provider || 'deepseek',
      baseUrl: d.baseUrl || 'https://api.deepseek.com',
      model: d.model || 'deepseek-chat',
      apiKey: d.apiKey || ''
    };
  }

  var AI = App.ai = { presets: PRESETS };
  AI.cfg = loadCfg();

  AI.saveCfg = function (cfg) {
    AI.cfg = {
      provider: cfg.provider || 'custom',
      baseUrl: String(cfg.baseUrl || '').trim(),
      model: String(cfg.model || '').trim(),
      apiKey: String(cfg.apiKey || '').trim()
    };
    U.Storage.set(K, AI.cfg);
    return AI.cfg;
  };
  AI.configured = function () {
    return !!(AI.cfg.apiKey && AI.cfg.baseUrl && AI.cfg.model);
  };
  AI.endpoint = function (base) {
    var b = String(base || AI.cfg.baseUrl || '').replace(/\/+$/, '');
    return b + '/chat/completions';
  };

  /* ---------------------------------------------------------------- 提示词 */
  var TYPE_NAME = { single: '单选题', multi: '多选题', judge: '判断题', essay: '综合题' };

  function buildMessages(q) {
    var type = TYPE_NAME[q.type] || '题目';
    var opts = (q.options || []).map(function (o) { return o.k + '. ' + o.t; }).join('\n');
    var sys = '你是一位经验丰富的化工职业技能培训老师，讲解准确、直接、不说客套话。' +
      '回答一律使用简体中文。不要重复题目原文。';
    var fmt = q.type === 'essay'
      ? '答案：见解析\n解析：<给出要点式参考答案，必要时分条>\n知识点：<一句话点出这题考什么>'
      : '答案：<' + (q.type === 'multi' ? '多个正确字母，如 ABD' : q.type === 'judge' ? '对 或 错' : '一个字母') + '>\n' +
        '解析：<说明正确选项为什么对，并逐项指出其余选项错在哪里，200 字以内>\n' +
        '知识点：<一句话点出这题考什么>';

    var user = '请解答下面这道' + type + '：\n\n题目：' + q.stem +
      (opts ? '\n选项：\n' + opts : '') +
      '\n\n请严格按以下格式输出，不要增删字段名：\n' + fmt;

    return [
      { role: 'system', content: sys },
      { role: 'user', content: user }
    ];
  }

  /* ---------------------------------------------------------------- 调用 */
  function streamChat(messages, opts, onDelta) {
    opts = opts || {};
    onDelta = typeof onDelta === 'function' ? onDelta : function () {};
    var ctrl = new AbortController();
    var timer = null;
    if (opts.timeout !== 0) {
      timer = setTimeout(function () { ctrl.abort(); }, opts.timeout || 90000);
    }
    var url = AI.endpoint(opts.baseUrl);
    var body = {
      model: opts.model || AI.cfg.model,
      messages: messages,
      stream: opts.stream !== false,
      temperature: 0.3,
      max_tokens: opts.maxTokens || 800
    };

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (opts.apiKey || AI.cfg.apiKey)
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          var msg = '';
          try { var j = JSON.parse(t); msg = (j.error && (j.error.message || j.error.code)) || j.message || ''; } catch (e) { msg = t.slice(0, 160); }
          var err = new Error(msg || ('HTTP ' + res.status));
          err.status = res.status;
          throw err;
        });
      }
      if (opts.stream === false) {
        return res.json().then(function (j) {
          if (timer) clearTimeout(timer);
          var txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
          onDelta(txt, true);
          return txt;
        });
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buf = '';
      var all = '';
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) {
            if (timer) clearTimeout(timer);
            return all;
          }
          buf += decoder.decode(r.value, { stream: true });
          var idx;
          while ((idx = buf.indexOf('\n')) >= 0) {
            var line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line || line.indexOf('data:') !== 0) continue;
            var data = line.slice(5).trim();
            if (data === '[DONE]') { if (timer) clearTimeout(timer); return all; }
            try {
              var j = JSON.parse(data);
              var d = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
              if (d) { all += d; onDelta(d, false); }
            } catch (e) { /* 忽略半包 */ }
          }
          return pump();
        });
      }
      return pump();
    }, function (e) {
      if (timer) clearTimeout(timer);
      var err = new Error(e && e.name === 'AbortError' ? '请求超时或被取消' : '无法连接接口（网络不通，或该服务不允许浏览器直接调用）');
      err.network = true;
      throw err;
    });
  }

  AI.streamChat = streamChat;

  /* ---------------------------------------------------------------- 渲染 */
  function renderText(raw, streaming) {
    var lines = String(raw || '').split(/\n+/).filter(function (l) { return l.trim(); });
    var html = lines.map(function (line) {
      var m = /^(答案|解析|知识点|补充|注意)\s*[:：]\s*([\s\S]*)$/.exec(line.trim());
      if (m) return '<p class="ai-line"><span class="ai-k">' + esc(m[1]) + '</span>' + esc(m[2]) + '</p>';
      return '<p class="ai-line">' + esc(line) + '</p>';
    }).join('');
    if (streaming) html += '<span class="ai-caret"></span>';
    return html || (streaming ? '<span class="ai-caret"></span>' : '');
  }

  function parseAnswer(text, type) {
    var m = /答案\s*[:：]\s*([^\n]*)/.exec(text || '');
    if (!m) return '';
    var seg = m[1].trim();
    if (type === 'judge') {
      if (/[对√✓正]/.test(seg) && !/[错×✗误]/.test(seg)) return '对';
      if (/[错×✗误]/.test(seg)) return '错';
      return '';
    }
    var letters = (seg.toUpperCase().match(/[A-H]/g) || []);
    var out = [];
    letters.forEach(function (c) { if (out.indexOf(c) < 0) out.push(c); });
    return out.sort().join('');
  }

  function bankAnswer(q) {
    if (q.type === 'judge') return (q.answer || [])[0] || '';
    return (q.answer || []).slice().sort().join('');
  }

  /* ---------------------------------------------------------------- 面板 */
  var active = null;

  function askPanel(q) {
    if (!AI.configured()) {
      U.toast('请先配置 AI 接口');
      location.hash = '#/settings';
      return;
    }
    if (active && active.close) { try { active.close(); } catch (e) {} }

    var body =
      '<div class="ai-q">' +
        '<div class="ai-q-type">' + esc(TYPE_NAME[q.type] || '题目') + '</div>' +
        '<div class="ai-q-stem">' + esc(q.stem).replace(/（\s*）/g, '（　）') + '</div>' +
      '</div>' +
      '<div class="ai-status"><span class="ai-dot"></span><span class="ai-status-text">正在思考…</span></div>' +
      '<div class="ai-result"></div>';

    var m = U.modal({
      title: 'AI 解答',
      size: 'lg',
      html: body,
      footer: '<span class="ai-foot-note"></span>' +
              '<button class="btn btn-ghost" data-ai="retry">重新回答</button>' +
              '<button class="btn btn-ghost" data-ai="copy">复制</button>' +
              '<button class="btn btn-primary" data-close>关闭</button>',
      onClose: function () { if (active && active.abort) active.abort(); active = null; },
      onMount: function (wrap, close) {
        var elStatus = wrap.querySelector('.ai-status');
        var elStatusText = wrap.querySelector('.ai-status-text');
        var elResult = wrap.querySelector('.ai-result');
        var elFoot = wrap.querySelector('.ai-foot-note');
        var state = { raw: '', done: false, error: null, abort: null, q: q };
        active = { close: close, abort: function () { if (state.abort) state.abort(); } };

        function paint() {
          if (state.error) {
            elResult.innerHTML = '<div class="ai-error">' + esc(state.error) + '</div>';
            return;
          }
          elResult.innerHTML = renderText(state.raw, !state.done);
        }

        function finish() {
          state.done = true;
          elStatus.className = 'ai-status done';
          elStatusText.textContent = '已完成';
          paint();
          var aiAns = parseAnswer(state.raw, q.type);
          if (q.type !== 'essay') {
            var bank = bankAnswer(q);
            if (aiAns && bank) {
              var same = aiAns === bank;
              elFoot.innerHTML = '<span class="ai-badge ' + (same ? 'ok' : 'bad') + '">' +
                (same ? '与题库答案一致 · ' + esc(bank) : 'AI 判断 ' + esc(aiAns) + '，题库答案 ' + esc(bank)) +
                '</span>';
            } else if (aiAns) {
              elFoot.innerHTML = '<span class="ai-badge">AI 判断 ' + esc(aiAns) + '</span>';
            }
          }
        }

        function run() {
          state.raw = ''; state.done = false; state.error = null;
          elStatus.className = 'ai-status';
          elStatusText.textContent = '正在思考…';
          elFoot.innerHTML = '';
          paint();
          streamChat(buildMessages(q), {}, function (d) {
            state.raw += d;
            paint();
          }).then(function () {
            finish();
          }).catch(function (e) {
            state.done = true;
            state.error = friendlyError(e);
            elStatus.className = 'ai-status error';
            elStatusText.textContent = '出错了';
            paint();
          });
        }

        U.on(wrap, 'click', '[data-ai]', function (e, b) {
          var act = b.getAttribute('data-ai');
          if (act === 'retry') { run(); }
          if (act === 'copy') {
            var txt = state.raw || '';
            if (!txt) { U.toast('还没有内容', 'warn'); return; }
            if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { U.toast('已复制', 'ok'); });
            else U.toast('当前环境不支持复制', 'warn');
          }
        });

        run();
      }
    });
    return m;
  }

  function friendlyError(e) {
    if (!e) return '未知错误';
    if (e.status === 401 || e.status === 403) return 'API Key 无效或没有权限，请到「设置 → AI 解答」重新填写。';
    if (e.status === 404) return '接口地址不对（404）。检查「设置 → AI 解答」里的接口地址，一般以 /v1 结尾或为服务商给出的 base_url。';
    if (e.status === 429) return '请求太频繁或额度用尽（429），稍后再试。';
    if (e.status >= 500) return '服务商那边出错了（' + e.status + '），稍后再试。';
    if (e.network) return '连不上接口：可能是网络问题，或者这个服务不允许浏览器直接调用（跨域被拦）。可以换 DeepSeek / 硅基流动 / Kimi 试试。';
    return e.message || '调用失败';
  }

  /* ---------------------------------------------------------------- 配置入口 */
  AI.ask = function (q) {
    if (!q) return;
    if (!AI.configured()) {
      U.modal({
        title: '先配置 AI 接口',
        size: 'sm',
        html: '<p class="muted small">AI 解答需要你自己的大模型 API Key，只在浏览器里保存，不会上传到任何服务器。</p>' +
              '<p class="muted small" style="margin-top:10px">去「设置 → AI 解答」填写服务商、接口地址、模型和 Key 即可，一分钟搞定。</p>',
        footer: '<button class="btn btn-ghost" data-close>稍后</button>' +
                '<button class="btn btn-primary" data-go>去设置</button>',
        onMount: function (wrap, close) {
          wrap.querySelector('[data-go]').addEventListener('click', function () {
            close();
            location.hash = '#/settings';
          });
        }
      });
      return;
    }
    askPanel(q);
  };

  AI.test = function (cfg) {
    cfg = cfg || AI.cfg;
    return streamChat(
      [{ role: 'user', content: '只回复两个字：可用' }],
      { stream: false, maxTokens: 16, baseUrl: cfg.baseUrl, model: cfg.model, apiKey: cfg.apiKey }
    );
  };

  AI.parseAnswer = parseAnswer;
  AI.TYPES = TYPE_NAME;
})(window);
