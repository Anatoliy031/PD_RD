/* PD_RD — длины кабеля, спецификация оборудования, изделий и материалов
   (ГОСТ 21.110-2013) и ведомость объёмов работ.
   Количества выводятся только из решений по опорам и расчёта; марки изделий —
   из утверждённого каталога (pdrd-refs.js), до его утверждения — обобщённые
   наименования с отметкой «по каталогу». */
(function (global) {
'use strict';
var INCL = ['place', 'recheck', 'extra', 'after'];
function num(v) { var n = typeof v === 'number' ? v : parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }

/* Состав узлов крепления. Ключи позиций используются в каталоге проекта
   (тип, марка, изготовитель, масса) — d.specCatalog. */
var ITEMS = {
  cable:          { name: 'Кабель оптический самонесущий неметаллический', unit: 'м' },
  clamp_susp:     { name: 'Зажим поддерживающий (спиральный) для ОКСН', unit: 'шт.' },
  node_susp:      { name: 'Узел поддерживающий (кронштейн) для крепления зажима к стойке опоры', unit: 'шт.' },
  clamp_tens:     { name: 'Зажим натяжной (спиральный) для ОКСН', unit: 'шт.' },
  node_tens:      { name: 'Узел крепления натяжной (кронштейн) для крепления к стойке опоры', unit: 'шт.' },
  turnbuckle:     { name: 'Талреп (регулируемое натяжное звено)', unit: 'шт.' },
  link:           { name: 'Звено промежуточное', unit: 'шт.' },
  band:           { name: 'Лента крепёжная (бандажная) из нержавеющей стали', unit: 'м' },
  buckle:         { name: 'Скрепа (замок) для крепёжной ленты', unit: 'шт.' },
  sleeve_holder:  { name: 'Устройство (кронштейн) для подвески оптической муфты на опоре', unit: 'шт.' },
  reserve_holder: { name: 'Устройство (кронштейн) для укладки запаса кабеля на опоре', unit: 'шт.' },
  damper:         { name: 'Гаситель вибрации для ОКСН', unit: 'шт.' },
  protector:      { name: 'Протектор спиральный под гаситель вибрации', unit: 'шт.' },
  tag:            { name: 'Бирка маркировочная кабельная', unit: 'шт.' },
  sign:           { name: 'Знак постоянный на опоре', unit: 'шт.' },
  strut:          { name: 'Подкос (подпор) для усиления одностоечной опоры', unit: 'компл.' },
  pole_extra:     { name: 'Опора промежуточная (мероприятие Е.1)', unit: 'шт.' }
};
/* Состав узла: [ключ позиции, количество]; лента и скрепы считаются по числу кронштейнов */
var NODE_KIT = {
  'П':  [['clamp_susp', 1], ['node_susp', 1]],
  'ПУ': [['clamp_susp', 1], ['node_susp', 1]],
  'А2': [['clamp_tens', 2], ['node_tens', 2], ['turnbuckle', 2], ['link', 2]],
  'А1': [['clamp_tens', 1], ['node_tens', 1], ['turnbuckle', 1], ['link', 1]],
  'АО': [['clamp_tens', 3], ['node_tens', 3], ['turnbuckle', 3], ['link', 3]],
  'С':  [['clamp_tens', 2], ['node_tens', 2], ['turnbuckle', 2], ['link', 2], ['sleeve_holder', 1], ['reserve_holder', 1]]
};
/* Число кронштейнов (бандажей) в узле — по ним считаются лента и скрепы */
var NODE_BRACKETS = { 'П': 1, 'ПУ': 1, 'А1': 1, 'А2': 2, 'АО': 3, 'С': 4 };

function specParams(d) {
  var sp = d.specParams || {};
  var X = global.PDRD_DECIDE, prm = X ? X.params(d) : {};
  return {
    bandPerBracket_m: num(sp.bandPerBracket_m) || 1.2,
    bucklesPerBracket: num(sp.bucklesPerBracket) || 2,
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

function catalogOf(d, key) {
  var c = (d.specCatalog || {})[key] || {};
  return { type: c.type || '', code: c.code || '', maker: c.maker || '', mass: c.mass || '', note: c.note || '' };
}

function build(d) {
  var X = global.PDRD_DECIDE, sp = specParams(d), L = lengths(d), t = X.totals(d);
  var cb = d.cable || {}, items = [], pos = 0, qty = {};
  function add(key, q, opt) {
    opt = opt || {};
    if (!q) return;
    var it = ITEMS[key] || { name: key, unit: 'шт.' };
    var c = catalogOf(d, key);
    items.push({ key: key, pos: String(++pos), name: opt.name || it.name, type: opt.type || c.type, code: c.code,
                 maker: c.maker, unit: it.unit, qty: Math.round(q * 100) / 100, mass: opt.mass !== undefined ? opt.mass : c.mass,
                 note: opt.note || c.note || '', needType: !(opt.type || c.type) });
  }
  /* кабель */
  add('cable', L.total_m, { name: ITEMS.cable.name + (cb.fibers ? ', ' + cb.fibers + ' ОВ' : ''),
      type: cb.mark || '', mass: cb.mass_kg_km ? Math.round(cb.mass_kg_km * L.total_m / 1000) : '',
      note: 'с учётом провиса, запасов' + (sp.emergencyShare ? ' и аварийного запаса' : '') + (L.buildLengths ? '; строительных длин — ' + L.buildLengths : '') });
  /* арматура узлов */
  var brackets = 0;
  Object.keys(t.nodes).forEach(function (code) {
    (NODE_KIT[code] || []).forEach(function (k) { qty[k[0]] = (qty[k[0]] || 0) + k[1] * t.nodes[code]; });
    brackets += (NODE_BRACKETS[code] || 1) * t.nodes[code];
  });
  var nodesAll = Object.keys(t.nodes).reduce(function (a, k) { return a + t.nodes[k]; }, 0);
  ['clamp_susp', 'node_susp', 'clamp_tens', 'node_tens', 'turnbuckle', 'link', 'sleeve_holder', 'reserve_holder'].forEach(function (k) {
    add(k, qty[k] || 0, { note: k === 'clamp_tens' ? 'заделка не менее 90 % разрывной прочности кабеля (ТТ № 282р, п. 3.3)' : '' });
  });
  add('band', Math.ceil(brackets * sp.bandPerBracket_m), { note: 'крепление кронштейнов узлов к стойкам опор, ' + String(sp.bandPerBracket_m).replace('.', ',') + ' м на кронштейн' });
  add('buckle', brackets * sp.bucklesPerBracket, { note: String(sp.bucklesPerBracket) + ' шт. на кронштейн' });
  /* муфты */
  var sl = {};
  d.poles.forEach(function (p) { var x = p.design || {}; if (x.sleeve && INCL.indexOf(x.decision) >= 0) sl[x.sleeveType || 'прямая'] = (sl[x.sleeveType || 'прямая'] || 0) + 1; });
  Object.keys(sl).forEach(function (k) {
    var key = 'sleeve_' + k;
    var c = catalogOf(d, key);
    items.push({ key: key, pos: String(++pos), name: 'Муфта оптическая (' + k + ')', type: c.type, code: c.code, maker: c.maker,
                 unit: 'шт.', qty: sl[k], mass: c.mass, note: c.note || 'на опоре, ниже проводов ВЛ', needType: !c.type });
  });
  /* гасители, бирки, знаки, усиление, дополнительные опоры */
  add('damper', t.dampers * 2, { note: (sp.dampersOwnProtector ? 'на отдельных протекторах; ' : '') + 'по два на опору, СО 34.20.265-2005' });
  if (sp.dampersOwnProtector) add('protector', t.dampers * 2);
  add('tag', nodesAll, { note: 'у каждого места крепления, не далее 0,10 м (ТТ № 282р, п. 3.1)' });
  if (sp.signs) add('sign', d.poles.filter(function (p) { return (p.design || {}).sleeve; }).length, { note: 'у муфт, на высоте 2,5 ± 0,5 м (требование ТЗ)' });
  var reinforced = d.poles.filter(function (p) { return (p.design || {}).reinforce && INCL.indexOf((p.design || {}).decision) >= 0; }).length;
  add('strut', reinforced, { note: 'усиление одностоечных опор с муфтой и запасом кабеля; марка — по типовому проекту ВЛ' });
  add('pole_extra', t.extra, { note: 'марка — по типовому проекту ВЛ, согласование с владельцем' });
  return { items: items, lengths: L, totals: t, brackets: brackets, reinforced: reinforced,
           needType: items.filter(function (x) { return x.needType; }).length };
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
  add('Усиление опор подкосом (подпором)', 'шт.', spec.reinforced || 0, 'одностоечные опоры с муфтой и запасом кабеля');
  add('Установка промежуточных опор (Е.1)', 'шт.', t.extra, 'по согласованию с владельцем инфраструктуры');
  add('Измерения затухания рефлектометром на ЭКУ (две длины волны, два направления)', 'ЭКУ', L.eku);
  add('Измерение габаритов и расстояний после монтажа', 'пролёт', L.spans.length);
  add('Оформление исполнительной документации', 'компл.', 1);
  return rows;
}

global.PDRD_SPEC = { INCL: INCL, NODE_KIT: NODE_KIT, ITEMS: ITEMS, NODE_BRACKETS: NODE_BRACKETS, catalogOf: catalogOf, specParams: specParams, cableSpans: cableSpans, lengths: lengths, build: build, bor: bor };
})(typeof window !== 'undefined' ? window : globalThis);
