/* PD_RD — длины кабеля, спецификация оборудования, изделий и материалов
   (ГОСТ 21.110-2013) и ведомость объёмов работ.
   Количества выводятся только из решений по опорам и расчёта; марки изделий —
   из утверждённого каталога (pdrd-refs.js), до его утверждения — обобщённые
   наименования с отметкой «по каталогу». */
(function (global) {
'use strict';
var INCL = ['place', 'recheck', 'extra', 'after'];
function num(v) { var n = typeof v === 'number' ? v : parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }

/* Узлы крепления: состав по обозначению */
var NODE_KIT = {
  'П':  [['Зажим поддерживающий для ОКСН', 1]],
  'ПУ': [['Зажим поддерживающий для ОКСН (угловой)', 1]],
  'А2': [['Зажим натяжной для ОКСН', 2]],
  'А1': [['Зажим натяжной для ОКСН', 1]],
  'АО': [['Зажим натяжной для ОКСН', 3]],
  'С':  [['Зажим натяжной для ОКСН', 2], ['Кронштейн (устройство) для муфты и запаса кабеля', 1]]
};

function specParams(d) {
  var sp = d.specParams || {};
  var X = global.PDRD_DECIDE, prm = X ? X.params(d) : {};
  return {
    sagFactor: num(sp.sagFactor) || 1.02,
    sagFactorSet: num(sp.sagFactor) !== null,
    reservesPerSleeve: num(sp.reservesPerSleeve) || 2,
    splicingPerEnd_m: num(sp.splicingPerEnd_m) || 0,
    fibers: num((d.cable || {}).fibers),
    reserveT_m: prm.reserveT_m,
    emergencyShare: prm.emergencyShare || 0,
    buildLength_m: prm.buildLength_m,
    signs: !!((global.PDRD_PROFILES && global.PDRD_PROFILES.get(d.profile && d.profile.operator).params) || {}).signH_m,
    dampersOwnProtector: prm.dampersOwnProtector
  };
}

/* Пролёты, по которым проходит кабель. Граф линии строится по ссылкам
   «пред.» и «след.» без учёта направления обхода — в отчёте оно различается
   на разных участках, иначе часть пролётов теряется и длина занижается. */
function cableSpans(d) {
  var byKey = {}, out = [], seen = {}, lineOff = {};
  (d.lines || []).forEach(function (l) { if (l.cable === false) lineOff[l.id] = 1; });
  d.poles.forEach(function (p) { (p.fromReport || []).forEach(function (r) { byKey[r.line_id + '|' + r.num] = { p: p, r: r }; }); });
  d.poles.forEach(function (p) {
    (p.fromReport || []).forEach(function (r) {
      if (lineOff[r.line_id]) return;
      [[r.next, num(r.span_next_m)], [r.prev, num(r.span_prev_m)]].forEach(function (e) {
        var n = e[0], L = e[1];
        if (!n || !L) return;
        var q = byKey[r.line_id + '|' + n];
        if (!q || q.p === p) return;
        var k = r.line_id + '|' + (r.num < n ? r.num + '|' + n : n + '|' + r.num);
        if (seen[k]) return;
        var a = (p.design || {}).decision, b = (q.p.design || {}).decision;
        if (INCL.indexOf(a) < 0 || INCL.indexOf(b) < 0) return;
        seen[k] = 1;
        out.push({ line: r.line_id, from: p, to: q.p, fromNum: r.num, toNum: n, L: L });
      });
    });
  });
  return out;
}

function lengths(d) {
  var C = global.PDRD_CALC, sp = specParams(d), spans = cableSpans(d);
  var sum = spans.reduce(function (a, s) { return a + s.L; }, 0);
  var sleeves = d.poles.filter(function (p) { return p.design && p.design.sleeve && INCL.indexOf(p.design.decision) >= 0; });
  var reserves = sleeves.reduce(function (a, p) { return a + (num(p.design.reserve_m) || sp.reserveT_m || 0) * sp.reservesPerSleeve; }, 0);
  var splicing = sleeves.length * sp.reservesPerSleeve * sp.splicingPerEnd_m;
  var r = C.cableLength({ spansSum: sum, sagFactor: sp.sagFactor, reserves: reserves, splicing: splicing, emergencyShare: sp.emergencyShare });
  var total = Math.ceil(r.value);
  var builds = sp.buildLength_m ? Math.ceil(total / sp.buildLength_m) : null;
  var declared = num(d.lengthKm) !== null ? num(d.lengthKm) * 1000 : null;
  var short = declared !== null && sum < declared * 0.98 ? declared - sum : 0;
  if (short) r.trace.push('Протяжённость трассы по перечню пролётов (' + (sum / 1000).toFixed(3).replace('.', ',') + ' км) меньше заявленной в исходных данных (' + (declared / 1000).toFixed(3).replace('.', ',') + ' км) на ' + Math.round(short) + ' м: проверьте ссылки «пред./след.» и пролёты в отчёте, решения по опорам и перечень линий в трассе.');
  return { spans: spans, route_m: sum, total_m: total, trace: r.trace, sleeves: sleeves.length, reserves_m: reserves,
           buildLengths: builds, eku: sleeves.length + 1, params: sp, declared_m: declared, short_m: short };
}

function build(d) {
  var X = global.PDRD_DECIDE, sp = specParams(d), L = lengths(d), t = X.totals(d);
  var cb = d.cable || {}, cat = cb.approved ? '' : ' (марка — по утверждённому каталогу)';
  var items = [], pos = 0;
  function add(name, type, code, maker, unit, qty, mass, note) {
    if (!qty) return;
    items.push({ pos: String(++pos), name: name, type: type || '', code: code || '', maker: maker || '', unit: unit, qty: qty, mass: mass || '', note: note || '' });
  }
  add('Кабель оптический самонесущий неметаллический' + (cb.fibers ? ', ' + cb.fibers + ' ОВ' : ''), cb.mark || '', '', cb.maker || '', 'м', L.total_m,
      cb.mass_kg_km ? Math.round(cb.mass_kg_km * L.total_m / 1000) : '', 'с учётом провиса, запасов' + (sp.emergencyShare ? ' и аварийного запаса' : '') + (L.buildLengths ? '; строительных длин — ' + L.buildLengths : ''));
  var kit = {};
  Object.keys(t.nodes).forEach(function (code) {
    (NODE_KIT[code] || []).forEach(function (k) { kit[k[0]] = (kit[k[0]] || 0) + k[1] * t.nodes[code]; });
  });
  var nodesAll = Object.keys(t.nodes).reduce(function (a, k) { return a + t.nodes[k]; }, 0);
  Object.keys(kit).forEach(function (k) { add(k + cat, '', '', '', 'шт.', kit[k], '', 'ГОСТ Р 51177-2017; заделка в натяжном зажиме — не менее 90 % разрывной прочности кабеля'); });
  add('Кронштейн (бандаж) крепления узла к стойке опоры' + cat, '', '', '', 'компл.', nodesAll, '', 'по типу и диаметру стойки');
  var sl = {};
  d.poles.forEach(function (p) { var x = p.design || {}; if (x.sleeve && INCL.indexOf(x.decision) >= 0) sl[x.sleeveType || 'прямая'] = (sl[x.sleeveType || 'прямая'] || 0) + 1; });
  Object.keys(sl).forEach(function (k) { add('Муфта оптическая ' + k + cat, '', '', '', 'шт.', sl[k], '', 'на опоре, ниже проводов ВЛ'); });
  add('Гаситель вибрации для ОКСН' + cat, '', '', '', 'шт.', t.dampers * 2, '', (sp.dampersOwnProtector ? 'на отдельных протекторах; ' : '') + 'по два на опору, СО 34.20.265-2005');
  if (sp.dampersOwnProtector) add('Протектор спиральный под гаситель' + cat, '', '', '', 'шт.', t.dampers * 2, '', '');
  add('Бирка маркировочная кабельная', '', '', '', 'шт.', nodesAll, '', 'у каждого места крепления, не далее 0,10 м (ТТ № 282р, п. 3.1)');
  if (sp.signs) add('Знак постоянный на опоре', '', '', '', 'шт.', L.sleeves, '', 'у муфт, на высоте 2,5 ± 0,5 м (требование ТЗ)');
  add('Опора промежуточная (мероприятие Е.1)', '', '', '', 'шт.', t.extra, '', 'марка — по типовому проекту ВЛ, согласование с владельцем');
  return { items: items, lengths: L, totals: t };
}

function bor(d, spec) {
  spec = spec || build(d);
  var L = spec.lengths, t = spec.totals, sp = L.params, rows = [], n = 0;
  function add(name, unit, qty, note) { if (qty) rows.push({ pos: String(++n), name: name, unit: unit, qty: qty, note: note || '' }); }
  var nodesAll = Object.keys(t.nodes).reduce(function (a, k) { return a + t.nodes[k]; }, 0);
  add('Подвеска оптического кабеля на опорах ВЛ', 'км', Math.round(L.route_m) / 1000, 'по трассе');
  add('Монтаж узлов крепления кабеля', 'шт.', nodesAll);
  add('Монтаж оптических муфт с выкладкой запаса', 'шт.', L.sleeves);
  if (sp.fibers) add('Сварка оптических волокон', 'сварка', L.sleeves * sp.fibers, sp.fibers + ' ОВ в каждой муфте');
  add('Установка гасителей вибрации', 'шт.', t.dampers * 2);
  add('Установка маркировочных бирок', 'шт.', nodesAll);
  add('Установка промежуточных опор (Е.1)', 'шт.', t.extra, 'по согласованию с владельцем инфраструктуры');
  add('Измерения затухания рефлектометром на ЭКУ (две длины волны, два направления)', 'ЭКУ', L.eku);
  add('Измерение габаритов и расстояний после монтажа', 'пролёт', L.spans.length);
  add('Оформление исполнительной документации', 'компл.', 1);
  return rows;
}

global.PDRD_SPEC = { INCL: INCL, NODE_KIT: NODE_KIT, specParams: specParams, cableSpans: cableSpans, lengths: lengths, build: build, bor: bor };
})(typeof window !== 'undefined' ? window : globalThis);
