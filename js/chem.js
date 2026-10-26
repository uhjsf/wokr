/* chem.js —— 把纯文本里的化学式 / 幂次排成上下标
 *
 * 题库原文是从 PDF 抽出来的纯文字：H2SO4、Ca(OH)2、Fe3+、v^2 这些
 * 上下标信息在提取时就丢了。这里在「显示」这一层把它们补回来，
 * 数据本身不动，随时可以整体关掉（设置 → 化学式排版）。
 */
(function (global) {
  'use strict';
  var App = global.App || (global.App = {});

  var ELEMS = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni ' +
    'Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce ' +
    'Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra ' +
    'Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr').split(' ');
  var SET = {};
  ELEMS.forEach(function (e) { SET[e] = 1; });

  // 元素符号 + 1~2 位数字 → 下标（3 位以上多半是紧挨着的其它数字，不动）
  var RE_EL = /([A-Z][a-z]?)(\d{1,2})(?![0-9])/g;
  // 括号后的数字，如 Ca(OH)2
  var RE_PAREN = /\)(\d{1,2})(?![0-9])/g;
  // 题目里显式写的幂：v^2、10^-7
  var RE_POW = /\^(-?\d+)/g;
  // 独立的 10 的负次幂（如选项里的 10-7）。后面必须是空白/标点/结尾，
  // 这样「10-20题」这种页码范围不会被误改。
  var RE_TEN = /(^|[^0-9A-Za-z])10-(\d{1,2}(?:\.\d+)?)(?=[\s）)、，。；;]|$)/g;

  // 单位：kg·h-1、W·m-2·℃-1、kJ·kg-1·℃-1
  var UNITS = 'km|cm|mm|dm|kg|mg|mol|kmol|kJ|kW|kPa|MPa|Pa|mL|m|g|L|s|h|K|J|W|N|t|T|℃';
  var RE_UNIT_NEG = new RegExp('(^|[^A-Za-z])(' + UNITS + ')-(1|2|3)(?![0-9])', 'g');
  // 面积 / 体积：m2、m3、cm3
  var RE_UNIT_POS = new RegExp('(^|[^A-Za-z])(km|cm|mm|dm|m)([23])(?![0-9])', 'g');

  function chemify(html) {
    if (!html) return html;
    return String(html)
      .replace(RE_EL, function (m, el, num) {
        return SET[el] ? el + '<sub>' + num + '</sub>' : m;
      })
      .replace(RE_PAREN, ')<sub>$1</sub>')
      .replace(RE_UNIT_NEG, '$1$2<sup>-$3</sup>')
      .replace(RE_UNIT_POS, '$1$2<sup>$3</sup>')
      .replace(RE_POW, '<sup>$1</sup>')
      .replace(RE_TEN, '$110<sup>-$2</sup>');
  }

  /* 输入原始文本，输出可以直接放进 innerHTML 的字符串 */
  App.chem = function (text) {
    var raw = (text === null || text === undefined) ? '' : String(text);
    var safe = App.util.esc(raw);
    if (App.store && App.store.settings && App.store.settings.chem === false) return safe;
    return chemify(safe);
  };

  /* 已经转义过的 HTML 片段，只做上下标替换 */
  App.chemRaw = function (html) {
    if (App.store && App.store.settings && App.store.settings.chem === false) return html;
    return chemify(html);
  };
})(window);
