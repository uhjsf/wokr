/* views2.js —— 题库管理 / 错题本 / 收藏 / 统计 / 设置 / 导入导出 */
(function (global) {
  'use strict';
  var App = global.App, U = App.util, QB = global.QB, store = App.store;
  var esc = U.esc, $ = U.$, $$ = U.$$;
  var Views = App.views;
  var ui = App.ui;
  var fmtCount = ui.fmtCount, pct = ui.pct;

  var bankState = { kw: '', chapter: '', type: '', level: '', page: 1, onlyValid: true, sort: 'default' };

  /* ================= 题库 ================= */
  Views.bank = function () {
    var meta = store.meta || {};
    var st = store.stats();
    var html = '<div class="page">' +
      '<div class="page-head row">' +
        '<div><h1>' + esc(meta.title || '题库') + ' ' +
        (store.isCustomBank ? '<span class="tag tag-amber">自定义</span>' : '<span class="tag">内置</span>') + '</h1>' +
        '<p class="muted">' + esc(meta.source || '') + (meta.generatedAt ? ' · ' + esc(meta.generatedAt) : '') +
        ' · 共 ' + fmtCount(store.questions.length) + ' 题（可用 ' + fmtCount(store.validQuestions.length) + '）</p></div>' +
        '<div class="head-actions">' +
          '<button class="btn btn-ghost" data-act="import">导入题库</button>' +
          '<button class="btn btn-ghost" data-act="export-menu">导出</button>' +
          '<button class="btn btn-text" data-act="reset-bank">恢复内置题库</button>' +
        '</div>' +
      '</div>';

    var levels = {};
    store.questions.forEach(function (q) { if (q.level) levels[q.level] = 1; });

    html += '<div class="toolbar card">' +
      '<input class="input" type="search" placeholder="搜索题目关键词…" value="' + esc(bankState.kw) + '" data-search>' +
      '<select class="input" data-fchapter><option value="">全部章节</option>' +
        store.chapters.map(function (c) {
          return '<option value="' + c.id + '" ' + (bankState.chapter === c.id ? 'selected' : '') + '>' + esc(c.name) + '</option>';
        }).join('') + '</select>' +
      '<select class="input" data-ftype><option value="">全部题型</option>' +
        QB.TYPE_ORDER.map(function (t) {
          return '<option value="' + t + '" ' + (bankState.type === t ? 'selected' : '') + '>' + QB.TYPES[t] + '</option>';
        }).join('') + '</select>' +
      '<select class="input" data-flevel><option value="">全部等级</option>' +
        Object.keys(levels).map(function (l) {
          return '<option value="' + esc(l) + '" ' + (bankState.level === l ? 'selected' : '') + '>' + esc(l) + '</option>';
        }).join('') + '</select>' +
      '<label class="switch-row slim"><input type="checkbox" data-onlyvalid ' + (bankState.onlyValid ? 'checked' : '') + '><span>只看可用题</span></label>' +
    '</div>';

    var list = filterBank();
    var pageSize = 20;
    var pages = Math.max(1, Math.ceil(list.length / pageSize));
    if (bankState.page > pages) bankState.page = pages;
    var start = (bankState.page - 1) * pageSize;
    var pageItems = list.slice(start, start + pageSize);

    html += '<div class="muted small result-line">找到 <b>' + fmtCount(list.length) + '</b> 道题</div>';

    html += '<div class="card list-card">';
    if (!pageItems.length) {
      html += ui.empty('没有匹配的题目', '试试换个关键词或清空筛选条件');
    } else {
      html += pageItems.map(function (q, i) {
        return '<div class="qrow" data-qid="' + q.id + '">' +
          '<div class="qrow-no">' + (start + i + 1) + '</div>' +
          '<div class="qrow-main">' +
            '<div class="qrow-stem">' + esc(q.stem).replace(/（\s*）/g, '（　　）') + '</div>' +
            '<div class="qrow-meta">' + ui.metaLine(q) +
              (store.isWrong(q.id) ? '<span class="tag tag-red">错题</span>' : '') +
              (store.isFav(q.id) ? '<span class="tag tag-amber">已收藏</span>' : '') +
              (store.progressOf(q.id) ? '<span class="tag">已练 ' + store.progressOf(q.id).n + ' 次</span>' : '') +
            '</div>' +
          '</div>' +
          '<div class="qrow-act"><button class="btn btn-xs btn-ghost" data-single="' + q.id + '">单练</button></div>' +
        '</div>';
      }).join('');
    }
    html += '</div>';

    if (pages > 1) {
      html += '<div class="pager">' +
        '<button class="btn btn-sm btn-ghost" data-page="' + (bankState.page - 1) + '" ' + (bankState.page <= 1 ? 'disabled' : '') + '>上一页</button>' +
        '<span class="muted">' + bankState.page + ' / ' + pages + '</span>' +
        '<button class="btn btn-sm btn-ghost" data-page="' + (bankState.page + 1) + '" ' + (bankState.page >= pages ? 'disabled' : '') + '>下一页</button>' +
      '</div>';
    }
    html += '</div>';

    return {
      html: html,
      mount: function (root) {
        var onSearch = U.debounce(function () {
          bankState.kw = root.querySelector('[data-search]').value.trim();
          bankState.page = 1;
          App.render();
        }, 260);
        var se = root.querySelector('[data-search]');
        se.addEventListener('input', onSearch);
        root.addEventListener('change', function (e) {
          var t = e.target;
          if (t.hasAttribute('data-fchapter')) { bankState.chapter = t.value; bankState.page = 1; App.render(); }
          if (t.hasAttribute('data-ftype')) { bankState.type = t.value; bankState.page = 1; App.render(); }
          if (t.hasAttribute('data-flevel')) { bankState.level = t.value; bankState.page = 1; App.render(); }
          if (t.hasAttribute('data-onlyvalid')) { bankState.onlyValid = t.checked; bankState.page = 1; App.render(); }
        });
        root.addEventListener('click', function (e) {
          var el = e.target.closest('[data-act],[data-page],[data-qid],[data-single]');
          if (!el) return;
          var act = el.getAttribute('data-act');
          if (act === 'import') { openImport(); return; }
          if (act === 'export-menu') { openExport(); return; }
          if (act === 'reset-bank') {
            if (!confirm('恢复为内置题库？你导入的题库将被移除（练习记录保留）。')) return;
            store.resetBank();
            if (App.state.practice) { App.state.practice = null; store.clearSession(); }
            U.toast('已恢复内置题库');
            App.render();
            return;
          }
          if (el.hasAttribute('data-page')) {
            bankState.page = parseInt(el.getAttribute('data-page'), 10);
            App.render();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }
          if (el.hasAttribute('data-single')) {
            e.stopPropagation();
            var id = el.getAttribute('data-single');
            App.startPracticeByIds([id]);
            return;
          }
          if (el.hasAttribute('data-qid')) openQuestion(el.getAttribute('data-qid'));
        });
      }
    };
  };

  function filterBank() {
    var kw = bankState.kw.toLowerCase();
    return store.questions.filter(function (q) {
      if (bankState.onlyValid && !q.valid) return false;
      if (bankState.chapter && q.chapterId !== bankState.chapter) return false;
      if (bankState.type && q.type !== bankState.type) return false;
      if (bankState.level && q.level !== bankState.level) return false;
      if (kw) {
        var hay = (q.stem + ' ' + (q.analysis || '') + ' ' + q.options.map(function (o) { return o.t; }).join(' ')).toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    });
  }

  function openQuestion(id) {
    var q = store.get(id);
    if (!q) return;
    var p = store.progressOf(id);
    var html = '<div class="qmeta">' + ui.metaLine(q) + '</div>';
    html += ui.stemHtml(q);
    if (q.type !== 'essay' && q.options.length) {
      html += ui.optionsHtml(q, [], { reveal: true });
    }
    if (q.type === 'essay') {
      html += '<div class="answer-block">' + esc(q.analysis || '（无参考答案）') + '</div>';
    }
    html += '<div class="detail-ans">正确答案：<b>' + esc(QB.answerText(q)) + '</b></div>';
    if (q.analysis && q.type !== 'essay') html += '<div class="detail-ans">解析：' + esc(q.analysis) + '</div>';
    html += '<div class="detail-meta muted small">章节：' + esc(q.chapter) + (q.section ? ' / ' + esc(q.section) : '') +
      (p ? '　已练 ' + p.n + ' 次，答对 ' + p.ok + ' 次' : '　尚未练习') + '</div>';

    U.modal({
      title: '题目详情',
      size: 'md',
      html: html,
      footer: '<button class="btn btn-ghost" data-fav>' + (store.isFav(id) ? '★ 取消收藏' : '☆ 收藏') + '</button>' +
              '<button class="btn btn-primary" data-practice>单题练习</button>',
      onMount: function (wrap, close) {
        wrap.querySelector('[data-fav]').addEventListener('click', function () {
          var added = store.toggleFav(id);
          U.toast(added ? '已收藏' : '已取消收藏');
          App.render();
          close();
        });
        wrap.querySelector('[data-practice]').addEventListener('click', function () {
          close();
          App.startPracticeByIds([id]);
        });
      }
    });
  }

  /* ================= 导入 ================= */
  function openImport() {
    var importState = { parsed: null, mode: 'replace', text: '', filename: '' };

    var html = '<div class="import-box">' +
      '<div class="dropzone" id="dropzone">' +
        '<div class="dz-ico">⇪</div>' +
        '<div><b>点击选择文件</b> 或把文件拖到这里</div>' +
        '<div class="muted small">支持 .json / .csv / .txt / .docx（Word 文档）</div>' +
        '<input type="file" id="file-input" accept=".json,.csv,.txt,.tsv,.docx,.md" hidden>' +
      '</div>' +
      '<div class="or">或直接粘贴题目文本</div>' +
      '<textarea class="input textarea" id="paste-area" rows="6" placeholder="例如：&#10;一、单项选择题&#10;1、下列说法正确的是（ A ）&#10;A、甲　B、乙　C、丙　D、丁&#10;二、判断题&#10;1、地球是圆的。（ √ ）"></textarea>' +
      '<div class="import-actions"><button class="btn btn-ghost" data-act="parse-text">解析文本</button>' +
        '<label class="muted small"><input type="checkbox" id="chk-mode"> 追加到现有题库（默认替换）</label></div>' +
      '<div id="import-preview"></div>' +
      '<div class="import-tip muted small">' +
        '文本格式兼容从 Word 复制的题集：题号 + 题干（答案）+ A/B/C/D 选项；也支持「答案：A」这种写法。' +
        'CSV 建议表头：题目,A,B,C,D,答案,解析,章节。' +
      '</div>' +
    '</div>';

    var m = U.modal({
      title: '导入题库',
      size: 'lg',
      html: html,
      footer: '<button class="btn btn-ghost" data-close>取消</button>' +
              '<button class="btn btn-primary" data-act="do-import" disabled>开始导入</button>',
      onMount: function (wrap, close) {
        var fileInput = wrap.querySelector('#file-input');
        var dz = wrap.querySelector('#dropzone');
        var preview = wrap.querySelector('#import-preview');
        var btn = wrap.querySelector('[data-act="do-import"]');

        dz.addEventListener('click', function () { fileInput.click(); });
        ['dragenter', 'dragover'].forEach(function (t) {
          dz.addEventListener(t, function (e) { e.preventDefault(); dz.classList.add('over'); });
        });
        ['dragleave', 'drop'].forEach(function (t) {
          dz.addEventListener(t, function (e) { e.preventDefault(); dz.classList.remove('over'); });
        });
        dz.addEventListener('drop', function (e) {
          if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', function () {
          if (fileInput.files[0]) handleFile(fileInput.files[0]);
        });

        async function handleFile(file) {
          importState.filename = file.name;
          U.toast('正在读取 ' + file.name + '…');
          try {
            if (/\.docx$/i.test(file.name)) {
              var buf = await U.readFile(file);
              var text = await QB.docxToText(buf);
              doParse(text, file.name);
            } else if (/\.doc$/i.test(file.name)) {
              U.toast('.doc 需要先另存为 .docx 或 .txt，或直接粘贴文字', 'warn');
            } else {
              var buf2 = await U.readFile(file);
              doParse(U.decodeBuffer(buf2), file.name);
            }
          } catch (err) {
            console.error(err);
            U.toast('读取失败：' + (err.message || err), 'error');
          }
        }

        function doParse(text, filename) {
          importState.text = text;
          var parsed;
          try {
            parsed = QB.parseAuto(text, filename);
          } catch (err) {
            U.toast('解析失败：' + (err.message || err), 'error');
            return;
          }
          var bank = QB.buildBank(parsed, { title: (filename || '导入题库').replace(/\.[^.]+$/, '') });
          importState.parsed = bank;
          renderPreview(bank, parsed.warnings || []);
        }

        function renderPreview(bank, warnings) {
          if (!bank.questions.length) {
            preview.innerHTML = '<div class="alert alert-warn">没有解析出题目，请检查格式。</div>';
            btn.disabled = true;
            return;
          }
          var cnt = {};
          bank.questions.forEach(function (q) { cnt[q.type] = (cnt[q.type] || 0) + 1; });
          var valid = bank.questions.filter(function (q) { return q.valid; }).length;
          var h = '<div class="alert alert-ok">解析成功：共 <b>' + fmtCount(bank.questions.length) + '</b> 题（可用 ' + fmtCount(valid) + '）</div>';
          h += '<div class="chips preview-chips">';
          QB.TYPE_ORDER.forEach(function (t) {
            if (cnt[t]) h += '<span class="chip ' + ui.TYPE_CLASS[t] + '">' + QB.TYPES[t] + ' ' + cnt[t] + '</span>';
          });
          h += '</div>';
          if (warnings.length) {
            h += '<div class="alert alert-warn">' + warnings.slice(0, 3).map(esc).join('<br>') + '</div>';
          }
          h += '<div class="preview-list">';
          bank.questions.slice(0, 5).forEach(function (q, i) {
            h += '<div class="preview-item"><span class="muted">' + (i + 1) + '.</span> ' +
              esc(q.stem).slice(0, 80) + (q.options.length ? '<div class="muted small">' +
              q.options.map(function (o) { return o.k + '.' + esc(o.t); }).join('　').slice(0, 100) + '</div>' : '') +
              '<div class="small">答案：<b>' + esc(QB.answerText(q)) + '</b></div></div>';
          });
          h += '</div>';
          preview.innerHTML = h;
          btn.disabled = false;
        }

        wrap.querySelector('[data-act="parse-text"]').addEventListener('click', function () {
          var t = wrap.querySelector('#paste-area').value;
          if (!t.trim()) { U.toast('请先粘贴题目文本', 'warn'); return; }
          doParse(t, '粘贴文本.txt');
        });

        btn.addEventListener('click', function () {
          var bank = importState.parsed;
          if (!bank) return;
          var append = wrap.querySelector('#chk-mode').checked;
          var finalBank;
          if (append) {
            var all = store.bank.questions.map(function (q) {
              return {
                chapter: q.chapter, section: q.section, type: q.type, level: q.level,
                stem: q.stem, options: q.options, answer: q.answer, analysis: q.analysis
              };
            }).concat(bank.questions);
            finalBank = QB.buildBank({ questions: all, chapters: [], sections: [] },
              { title: (store.meta && store.meta.title) || '我的题库' });
            finalBank.meta.count = finalBank.questions.length;
          } else {
            finalBank = bank;
            finalBank.meta = { title: bank.meta.title, source: importState.filename || '导入', count: bank.questions.length, generatedAt: new Date().toLocaleString('zh-CN') };
          }
          var ok = store.setBank(finalBank);
          if (App.state.practice) { App.state.practice = null; store.clearSession(); }
          close();
          U.toast('已导入 ' + fmtCount(finalBank.questions.length) + ' 道题' + (ok ? '' : '（仅本次会话有效）'), ok ? 'ok' : 'warn');
          App.render();
        });
      }
    });
    return m;
  }
  App.openImport = openImport;

  /* ================= 导出 ================= */
  function openExport() {
    var html = '<div class="export-list">' +
      '<button class="export-item" data-x="json"><b>完整题库 JSON</b><span>包含所有题目、章节与答案，可用于备份或迁移</span></button>' +
      '<button class="export-item" data-x="csv"><b>题库 CSV</b><span>可用 Excel 打开，方便校对和修改</span></button>' +
      '<button class="export-item" data-x="bankjs"><b>题库文件 bank.js（更新线上题库用）</b><span>替换站点里的 data/bank.js 后重新部署，访客就能看到新题库</span></button>' +
      '<button class="export-item" data-x="wrong"><b>错题本 CSV</b><span>' + fmtCount(store.wrongCount()) + ' 道错题</span></button>' +
      '<button class="export-item" data-x="history"><b>练习记录 CSV</b><span>' + fmtCount(store.history.length) + ' 条记录</span></button>' +
      '</div>';
    U.modal({
      title: '导出数据',
      size: 'md',
      html: html,
      onMount: function (wrap, close) {
        wrap.addEventListener('click', function (e) {
          var b = e.target.closest('[data-x]');
          if (!b) return;
          var type = b.getAttribute('data-x');
          if (type === 'json') {
            U.download('题库-' + U.dayKey() + '.json', JSON.stringify(store.bank), 'application/json');
          } else if (type === 'bankjs') {
            U.download('bank.js',
              '/* 题库数据：由网站「导出 → 题库文件 bank.js」生成，替换本文件后重新部署即可 */\n' +
              'window.QBANK = ' + JSON.stringify(store.bank) + ';\n',
              'text/javascript', true);
          } else if (type === 'csv') {
            var rows = [['题号', '题型', '章节', '等级', '题目', 'A', 'B', 'C', 'D', '答案', '解析']];
            store.questions.forEach(function (q, i) {
              var o = {};
              q.options.forEach(function (x) { o[x.k] = x.t; });
              rows.push([i + 1, QB.TYPES[q.type], q.chapter, q.level, q.stem, o.A || '', o.B || '', o.C || '', o.D || '', q.type === 'essay' ? '' : QB.answerText(q), q.analysis || '']);
            });
            U.download('题库-' + U.dayKey() + '.csv', toCsv(rows), 'text/csv');
          } else if (type === 'wrong') {
            var rows2 = [['题目', '正确答案', '错误次数', '章节']];
            Object.keys(store.wrongMap).forEach(function (id) {
              var q = store.get(id);
              if (!q) return;
              rows2.push([q.stem, QB.answerText(q), store.wrongMap[id].c || 1, q.chapter]);
            });
            U.download('错题本-' + U.dayKey() + '.csv', toCsv(rows2), 'text/csv');
          } else {
            var rows3 = [['类型', '时间', '题数', '答对', '得分', '用时(秒)']];
            store.history.forEach(function (h) {
              rows3.push([h.type === 'exam' ? '考试' : '练习', U.fmtDate(h.at) + ' ' + U.fmtTime(h.at), h.total, h.right, h.score == null ? '' : h.score, h.dur]);
            });
            U.download('练习记录-' + U.dayKey() + '.csv', toCsv(rows3), 'text/csv');
          }
          U.toast('已开始下载');
          close();
        });
      }
    });
  }

  function toCsv(rows) {
    return rows.map(function (r) {
      return r.map(function (c) {
        var s = String(c == null ? '' : c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\r\n');
  }

  /* ================= 错题本 ================= */
  Views.wrong = function () {
    var ids = Object.keys(store.wrongMap).filter(function (id) { return store.get(id); })
      .sort(function (a, b) { return (store.wrongMap[b].t || 0) - (store.wrongMap[a].t || 0); });
    var html = '<div class="page">' +
      '<div class="page-head row"><div><h1>错题本</h1><p class="muted">共 ' + ids.length + ' 道题，连续答对 2 次会自动移出</p></div>' +
      '<div class="head-actions">' +
        (ids.length ? '<button class="btn btn-primary" data-act="redo-wrong">重刷全部</button>' : '') +
        (ids.length ? '<button class="btn btn-text" data-act="clear-wrong">清空</button>' : '') +
      '</div></div>';

    if (!ids.length) {
      html += ui.empty('错题本是空的', '做错的题会自动出现在这里，方便集中攻克。', '<a class="btn btn-primary" href="#/practice">去刷题</a>');
    } else {
      html += '<div class="card list-card">';
      ids.forEach(function (id, i) {
        var q = store.get(id);
        var p = store.progressOf(id);
        html += '<div class="qrow" data-qid="' + id + '">' +
          '<div class="qrow-no">' + (i + 1) + '</div>' +
          '<div class="qrow-main"><div class="qrow-stem">' + esc(q.stem).replace(/（\s*）/g, '（　　）') + '</div>' +
          '<div class="qrow-meta">' + ui.metaLine(q) +
            '<span class="tag tag-red">错 ' + (store.wrongMap[id].c || 1) + ' 次</span>' +
            (p ? '<span class="tag">累计答对 ' + p.ok + '</span>' : '') + '</div></div>' +
          '<div class="qrow-act"><button class="btn btn-xs btn-ghost" data-remove="' + id + '">移出</button></div>' +
        '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    return {
      html: html,
      mount: function (root) {
        root.addEventListener('click', function (e) {
          var el = e.target.closest('[data-act],[data-qid],[data-remove]');
          if (!el) return;
          if (el.hasAttribute('data-remove')) {
            e.stopPropagation();
            store.removeWrong(el.getAttribute('data-remove'));
            App.render();
            return;
          }
          var act = el.getAttribute('data-act');
          if (act === 'redo-wrong') { App.startPracticeByIds(ids); return; }
          if (act === 'clear-wrong') {
            if (confirm('确定清空错题本吗？')) { store.clearWrong(); U.toast('已清空'); App.render(); }
            return;
          }
          if (el.hasAttribute('data-qid')) openQuestion(el.getAttribute('data-qid'));
        });
      }
    };
  };

  /* ================= 收藏 ================= */
  Views.fav = function () {
    var ids = store.favList.filter(function (id) { return store.get(id); });
    var html = '<div class="page">' +
      '<div class="page-head row"><div><h1>收藏</h1><p class="muted">共 ' + ids.length + ' 道题</p></div>' +
      '<div class="head-actions">' + (ids.length ? '<button class="btn btn-primary" data-act="redo-fav">练习收藏题</button>' : '') + '</div></div>';
    if (!ids.length) {
      html += ui.empty('还没有收藏的题目', '在刷题时点击右上角的 ☆ 即可收藏。', '<a class="btn btn-primary" href="#/practice">去刷题</a>');
    } else {
      html += '<div class="card list-card">';
      ids.forEach(function (id, i) {
        var q = store.get(id);
        html += '<div class="qrow" data-qid="' + id + '">' +
          '<div class="qrow-no">' + (i + 1) + '</div>' +
          '<div class="qrow-main"><div class="qrow-stem">' + esc(q.stem).replace(/（\s*）/g, '（　　）') + '</div>' +
          '<div class="qrow-meta">' + ui.metaLine(q) + '</div></div>' +
          '<div class="qrow-act"><button class="btn btn-xs btn-ghost" data-unfav="' + id + '">取消</button></div>' +
        '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
    return {
      html: html,
      mount: function (root) {
        root.addEventListener('click', function (e) {
          var el = e.target.closest('[data-act],[data-qid],[data-unfav]');
          if (!el) return;
          if (el.hasAttribute('data-unfav')) {
            e.stopPropagation();
            store.toggleFav(el.getAttribute('data-unfav'));
            App.render();
            return;
          }
          if (el.getAttribute('data-act') === 'redo-fav') { App.startPracticeByIds(ids); return; }
          if (el.hasAttribute('data-qid')) openQuestion(el.getAttribute('data-qid'));
        });
      }
    };
  };

  /* ================= 统计 ================= */
  Views.stats = function () {
    var st = store.stats();
    var cs = store.chapterStats();
    var ts = store.typeStats();
    var days = store.recentDays(30);
    var maxDay = Math.max.apply(null, days.map(function (d) { return d.n; }).concat([1]));

    var html = '<div class="page">' +
      '<div class="page-head"><h1>学习统计</h1><p class="muted">所有数据保存在本机浏览器中</p></div>' +
      '<section class="stat-row">' +
        ui.statCard('累计答题', fmtCount(st.attempts) + '<span class="unit">次</span>', '正确率 ' + (st.attempts ? pct(st.accuracy) : '—')) +
        ui.statCard('已练习题目', fmtCount(st.answered) + '<span class="unit">题</span>', '覆盖率 ' + pct(st.coverage), 'tone-blue') +
        ui.statCard('错题', fmtCount(st.wrong) + '<span class="unit">题</span>', '待消化', 'tone-red') +
        ui.statCard('连续打卡', fmtCount(store.streak()) + '<span class="unit">天</span>', '收藏 ' + fmtCount(st.fav) + ' 题', 'tone-amber') +
      '</section>' +

      '<div class="card"><div class="card-head"><h2>近 30 天</h2><span class="muted">柱高代表当天答题量</span></div>' +
        '<div class="chart chart-wide">' + days.map(function (d) {
          var h = Math.max(3, Math.round(d.n / maxDay * 100));
          return '<div class="chart-col' + (d.n ? '' : ' zero') + '" title="' + d.key + '：' + d.n + ' 题">' +
            '<div class="chart-bar-wrap"><div class="chart-bar" style="height:' + h + '%"></div></div>' +
            '<div class="chart-x">' + (d.n ? d.label : '') + '</div></div>';
        }).join('') + '</div></div>' +

      '<div class="grid-2">' +
        '<div class="card"><div class="card-head"><h2>题型掌握</h2></div><div class="type-stats">' +
          QB.TYPE_ORDER.map(function (t) {
            var x = ts[t];
            return '<div class="ts-row"><span class="chip ' + ui.TYPE_CLASS[t] + '">' + QB.TYPES[t] + '</span>' +
              '<div class="ts-bar">' + ui.progressBar(x.accuracy) + '</div>' +
              '<span class="ts-num">' + (x.attempts ? pct(x.accuracy) : '—') + '</span>' +
              '<span class="muted small">' + x.right + '/' + x.attempts + '</span></div>';
          }).join('') +
        '</div></div>' +
        '<div class="card"><div class="card-head"><h2>最近记录</h2></div><div class="history-list">' +
          (store.history.length ? store.history.slice(0, 8).map(function (h) {
            return '<div class="h-row"><span class="h-type ' + h.type + '">' + (h.type === 'exam' ? '考试' : '练习') + '</span>' +
              '<span class="h-name">' + (h.name || '') + '</span>' +
              '<span class="h-num">' + h.right + '/' + h.total + '</span>' +
              '<span class="muted small">' + U.fmtDate(h.at) + '</span></div>';
          }).join('') : '<div class="muted small">还没有记录</div>') +
        '</div></div>' +
      '</div>' +

      '<div class="card"><div class="card-head"><h2>章节正确率</h2><span class="muted">按答题次数统计</span></div>' +
        '<div class="chapter-table">' + cs.map(function (c) {
          return '<div class="ct-row">' +
            '<div class="ct-name">' + esc(c.name) + '</div>' +
            '<div class="ct-bar">' + ui.progressBar(c.coverage) + '</div>' +
            '<div class="ct-num">' + Math.round(c.coverage * 100) + '%</div>' +
            '<div class="ct-sub muted small">' + c.done + '/' + c.practiceable + '</div>' +
            '<div class="ct-acc ' + (c.accuracy >= 0.8 ? 'good' : c.accuracy >= 0.6 ? 'mid' : 'low') + '">' +
              (c.attempts ? pct(c.accuracy) : '—') + '</div>' +
          '</div>';
        }).join('') + '</div></div>' +
      '</div>';

    return { html: html };
  };

  /* ================= 设置 ================= */
  Views.settings = function () {
    var s = store.settings;
    var html = '<div class="page">' +
      '<div class="page-head"><h1>设置</h1></div>' +
      '<div class="card">' +
        '<div class="set-row"><div><b>深色模式</b><div class="muted small">夜间刷题更护眼</div></div>' +
          '<label class="switch"><input type="checkbox" data-set="dark" ' + (s.theme === 'dark' ? 'checked' : '') + '><i></i></label></div>' +
        '<div class="set-row"><div><b>答对后自动下一题</b><div class="muted small">单项选择题答对后 0.7 秒自动跳转</div></div>' +
          '<label class="switch"><input type="checkbox" data-set="autoNext" ' + (s.autoNext ? 'checked' : '') + '><i></i></label></div>' +
        '<div class="set-row"><div><b>打乱选项顺序</b><div class="muted small">避免死记选项位置</div></div>' +
          '<label class="switch"><input type="checkbox" data-set="shuffleOptions" ' + (s.shuffleOptions ? 'checked' : '') + '><i></i></label></div>' +
        '<div class="set-row"><div><b>正文字号</b><div class="muted small">题目文字的显示大小</div></div>' +
          '<div class="chips">' + [0.9, 1, 1.15, 1.3].map(function (v) {
            return '<button class="chip chip-btn ' + (s.fontScale === v ? 'on' : '') + '" data-font="' + v + '">' + Math.round(v * 100) + '%</button>';
          }).join('') + '</div></div>' +
      '</div>' +

      '<div class="card">' +
        '<div class="card-head"><h2>数据管理</h2></div>' +
        '<div class="set-row"><div><b>导入题库</b><div class="muted small">支持 json / csv / txt / docx</div></div>' +
          '<button class="btn btn-ghost" data-act="import">导入</button></div>' +
        '<div class="set-row"><div><b>导出数据</b><div class="muted small">题库、错题本、练习记录</div></div>' +
          '<button class="btn btn-ghost" data-act="export-menu">导出</button></div>' +
        '<div class="set-row"><div><b>清空练习记录</b><div class="muted small">进度、错题、收藏、统计都会重置</div></div>' +
          '<button class="btn btn-danger-soft" data-act="reset-progress">清空</button></div>' +
        '<div class="set-row"><div><b>恢复内置题库</b><div class="muted small">丢弃导入的题库</div></div>' +
          '<button class="btn btn-danger-soft" data-act="reset-bank">恢复</button></div>' +
      '</div>' +

      '<div class="card about">' +
        '<div class="card-head"><h2>关于</h2></div>' +
        '<p>题库刷题系统 · 纯前端单页应用，双击 <code>index.html</code> 即可使用。</p>' +
        '<p class="muted small">题库来源：' + esc((store.meta && store.meta.source) || '内置题库') + '<br>' +
        '题目数：' + fmtCount(store.questions.length) + ' · 章节：' + store.chapters.length +
        ' · 浏览器存储：' + (U.Storage.available ? '可用' : '不可用（刷新后会丢失进度）') + '</p>' +
        '<p class="muted small">快捷键：<kbd>1</kbd>-<kbd>4</kbd> 选择选项，<kbd>Enter</kbd> 提交 / 下一题，<kbd>←</kbd> <kbd>→</kbd> 切换题目。</p>' +
      '</div>' +
      '</div>';

    return {
      html: html,
      mount: function (root) {
        root.addEventListener('change', function (e) {
          var t = e.target;
          if (t.hasAttribute('data-set')) {
            var k = t.getAttribute('data-set');
            if (k === 'dark') { store.settings.theme = t.checked ? 'dark' : 'light'; App.applyTheme(); }
            else store.settings[k] = t.checked;
            store.saveSettings();
          }
        });
        root.addEventListener('click', function (e) {
          var el = e.target.closest('[data-font],[data-act]');
          if (!el) return;
          if (el.hasAttribute('data-font')) {
            store.settings.fontScale = parseFloat(el.getAttribute('data-font'));
            store.saveSettings();
            App.applyFont();
            App.render();
            return;
          }
          var act = el.getAttribute('data-act');
          if (act === 'import') openImport();
          if (act === 'export-menu') openExport();
          if (act === 'reset-progress') {
            if (confirm('确定清空所有练习记录？（题库不受影响）')) {
              store.resetAll();
              U.toast('已清空');
              App.render();
            }
          }
          if (act === 'reset-bank') {
            if (confirm('恢复内置题库？')) {
              store.resetBank();
              if (App.state.practice) { App.state.practice = null; store.clearSession(); }
              U.toast('已恢复');
              App.render();
            }
          }
        });
      }
    };
  };
})(window);
