/* core.js —— 题库解析、清洗、判分（纯逻辑，可单独在 Node 中测试） */
(function (global) {
  'use strict';

  var QB = {};
  var TYPES = { single: '单选题', multi: '多选题', judge: '判断题', essay: '综合题' };
  var TYPE_ORDER = ['single', 'multi', 'judge', 'essay'];

  var RE = {
    toc: /\t\d+\s*$/,
    chapter: /^第[一二三四五六七八九十]+部分[\s]*(.*)$/,
    section: /^([一二三四五六七八九十]+)、\s*(.*)$/,
    qnum: /^(\d{1,3})\s*[、.．]\s*(.*)$/,
    ansLetters: /[（(]\s*([A-H](?:\s*[A-H]){0,7})\s*[）)]/g,
    ansJudge: /[（(]\s*(√|×|✓|✗|正确|错误|对|错)\s*[）)]/,
    emptyParen: /[（(]\s*[）)]/g,
    answerPrefix: /^(答\s*[:：]|答案\s*[:：])/,
    optionLine: /^[A-H]\s*[、.．]/
  };

  function normText(s) {
    return String(s == null ? '' : s)
      .replace(/[\u3000\t\u00a0]/g, ' ')
      .replace(/ {2,}/g, ' ')
      .trim();
  }

  function sectionTypeOf(t) {
    if (t.indexOf('多项选择') >= 0) return 'multi';
    if (t.indexOf('单项选择') >= 0) return 'single';
    if (t.indexOf('判断') >= 0) return 'judge';
    if (t.indexOf('综合') >= 0 || t.indexOf('简答') >= 0 || t.indexOf('问答') >= 0) return 'essay';
    return null;
  }

  function levelOf(t) {
    var m = /[（(]([^）)]*)[）)]/.exec(t || '');
    if (!m) return '';
    var s = m[1].trim();
    if (s.indexOf('中级工') >= 0 && s.indexOf('高级工') >= 0) return '中级工/高级工';
    if (s.indexOf('高级工') >= 0 && s.indexOf('技师') >= 0) return '高级工/技师';
    var ks = ['中级工', '高级工', '技师', '初级工'];
    for (var i = 0; i < ks.length; i++) if (s.indexOf(ks[i]) >= 0) return ks[i];
    return '';
  }

  /* ---------- 选项切分 ---------- */
  var OPT_A_RE = /(^|[^A-Za-z0-9])([A-H])[ ]*[、.．][ ]*/g;
  var OPT_B_RE = /(^|[^A-Za-z0-9])([A-H])[ ]+/g;

  function marksOf(line, re) {
    var out = [], m;
    re.lastIndex = 0;
    while ((m = re.exec(line)) !== null) {
      var pos = m.index + m[1].length;
      var end = m.index + m[0].length;
      out.push({ pos: pos, k: m[2], end: end });
      if (re.lastIndex <= m.index) re.lastIndex = m.index + 1;
      if (end <= pos) re.lastIndex = pos + 1;
    }
    return out;
  }

  function splitOptions(line, used) {
    line = normText(line);
    used = used || {};
    var marks = marksOf(line, OPT_A_RE);
    if (!marks.length && /^[A-H]\s/.test(line)) {
      var b = marksOf(line, OPT_B_RE);
      if (b.length >= 2) marks = b;
    }
    if (!marks.length) return { prefix: '', opts: [] };
    marks = marks.filter(function (m) { return !used[m.k]; });
    if (!marks.length) return { prefix: line, opts: [] };
    var opts = [];
    for (var i = 0; i < marks.length; i++) {
      var next = i + 1 < marks.length ? marks[i + 1].pos : line.length;
      opts.push({ k: marks[i].k, t: line.slice(marks[i].end, next).trim() });
    }
    return { prefix: line.slice(0, marks[0].pos).trim(), opts: opts };
  }

  function usedOf(opts) {
    var u = {};
    for (var i = 0; i < opts.length; i++) u[opts[i].k] = true;
    return u;
  }

  /* ---------- 文本题库解析（兼容 Word 复制出来的题集） ---------- */
  function parseText(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var normed = lines.map(normText);
    var chapters = [], sections = [], questions = [];
    var curChapter = null, curSection = null, cur = null, lastNo = 0;
    var warnings = [];

    function nextNe(i) {
      for (var j = i + 1; j < lines.length; j++) if (normed[j]) return normed[j];
      return '';
    }

    function finish() {
      if (!cur) return;
      var q = cur; cur = null;
      var stem = normText(q.stem.join(' '));
      var opts = [], seen = {}, issues = [], ans = [];
      for (var i = 0; i < q.options.length; i++) {
        var o = q.options[i];
        if (seen[o.k]) continue;
        seen[o.k] = 1;
        opts.push({ k: o.k, t: normText(o.t) });
      }
      opts.sort(function (a, b) { return a.k < b.k ? -1 : 1; });

      var qtype = q.type;
      if ((qtype === 'single' || qtype === 'multi' || qtype === 'essay') && opts.length < 2) {
        var sp = splitOptions(stem, seen);
        if (sp.opts.length >= 2) {
          stem = sp.prefix;
          for (var j = 0; j < sp.opts.length; j++) {
            if (!seen[sp.opts[j].k]) { seen[sp.opts[j].k] = 1; opts.push(sp.opts[j]); }
          }
          opts.sort(function (a, b) { return a.k < b.k ? -1 : 1; });
          issues.push('INLINE_OPTIONS');
        }
      }

      var m = null, mm;
      if (qtype === 'single' || qtype === 'multi') {
        RE.ansLetters.lastIndex = 0;
        while ((mm = RE.ansLetters.exec(stem)) !== null) m = mm;
        if (m) {
          ans = m[1].replace(/\s/g, '').split('');
          stem = stem.slice(0, m.index) + '（  ）' + stem.slice(m.index + m[0].length);
        } else issues.push('NO_ANSWER_PAREN');
      } else if (qtype === 'judge') {
        m = RE.ansJudge.exec(stem);
        if (!m) { m = /([√×])/.exec(stem); }
        if (m) {
          var c = m[1];
          ans = (c === '√' || c === '✓' || c === '对' || c === '正确') ? ['对'] : ['错'];
          stem = (stem.slice(0, m.index) + '（  ）' + stem.slice(m.index + m[0].length)).trim();
        } else issues.push('NO_ANSWER_PAREN');
      } else if (qtype === 'essay') {
        RE.ansLetters.lastIndex = 0;
        while ((mm = RE.ansLetters.exec(stem)) !== null) m = mm;
        if (m && opts.length >= 2) {
          ans = m[1].replace(/\s/g, '').split('');
          stem = stem.slice(0, m.index) + '（  ）' + stem.slice(m.index + m[0].length);
          qtype = ans.length > 1 ? 'multi' : 'single';
          issues.push('TYPE_FIXED');
        }
      }
      if (qtype === 'judge') stem = stem.replace(RE.emptyParen, '（  ）');

      var analysis = normText(q.ans.join(' '));

      if (qtype === 'single' || qtype === 'multi') {
        if (opts.length < 2) issues.push('NO_OPTIONS');
        if (ans.length && qtype === 'single' && ans.length > 1) {
          qtype = 'multi'; issues.push('TYPE_FIXED');
        }
      }
      if ((qtype === 'single' || qtype === 'multi') && !ans.length) issues.push('NO_ANSWER');
      if (qtype === 'judge' && !ans.length) issues.push('NO_ANSWER');
      if (qtype === 'essay' && !analysis) issues.push('NO_ANALYSIS');

      questions.push({
        chapter: curChapter ? curChapter.name : '',
        chapterId: curChapter ? curChapter.id : '',
        section: curSection ? curSection.name : '',
        sectionId: curSection ? curSection.id : '',
        type: qtype,
        sectionType: curSection ? curSection.type : qtype,
        level: curSection ? curSection.level : '',
        no: q.no,
        stem: stem,
        options: opts,
        answer: ans,
        analysis: analysis,
        issues: issues
      });
    }

    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i].replace(/\s+$/, '');
      if (!raw.trim()) continue;
      if (RE.toc.test(raw)) continue;
      var n = normed[i];
      if (n === '目录') continue;

      var mc = RE.chapter.exec(n);
      if (mc) {
        finish();
        var cname = mc[1].trim();
        if (!cname) continue;
        curChapter = { id: 'ch' + (chapters.length + 1), name: cname };
        chapters.push(curChapter);
        curSection = null;
        continue;
      }
      var ms = RE.section.exec(n);
      if (ms) {
        var st = sectionTypeOf(ms[2]);
        if (st) {
          finish();
          curSection = {
            id: 's' + (sections.length + 1),
            name: ms[1] + '、' + ms[2].trim(),
            type: st,
            level: levelOf(ms[2]),
            chapterId: curChapter ? curChapter.id : ''
          };
          sections.push(curSection);
          lastNo = 0;
          continue;
        }
      }
      if (!curSection) continue;

      var mq = RE.qnum.exec(n);
      if (mq) {
        var no = parseInt(mq[1], 10), rest = mq[2].trim(), accept = false;
        if (!cur) accept = true;
        else if (curSection.type === 'essay') {
          accept = (no === lastNo + 1) || (no > lastNo && (RE.ansLetters.test(rest) || RE.ansJudge.test(rest)));
          RE.ansLetters.lastIndex = 0;
        } else {
          if (no === lastNo + 1 || no > lastNo) accept = true;
          else if (RE.optionLine.test(nextNe(i)) && cur.options.length >= 2) {
            accept = true;
            warnings.push('第 ' + i + ' 行题号疑似笔误：' + no + ' → ' + (lastNo + 1));
            no = lastNo + 1;
          }
        }
        if (accept) {
          finish();
          cur = { type: curSection.type, no: no, stem: [rest], options: [], ans: [], started: false };
          lastNo = no;
          continue;
        }
      }
      if (!cur) continue;

      if (cur.type === 'essay') {
        var ma = RE.answerPrefix.exec(n);
        var eo = splitOptions(n, usedOf(cur.options));
        if (ma) {
          var body = n.replace(RE.answerPrefix, '').replace(/^\s+/, '');
          if (body) cur.ans.push(body);
          cur.started = true;
        } else if (eo.opts.length && !cur.started) {
          cur.options = cur.options.concat(eo.opts);
        } else if (cur.started) {
          cur.ans.push(n);
        } else {
          cur.stem.push(n);
        }
        continue;
      }

      if (/^答案\s*[:：]/.test(n)) {
        cur.ans.push(n.replace(/^答案\s*[:：]\s*/, ''));
        continue;
      }
      var so = splitOptions(n, usedOf(cur.options));
      if (so.opts.length) {
        cur.options = cur.options.concat(so.opts);
        continue;
      }
      if (cur.options.length) {
        var last = cur.options[cur.options.length - 1];
        last.t = last.t ? last.t + ' ' + n : n;
      } else {
        cur.stem.push(n);
      }
    }
    finish();

    return { chapters: chapters, sections: sections, questions: questions, warnings: warnings };
  }

  /* ---------- CSV / TSV ---------- */
  function csvRows(text) {
    text = String(text || '').replace(/^\ufeff/, '');
    var firstLine = text.split(/\r?\n/)[0] || '';
    var delim = ',';
    var counts = { ',': 0, '\t': 0, ';': 0, '|': 0 };
    for (var i = 0; i < firstLine.length; i++) if (delim in counts) counts[firstLine[i]]++;
    if (counts['\t'] > counts[',']) delim = '\t';
    else if (counts[';'] > counts[','] && counts[';'] > counts['\t']) delim = ';';
    else if (counts['|'] > counts[','] && counts['|'] > counts['\t']) delim = '|';

    var rows = [], row = [], cur = '', q = false;
    for (var j = 0; j < text.length; j++) {
      var ch = text[j];
      if (q) {
        if (ch === '"') {
          if (text[j + 1] === '"') { cur += '"'; j++; }
          else q = false;
        } else cur += ch;
      } else if (ch === '"' && cur === '') { q = true; }
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (ch === '\r') { /* skip */ }
      else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  }

  var HEAD = {
    stem: ['题目', '题干', '问题', '试题', 'question', 'stem', 'title', '内容'],
    answer: ['答案', '正确答案', 'answer', 'key', '参考答案'],
    type: ['题型', '类型', 'type'],
    chapter: ['章节', '章', '分类', '科目', 'chapter', 'subject', '部分'],
    section: ['小节', 'section'],
    analysis: ['解析', '说明', '解答', 'explanation', 'analysis'],
    level: ['等级', '难度', '级别', 'level'],
    no: ['序号', '题号', 'no', 'id']
  };

  function headIndex(cell) {
    var s = String(cell || '').trim().toLowerCase().replace(/[\s_]/g, '');
    for (var k in HEAD) {
      for (var i = 0; i < HEAD[k].length; i++) {
        if (s === HEAD[k][i] || s.indexOf(HEAD[k][i]) === 0) return k;
      }
    }
    if (/^选项?[a-h]$/.test(s) || /^[a-h]$/.test(s)) return 'opt:' + s.replace('选项', '').toUpperCase();
    return null;
  }

  function parseAnswerLoose(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return [];
    if (/^[对√✓正]$/.test(s)) return ['对'];
    if (/^[错×✗误]$/.test(s)) return ['错'];
    var letters = s.toUpperCase().match(/[A-H]/g);
    if (letters) {
      var out = [];
      letters.forEach(function (c) { if (out.indexOf(c) < 0) out.push(c); });
      if (out.length && out.length <= 8) return out;
    }
    return [];
  }

  function inferType(q) {
    if (q.type) return q.type;
    if (!q.options || q.options.length < 2) return q.analysis ? 'essay' : 'judge';
    if (q.answer.length > 1) return 'multi';
    return 'single';
  }

  function parseCsv(text) {
    var rows = csvRows(text);
    if (!rows.length) return { questions: [], warnings: ['文件为空'] };
    var header = rows[0].map(headIndex);
    var hasHeader = header.filter(Boolean).length >= 2;
    var map = {}, start = 0;
    if (hasHeader) {
      header.forEach(function (k, i) { if (k && !(k in map)) map[k] = i; });
      start = 1;
    } else {
      var n = rows[0].length;
      if (n >= 7) { map.stem = 0; map.optA = 1; map.optB = 2; map.optC = 3; map.optD = 4; map.answer = 5; map.analysis = 6; }
      else if (n === 6) { map.stem = 0; map.optA = 1; map.optB = 2; map.optC = 3; map.optD = 4; map.answer = 5; }
      else if (n === 5) { map.stem = 0; map.optA = 1; map.optB = 2; map.optC = 3; map.answer = 4; }
      else if (n === 3) { map.stem = 0; map.answer = 1; map.analysis = 2; }
      else if (n === 2) { map.stem = 0; map.answer = 1; }
      else { return { questions: [], warnings: ['无法识别列结构，请为表格加上表头（题目 / A / B / C / D / 答案）'] }; }
      start = 0;
    }
    if (map.stem == null) {
      for (var k in map) if (k.indexOf('opt:') === 0) break;
      return { questions: [], warnings: ['缺少「题目/题干」列'] };
    }
    var out = [];
    for (var i = start; i < rows.length; i++) {
      var r = rows[i];
      var stem = String(r[map.stem] || '').trim();
      if (!stem) continue;
      var options = [];
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(function (L) {
        var idx = 'opt:' + L in map ? map['opt:' + L] : map['opt' + L];
        var t = idx != null ? String(r[idx] || '').trim() : '';
        if (t) options.push({ k: L, t: t });
      });
      var q = {
        stem: stem,
        options: options,
        answer: parseAnswerLoose(map.answer != null ? r[map.answer] : ''),
        analysis: map.analysis != null ? String(r[map.analysis] || '').trim() : '',
        chapter: map.chapter != null ? String(r[map.chapter] || '').trim() : '',
        section: map.section != null ? String(r[map.section] || '').trim() : '',
        level: map.level != null ? String(r[map.level] || '').trim() : '',
        type: map.type != null ? String(r[map.type] || '').trim() : ''
      };
      q.type = normalizeTypeName(q.type);
      out.push(q);
    }
    return { questions: out, warnings: [] };
  }

  function normalizeTypeName(t) {
    t = String(t || '').trim();
    if (!t) return '';
    if (t.indexOf('多') >= 0) return 'multi';
    if (t.indexOf('单') >= 0 || t.indexOf('选择') >= 0) return 'single';
    if (t.indexOf('判断') >= 0) return 'judge';
    if (t.indexOf('综合') >= 0 || t.indexOf('简答') >= 0 || t.indexOf('问答') >= 0 || t.indexOf('计算') >= 0) return 'essay';
    return '';
  }

  /* ---------- JSON ---------- */
  function normalizeRawQuestion(o, idx) {
    if (typeof o === 'string') return { stem: o, options: [], answer: [], analysis: '' };
    var stem = o.stem || o.question || o.title || o['题目'] || o['题干'] || o.content || '';
    var rawOpts = o.options || o['选项'] || o.choices || null;
    var options = [];
    if (Array.isArray(rawOpts)) {
      rawOpts.forEach(function (op, i) {
        var k = 'ABCDEFGH'[i];
        if (typeof op === 'string') options.push({ k: k, t: op });
        else if (op && typeof op === 'object') options.push({ k: (op.k || op.key || k), t: String(op.t || op.text || op.value || '') });
      });
    } else if (rawOpts && typeof rawOpts === 'object') {
      for (var k in rawOpts) options.push({ k: k.toUpperCase(), t: String(rawOpts[k]) });
    } else {
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(function (L) {
        var v = o[L] != null ? o[L] : (o['选项' + L] != null ? o['选项' + L] : o[L.toLowerCase()]);
        if (v != null && String(v).trim() !== '') options.push({ k: L, t: String(v) });
      });
    }
    var ans = o.answer != null ? o.answer : (o['答案'] != null ? o['答案'] : o.correct);
    var answer = Array.isArray(ans) ? ans.map(function (x) { return String(x).trim().toUpperCase(); }) : parseAnswerLoose(ans);
    return {
      stem: String(stem).trim(),
      options: options,
      answer: answer,
      analysis: String(o.analysis || o.explain || o.explanation || o['解析'] || '').trim(),
      chapter: String(o.chapter || o['章节'] || o.subject || '').trim(),
      section: String(o.section || o['小节'] || '').trim(),
      level: String(o.level || o['难度'] || o['等级'] || '').trim(),
      type: normalizeTypeName(o.type || o['题型'])
    };
  }

  function parseJson(raw) {
    var data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    var arr = [];
    if (Array.isArray(data)) arr = data;
    else if (data && Array.isArray(data.questions)) arr = data.questions;
    else if (data && data.bank && Array.isArray(data.bank.questions)) arr = data.bank.questions;
    else if (data && data.data && Array.isArray(data.data.questions)) arr = data.data.questions;
    else throw new Error('JSON 中未找到题目数组');
    var qs = arr.map(function (o, i) { return normalizeRawQuestion(o, i); }).filter(function (q) { return q.stem; });
    return { questions: qs, warnings: [], meta: (data && data.meta) || null, chapters: (data && data.chapters) || null, sections: (data && data.sections) || null };
  }

  /* ---------- 统一构建题库对象 ---------- */
  function hashId(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(36);
  }

  function buildBank(parsed, meta) {
    var qs = parsed.questions || [];
    var chapters = parsed.chapters || [], sections = parsed.sections || [];
    var chMap = {}, secMap = {};
    chapters.forEach(function (c) { c.name = c.name || '未分章'; chMap[c.name] = c; });
    sections.forEach(function (s) { secMap[s.name + '|' + s.chapterId] = s; });

    var out = [];
    var idCount = {};
    for (var i = 0; i < qs.length; i++) {
      var q = qs[i] || {};
      var stem = normText(q.stem).replace(/[（(]\s*[）)]/g, '（  ）');
      if (!stem) continue;
      var chName = normText(q.chapter) || (q.chapterId && chMap[q.chapterId] ? chMap[q.chapterId].name : '') || '未分章';
      var ch = chMap[chName];
      if (!ch) {
        ch = { id: 'ch' + (chapters.length + 1), name: chName };
        chapters.push(ch); chMap[chName] = ch;
      }
      var secName = normText(q.section) || '';
      var sec = null;
      if (secName) {
        sec = secMap[secName + '|' + ch.id];
        if (!sec) {
          sec = { id: 's' + (sections.length + 1), name: secName, type: q.sectionType || q.type || 'single', level: q.level || '', chapterId: ch.id };
          sections.push(sec); secMap[secName + '|' + ch.id] = sec;
        }
      }
      var options = (q.options || []).filter(function (o) { return o && String(o.t || '').trim() !== ''; });
      var answer = (q.answer || []).map(function (a) { return String(a).trim(); });
      var type = q.type || inferType({ options: options, answer: answer, analysis: q.analysis });
      if (type === 'essay' && options.length >= 2 && answer.length) type = answer.length > 1 ? 'multi' : 'single';
      if (type === 'single' && answer.length > 1) type = 'multi';
      if (type !== 'judge' && type !== 'essay' && options.length < 2) type = answer.length ? type : 'essay';

      var sig = hashId(ch.name + '\u0001' + stem + '\u0001' + options.map(function (o) { return o.k + o.t; }).join('\u0002'));
      idCount[sig] = (idCount[sig] || 0) + 1;
      var id = 'q' + sig + (idCount[sig] > 1 ? '_' + idCount[sig] : '');

      var valid = true;
      if (type === 'single' || type === 'multi') {
        if (options.length < 2) valid = false;
        if (!answer.length) valid = false;
        var keys = options.map(function (o) { return o.k; });
        if (answer.some(function (a) { return keys.indexOf(a) < 0; })) valid = false;
      } else if (type === 'judge') {
        if (!answer.length) valid = false;
      }
      out.push({
        id: id,
        chapter: ch.name,
        chapterId: ch.id,
        section: sec ? sec.name : '',
        sectionId: sec ? sec.id : '',
        type: type,
        sectionType: (q.sectionType || type),
        level: q.level || (sec ? sec.level : ''),
        no: q.no || 0,
        stem: stem,
        options: options,
        answer: answer,
        analysis: normText(q.analysis),
        issues: q.issues || [],
        valid: valid
      });
    }
    return {
      meta: meta || { title: '我的题库', count: out.length, generatedAt: new Date().toISOString() },
      chapters: chapters,
      sections: sections,
      questions: out
    };
  }

  /* ---------- docx 解包（Word 2007+） ---------- */
  function u16(dv, o) { return dv.getUint16(o, true); }
  function u32(dv, o) { return dv.getUint32(o, true); }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('当前浏览器不支持自动解压 .docx，请把文档另存为 .txt 后导入');
    }
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    var buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }

  async function docxToText(arrayBuffer) {
    var bytes = new Uint8Array(arrayBuffer);
    var dv = new DataView(arrayBuffer);
    var eocd = -1;
    for (var i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i--) {
      if (u32(dv, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 .docx 文件');
    var count = u16(dv, eocd + 10);
    var cdOff = u32(dv, eocd + 16);
    var target = null, p = cdOff;
    for (var k = 0; k < count; k++) {
      if (u32(dv, p) !== 0x02014b50) break;
      var method = u16(dv, p + 10);
      var csize = u32(dv, p + 20);
      var nameLen = u16(dv, p + 28);
      var extraLen = u16(dv, p + 30);
      var commentLen = u16(dv, p + 32);
      var localOff = u32(dv, p + 42);
      var name = new TextDecoder('utf-8').decode(bytes.subarray(p + 46, p + 46 + nameLen));
      if (name === 'word/document.xml') { target = { method: method, csize: csize, localOff: localOff }; break; }
      p += 46 + nameLen + extraLen + commentLen;
    }
    if (!target) throw new Error('文档中没有 word/document.xml');
    var lp = target.localOff;
    if (u32(dv, lp) !== 0x04034b50) throw new Error('压缩包结构异常');
    var lNameLen = u16(dv, lp + 26);
    var lExtraLen = u16(dv, lp + 28);
    var dataStart = lp + 30 + lNameLen + lExtraLen;
    var raw = bytes.subarray(dataStart, dataStart + target.csize);
    var xmlBytes = target.method === 0 ? raw : await inflateRaw(raw);
    var xml = new TextDecoder('utf-8').decode(xmlBytes);
    return xmlToText(xml);
  }

  function xmlToText(xml) {
    xml = xml.replace(/<w:tab\b[^>]*\/>/g, '\t')
             .replace(/<w:br\b[^>]*\/>/g, '\n')
             .replace(/<\/w:p>/g, '\n')
             .replace(/<\/w:tc>/g, '\t')
             .replace(/<[^>]+>/g, '');
    return xml
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
      .replace(/&amp;/g, '&');
  }

  /* ---------- 判分 ---------- */
  function judgeAnswer(q, picked) {
    picked = picked || [];
    if (q.type === 'essay') return null;
    if (q.type === 'judge') return picked.length === 1 && picked[0] === q.answer[0];
    if (q.type === 'single') return picked.length === 1 && q.answer.length === 1 && picked[0] === q.answer[0];
    if (q.type === 'multi') {
      if (picked.length !== q.answer.length) return false;
      for (var i = 0; i < q.answer.length; i++) if (picked.indexOf(q.answer[i]) < 0) return false;
      return true;
    }
    return false;
  }

  function answerText(q) {
    if (!q) return '';
    if (q.type === 'judge') return q.answer[0] || '';
    if (q.type === 'essay') return q.analysis || '（无参考答案）';
    return (q.answer || []).join('、');
  }

  /* ---------- 自动识别格式 ---------- */
  function guessFormat(text, filename) {
    var name = (filename || '').toLowerCase();
    var head = String(text).trim().slice(0, 1);
    if (/\.json$/.test(name)) return 'json';
    if (/\.(csv|tsv)$/.test(name)) return 'csv';
    if (head === '[' || head === '{') return 'json';
    if (/\n/.test(text) && /[,\t]/.test(text.split(/\r?\n/)[0]) && /题|question|答案/i.test(text.split(/\r?\n/)[0])) return 'csv';
    return 'text';
  }

  function parseAuto(text, filename) {
    var fmt = guessFormat(text, filename);
    if (fmt === 'json') return parseJson(text);
    if (fmt === 'csv') {
      var r = parseCsv(text);
      if (r.questions.length) return r;
      return parseText(text);
    }
    return parseText(text);
  }

  QB.TYPES = TYPES;
  QB.TYPE_ORDER = TYPE_ORDER;
  QB.normText = normText;
  QB.parseText = parseText;
  QB.parseCsv = parseCsv;
  QB.parseJson = parseJson;
  QB.parseAuto = parseAuto;
  QB.buildBank = buildBank;
  QB.docxToText = docxToText;
  QB.judgeAnswer = judgeAnswer;
  QB.answerText = answerText;
  QB.parseAnswerLoose = parseAnswerLoose;
  QB.normalizeTypeName = normalizeTypeName;
  QB.splitOptions = splitOptions;
  QB.guessFormat = guessFormat;

  global.QB = QB;
  if (typeof module !== 'undefined' && module.exports) module.exports = QB;
})(typeof window !== 'undefined' ? window : globalThis);
