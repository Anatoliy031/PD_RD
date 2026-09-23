/* PD_RD — проектные решения по опорам и пролётам.
   propose(d) — автоматическое предложение решений (не трогает решения,
   принятые проектировщиком, если не указано иное);
   check(d)   — проверка решений по нормам (ТТ № 282р, ПУЭ-7) и профилю оператора.
   Решение хранится в pole.design:
     { decision, by, h_m, node, sleeve, sleeveType, reserve_m, dampers, tags, note, why } */
(function (global) {
'use strict';

var DECISIONS = [
  { id: 'place',     title: 'Размещать', short: 'размещать' },
  { id: 'after',     title: 'Размещать после восстановления опоры владельцем', short: 'после восстановления' },
  { id: 'extra',     title: 'Установить промежуточную опору (Е.1, по согласованию с владельцем)', short: 'доп. опора (Е.1)' },
  { id: 'recheck',   title: 'Размещать после поверочного расчёта по типовому проекту', short: 'после поверочного расчёта' },
  { id: 'bypass',    title: 'Обход участка (кабель по опоре не проходит)', short: 'обход' },
  { id: 'exclude',   title: 'Не размещать', short: 'не размещать' }
];
var NODES = {
  'П':   'Узел поддерживающий (промежуточная опора)',
  'ПУ':  'Узел поддерживающий угловой (промежуточно-угловая опора)',
  'А2':  'Узел анкерный двусторонний (натяжные зажимы с двух сторон)',
  'А1':  'Узел анкерный односторонний (концевая опора)',
  'АО':  'Узел анкерный с ответвлением',
  'С':   'Узел спуска кабеля (муфта, запас)'
};
var R = function () { return global.PDRD_REFS_V25; };
var N = function () { return global.PDRD_NORMS; };
var PR = function () { return global.PDRD_PROFILES; };

function num(v) { var n = typeof v === 'number' ? v : parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }
function kvKey(kv) { return String(kv).replace('.', ','); }

function params(d) {
  var pr = PR() ? PR().get(d.profile && d.profile.operator).params || {} : {};
  var own = d.decideParams || {};
  function pick(k) { return own[k] !== undefined && own[k] !== null && own[k] !== '' ? own[k] : pr[k]; }
  return {
    buildLength_m: num(own.buildLength_m),
    minBuildLength_m: num(pick('minBuildLength_m')),
    reserveT_m: num(pick('reserveT_m')),
    emergencyShare: num(pick('emergencyShare')) || 0,
    dampersFromSpan_m: num(own.dampersFromSpan_m),
    dampersOwnProtector: !!pick('dampersOwnProtector'),
    sleeveBelowCrossarm: !!pick('sleeveBelowCrossarm'),
    cableH: num((d.designDefaults || {}).cableH),
    minGap: num(own.minGap_m) || 0.05,
    sleeveMode: own.sleeveMode === 'auto' ? 'auto' : 'manual',
    profileNote: pr.note || ''
  };
}

/* Сводка по физической опоре: схема, граничная ли, соседние опоры, итог расчёта */
function poleInfo(d) {
  var R_ = R(), calcBy = {}, byKey = {}, info = {};
  ((d.calcResult || {}).poles || []).forEach(function (x) { calcBy[x.id] = x; });
  d.poles.forEach(function (p) { (p.fromReport || []).forEach(function (r) { byKey[r.line_id + '|' + r.num] = p; }); });
  var lineOn = {};
  (d.lines || []).forEach(function (l) { lineOn[l.id] = l.cable !== false; });
  d.poles.forEach(function (p) {
    var ref = R_ ? R_.poleByMark(p.mark) : null;
    var recs = p.fromReport || [];
    var neigh = {};
    recs.forEach(function (r) {
      [r.prev, r.next].forEach(function (n) { var q = n && byKey[r.line_id + '|' + n]; if (q && q !== p) neigh[q.id] = q; });
    });
    var on = recs.some(function (r) { return lineOn[r.line_id] !== false; });
    info[p.id] = {
      ref: ref, scheme: ref ? ref.sch : '', anchor: ref ? /анкер|концев|ответвит/.test(ref.sch) : false,
      angle: ref ? /углов/.test(ref.sch) && !/анкер/.test(ref.sch) : false,
      end: ref ? /концев/.test(ref.sch) : false, branch: ref ? /ответвит/.test(ref.sch) : false,
      degree: Object.keys(neigh).length, neigh: Object.keys(neigh).map(function (k) { return neigh[k]; }),
      calc: calcBy[p.id] || null, on: on,
      excluded: /аварийн/i.test(p.state || '') || recs.some(function (r) { return /нет|отсутств/i.test(r.tech_possibility || ''); }),
      overGab: recs.some(function (r) { return ref && num(r.span_next_m) !== null && ref.lgab && num(r.span_next_m) > ref.lgab; }),
      spanMax: Math.max.apply(null, recs.map(function (r) { return Math.max(num(r.span_next_m) || 0, num(r.span_prev_m) || 0); }).concat([0])),
      joint: recs.length > 1
    };
  });
  return info;
}

/* Допустимый интервал высот подвеса на опоре */
function heightWindow(d, p, inf, prm) {
  var norms = N(), C = global.PDRD_CALC;
  var items = [], hMin = null, why = [];
  (p.fromReport || []).forEach(function (r) {
    var ws = (d.lines || []).filter(function (l) { return l.id === r.line_id; })[0];
    var wires = (ws && ws.wires && ws.wires.length) ? ws.wires : ((d.wiresByKv || {})[kvKey(r.kv)] || []);
    wires.forEach(function (w) {
      var h = num(w.h_m);
      if (h === null && inf.ref) h = inf.ref.h;
      if (h !== null) items.push({ name: w.mark + ' ' + kvKey(r.kv) + ' кВ', h: h, kind: 'wire', kv: r.kv, mark: w.mark });
    });
    if (r.existing && num(r.existing_h) !== null) items.push({ name: 'ранее размещённый ОК', h: num(r.existing_h), kind: 'cable' });
  });
  /* норма до провода — по наибольшему классу напряжения на опоре */
  var normWire = 0;
  items.filter(function (x) { return x.kind === 'wire'; }).forEach(function (w) {
    var v = norms.wireDistance(w.kv, w.mark).value;
    if (v !== null && v > normWire) normWire = v;
  });
  /* нижняя граница: габарит 5,0 м при наибольшей стреле соседних пролётов */
  var fmax = 0;
  ((d.calcResult || {}).spans || []).forEach(function (s) {
    if ((p.lines || []).some(function (l) { return l.lineId === s.line && (l.num === s.from || l.num === s.to); }) && s.fmax) fmax = Math.max(fmax, s.fmax);
  });
  var g = norms.val('tt.dist.ground').value;
  hMin = g + fmax;
  if (!fmax) why.push('стрела не рассчитана — нижняя граница принята без стрелы');
  var fix = norms.val('tt.dist.fixH').value;
  if (!items.length) return { ok: false, reason: 'провода на опоре не заданы', items: items };
  var fi = C.freeIntervals({ topLimit: 100, normWire: normWire, fixDist: fix, hMinCable: hMin, items: items });
  return { ok: fi.free.length > 0, free: fi.free, lo: fi.lo, hi: fi.hi, hMin: hMin, normWire: normWire, fmax: fmax, items: items, why: why,
           reason: fi.free.length ? '' : 'нет свободного интервала: нижняя граница ' + C.fmt(hMin, 2) + ' м (габарит + стрела), верхняя ' + C.fmt(fi.hi, 2) + ' м (провод − ' + C.fmt(normWire, 2) + ' м)' };
}

function nodeFor(inf) {
  if (inf.end) return 'А1';
  if (inf.branch) return 'АО';
  if (inf.anchor) return 'А2';
  if (inf.angle) return 'ПУ';
  return 'П';
}

/* Автоматическое предложение решений */
function propose(d, opt) {
  opt = opt || {};
  var info = poleInfo(d), prm = params(d), C = global.PDRD_CALC, out = { changed: 0, kept: 0 };
  d.poles.forEach(function (p) {
    var cur = p.design || {};
    if (cur.by === 'проектировщик' && !opt.overwrite) { out.kept++; return; }
    var inf = info[p.id], des = { by: 'авто', why: [] };
    if (!inf.on) { des.decision = 'bypass'; des.why.push('линия исключена из трассы кабеля'); }
    else if (inf.excluded) { des.decision = 'after'; des.why.push('нет технологической возможности по отчёту (' + (p.state || '') + '); размещение — после восстановления владельцем, сроки не возлагаются на пользователя'); }
    else {
      var cr = inf.calc;
      if (cr && cr.status === 'exceed') {
        if (inf.anchor) { des.decision = 'recheck'; des.why.push('расчёт не выполнен для конструкции с подкосом'); }
        else { des.decision = 'extra'; des.why.push('несущая способность не обеспечена: ' + (cr.reasons || []).join('; ')); }
      } else if (inf.overGab && !(cr && cr.status === 'ok')) {
        des.decision = 'recheck'; des.why.push('пролёт больше габаритного — требуется полный поверочный расчёт');
      } else if (inf.anchor && !(cr && cr.status === 'ok')) {
        des.decision = 'recheck'; des.why.push('анкерная/концевая/ответвительная опора — поверочный расчёт по типовому проекту');
      } else {
        des.decision = 'place';
        if (!cr) des.why.push('расчёт не выполнен');
        else if (cr.status === 'blocked') des.why.push('расчёт не завершён: нет исходных данных');
      }
    }
    des.node = nodeFor(inf);
    if (des.decision !== 'bypass') {
      var hw = heightWindow(d, p, inf, prm);
      des.hWindow = hw.ok ? hw.free.map(function (x) { return [x[0], x[1]]; }) : [];
      if (hw.ok) {
        /* предпочтительная высота — проектная по умолчанию, если попадает; иначе ближайшая граница с зазором */
        var target = prm.cableH !== null ? prm.cableH : hw.free[0][1];
        var best = null;
        hw.free.forEach(function (iv) {
          var lo = iv[0] + prm.minGap, hi = iv[1] - prm.minGap;
          if (lo > hi) return;
          var h = Math.min(hi, Math.max(lo, target));
          if (best === null || Math.abs(h - target) < Math.abs(best - target)) best = h;
        });
        if (best !== null) des.h_m = Math.round(best * 100) / 100;
        else des.why.push('свободный интервал уже допуска');
      } else {
        des.why.push(hw.reason);
        if (des.decision === 'place' && /нет свободного/.test(hw.reason)) des.decision = 'extra';
      }
    }
    des.sleeve = false; des.reserve_m = null; des.dampers = false; des.tags = 0;
    p.design = Object.assign({}, cur, des);
    out.changed++;
  });
  fixSpans(d, info, opt);
  if (prm.sleeveMode === 'auto') placeSleeves(d, info, prm);
  else keepSleeves(d, prm);
  placeDampers(d, info, prm);
  return out;
}

/* Пролёты с невыполненным габаритом или расстоянием до проводов:
   дополнительная опора у промежуточного конца пролёта (мероприятие Е.1) */
function fixSpans(d, info, opt) {
  var byKey = {};
  d.poles.forEach(function (p) { (p.lines || []).forEach(function (l) { byKey[l.lineId + '|' + l.num] = p; }); });
  ((d.calcResult || {}).spans || []).forEach(function (s) {
    if (s.status !== 'exceed') return;
    var a = byKey[s.line + '|' + s.from], b = byKey[s.line + '|' + s.to];
    var ends = [a, b].filter(Boolean);
    if (ends.some(function (p) { return p.design && p.design.decision === 'extra'; })) return;
    var pick = ends.filter(function (p) { return !info[p.id].anchor; })[0] || ends[0];
    if (!pick || !pick.design || (pick.design.by === 'проектировщик' && !(opt && opt.overwrite))) return;
    if (['place', 'recheck'].indexOf(pick.design.decision) < 0) return;
    pick.design.decision = 'extra';
    pick.design.why.push('пролёт ' + s.from + ' — ' + s.to + ': ' + (s.reasons || []).join('; ') + ' — дополнительная опора в пролёте');
  });
}

/* Ручной режим: муфты остаются там, где их назначил проектировщик (заказчик);
   программа только дополняет узел и длину запаса. */
function keepSleeves(d, prm) {
  d.poles.forEach(function (p) {
    var x = p.design; if (!x || !x.sleeve) return;
    if (['place', 'recheck', 'extra', 'after'].indexOf(x.decision) < 0) return;
    x.node = 'С';
    if (num(x.reserve_m) === null) x.reserve_m = prm.reserveT_m;
    if (!x.sleeveType) x.sleeveType = 'прямая';
  });
}

/* Муфты и запасы: в точках ветвления трассы и по строительной длине.
   Размещаются на анкерных опорах; не на двух смежных промежуточных (ТТ № 282р). */
function placeSleeves(d, info, prm) {
  var C = global.PDRD_CALC, D = global.PDRD_DESIGN;
  var placed = {};
  function put(p, type, why) {
    if (!p || placed[p.id] || (p.design || {}).by === 'проектировщик') return;
    if (['place', 'recheck'].indexOf((p.design || {}).decision) < 0) return;
    placed[p.id] = 1;
    p.design.sleeve = true; p.design.sleeveType = type; p.design.reserve_m = prm.reserveT_m;
    p.design.node = 'С'; p.design.why.push(why);
  }
  /* 1) точки ветвления: ответвительные опоры и совместные опоры, где сходятся более двух пролётов */
  d.poles.forEach(function (p) {
    var inf = info[p.id];
    if (inf.branch || inf.degree > 2) put(p, 'разветвительная', 'точка ветвления трассы');
  });
  /* 2) строительная длина: по анкерным участкам вдоль линии */
  if (prm.buildLength_m && D) {
    var secs = D.sections(d), acc = 0;
    secs.forEach(function (s) {
      acc += s.length * 1.02;
      if (acc >= prm.buildLength_m * 0.95) {
        var end = s.poles[s.poles.length - 1];
        put(end.pole, 'прямая', 'стык строительных длин (накоплено ' + C.fmt(acc, 0) + ' м)');
        acc = 0;
      }
    });
  }
}

/* Гасители вибрации: по паспорту кабеля — с какой длины пролёта требуются */
function placeDampers(d, info, prm) {
  if (!prm.dampersFromSpan_m) return;
  d.poles.forEach(function (p) {
    var inf = info[p.id];
    if (!p.design || (p.design.by === 'проектировщик') || ['place', 'recheck'].indexOf(p.design.decision) < 0) return;
    if (inf.spanMax >= prm.dampersFromSpan_m) {
      p.design.dampers = true;
      p.design.why.push('пролёт ' + inf.spanMax + ' м ≥ ' + prm.dampersFromSpan_m + ' м — гасители вибрации' + (prm.dampersOwnProtector ? ' на отдельных протекторах' : ''));
    }
  });
}

/* Проверка решений */
function check(d) {
  var info = poleInfo(d), prm = params(d), C = global.PDRD_CALC, out = [];
  function add(lv, p, text, ref) { out.push({ lv: lv, pole: p ? p.id : '', where: p ? (p.lines || []).map(function (l) { return l.num; }).join(' / ') + ' (' + (p.mark || '—') + ')' : 'проект', text: text, ref: ref || '' }); }
  var sl = d.poles.filter(function (p) { return p.design && p.design.sleeve; });
  if (!sl.length) add(prm.sleeveMode === 'auto' ? 'warn' : 'stop', null, 'Муфты и запасы кабеля не назначены' + (prm.sleeveMode === 'auto' ? '' : ' (ручной режим): отметьте опоры, указанные заказчиком, в столбце «Муфта»'));
  var noDec = d.poles.filter(function (p) { return !p.design || !p.design.decision; });
  if (noDec.length) add('stop', null, 'Решение не назначено для ' + noDec.length + ' опор');
  if (prm.reserveT_m === null) add('stop', null, 'Длина технологического запаса не задана' + (prm.profileNote ? ' (' + prm.profileNote + ')' : ''));
  if (!prm.buildLength_m) add('warn', null, 'Строительная длина кабеля не задана — муфты расставлены только в точках ветвления');
  if (prm.minBuildLength_m && prm.buildLength_m && prm.buildLength_m < prm.minBuildLength_m)
    add('stop', null, 'Строительная длина ' + prm.buildLength_m + ' м меньше требуемой профилем ' + prm.minBuildLength_m + ' м');
  if (!prm.dampersFromSpan_m) add('warn', null, 'Не задана длина пролёта, с которой требуются гасители вибрации (паспорт кабеля, СО 34.20.265-2005)');
  var adjRef = N().val('tt.sleeve.adjacent');
  d.poles.forEach(function (p) {
    var des = p.design || {}, inf = info[p.id];
    if (!des.decision) return;
    if (inf.excluded && ['place', 'recheck', 'extra'].indexOf(des.decision) >= 0)
      add('stop', p, 'Решение «' + title(des.decision) + '» на опоре без технологической возможности (' + (p.state || '') + ')', 'отчёт п. 13; ч. 1 ст. 10 135-ФЗ');
    if (des.decision === 'place' && inf.calc && inf.calc.status === 'exceed')
      add('stop', p, 'Размещение при невыполненной проверке несущей способности', 'ТТ № 282р, п. 6');
    if (des.decision === 'place' && inf.calc && inf.calc.status === 'blocked')
      add('warn', p, 'Расчёт не завершён — нет исходных данных', 'ТТ № 282р, п. 6');
    if (['place', 'recheck'].indexOf(des.decision) >= 0) {
      var h = num(des.h_m);
      if (h === null) add('stop', p, 'Высота подвеса не определена');
      else if (des.hWindow && des.hWindow.length && !des.hWindow.some(function (iv) { return h >= iv[0] - 1e-9 && h <= iv[1] + 1e-9; }))
        add('stop', p, 'Высота подвеса ' + C.fmt(h, 2) + ' м вне допустимых интервалов ' + des.hWindow.map(function (iv) { return C.fmt(iv[0], 2) + '…' + C.fmt(iv[1], 2); }).join(', ') + ' м', 'ТТ № 282р, пп. 3.2.2–3.2.6');
      if (des.sleeve) {
        if (!inf.anchor) {
          var bad = inf.neigh.filter(function (q) { return q.design && q.design.sleeve && !info[q.id].anchor; });
          if (bad.length) add('stop', p, 'Муфты (запасы) на смежных промежуточных опорах: ' + bad.map(function (q) { return (q.lines[0] || {}).num; }).join(', '), 'ТТ № 282р, ' + adjRef.ref.split(', ')[1]);
        }
        if (num(des.reserve_m) === null) add('stop', p, 'Длина запаса у муфты не задана');
      }
    }
  });
  out.sort(function (a, b) { return (a.lv === 'stop' ? 0 : 1) - (b.lv === 'stop' ? 0 : 1); });
  return out;
}
function title(id, short) { var x = DECISIONS.filter(function (z) { return z.id === id; })[0]; return x ? (short ? x.short : x.title) : id; }

/* Сводные количества для спецификации */
function totals(d) {
  var t = { place: 0, after: 0, extra: 0, recheck: 0, bypass: 0, exclude: 0, sleeves: 0, reserves_m: 0, dampers: 0, nodes: {} };
  d.poles.forEach(function (p) {
    var x = p.design || {};
    if (x.decision) t[x.decision] = (t[x.decision] || 0) + 1;
    if (['place', 'recheck'].indexOf(x.decision) >= 0) {
      t.nodes[x.node] = (t.nodes[x.node] || 0) + 1;
      if (x.sleeve) { t.sleeves++; t.reserves_m += num(x.reserve_m) || 0; }
      if (x.dampers) t.dampers++;
    }
  });
  return t;
}

/* Назначить или снять муфту на опоре (решение проектировщика или заказчика) */
function setSleeve(d, poleId, on, opt) {
  opt = opt || {};
  var prm = params(d);
  var p = d.poles.filter(function (x) { return x.id === poleId; })[0];
  if (!p) throw new Error('опора не найдена');
  p.design = p.design || { why: [] };
  p.design.sleeve = !!on;
  p.design.by = 'проектировщик';
  if (on) {
    p.design.sleeveType = opt.type || p.design.sleeveType || 'прямая';
    if (num(p.design.reserve_m) === null) p.design.reserve_m = opt.reserve_m !== undefined ? opt.reserve_m : prm.reserveT_m;
    p.design.node = 'С';
    (p.design.why = p.design.why || []).push('муфта назначена проектировщиком');
  } else {
    p.design.sleeveType = ''; p.design.reserve_m = null;
    var inf = poleInfo(d)[poleId];
    p.design.node = nodeFor(inf);
  }
  return p;
}

global.PDRD_DECIDE = { DECISIONS: DECISIONS, NODES: NODES, params: params, setSleeve: setSleeve, poleInfo: poleInfo, heightWindow: heightWindow,
  propose: propose, check: check, totals: totals, title: title };
})(typeof window !== 'undefined' ? window : globalThis);
