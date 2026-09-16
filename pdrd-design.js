/* PD_RD — расчёт проекта целиком: анкерные участки, кабель, габариты,
   расстояния, нагрузки на физические опоры. Использует PDRD_CALC и PDRD_NORMS.
   Нет исходных данных — нет результата: элемент получает статус «заблокировано»
   с перечнем недостающих данных. Никаких «прикидок». */
(function (global) {
'use strict';
var C = function () { return global.PDRD_CALC; };
var N = function () { return global.PDRD_NORMS; };
var R = function () { return global.PDRD_REFS_V25; };

function num(v) { var n = typeof v === 'number' ? v : parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }
function kvKey(kv) { return String(kv).replace('.', ','); }

/* Исходные данные проекта для расчёта и перечень недостающих */
function inputs(d) {
  var miss = [], warn = [];
  var cl = d.climate || {};
  var calc = C();
  var W0 = num(cl.windPa) || calc.w0ByRegion(cl.windRegion);
  var bE = num(cl.iceMm) || calc.bByRegion(cl.iceRegion);
  if (!W0) miss.push({ key: 'climate.windPa', text: 'Нормативное ветровое давление (район по ветру)' });
  if (!bE) miss.push({ key: 'climate.iceMm', text: 'Нормативная толщина стенки гололёда (район по гололёду)' });
  if (!cl.terrain) miss.push({ key: 'climate.terrain', text: 'Тип местности A/B/C (ПУЭ-7, п. 2.5.6)' });
  ['tMax', 'tMin', 'tAvg'].forEach(function (k) {
    if (num(cl[k]) === null) miss.push({ key: 'climate.' + k, text: { tMax: 'Высшая температура', tMin: 'Низшая температура', tAvg: 'Среднегодовая температура' }[k] + ' (СП 131.13330.2020)' });
  });
  if (!cl.confirmed) warn.push('Климатические условия не подтверждены проектировщиком');
  var cb = d.cable || {};
  var cab = { d_mm: num(cb.d_mm), mass_kg_km: num(cb.mass_kg_km), EA: num(cb.EA_kn) ? num(cb.EA_kn) * 1000 : null,
              alpha: num(cb.alpha_e6) ? num(cb.alpha_e6) * 1e-6 : null,
              T_max: num(cb.t_mdrn_kn) ? num(cb.t_mdrn_kn) * 1000 : (num(cb.t_allow_kn) ? num(cb.t_allow_kn) * 1000 : null),
              T_avg: num(cb.t_edrn_kn) ? num(cb.t_edrn_kn) * 1000 : null,
              H_install_avg: num(cb.h_install_kn) ? num(cb.h_install_kn) * 1000 : null };
  if (cab.d_mm === null) miss.push({ key: 'cable.d_mm', text: 'Диаметр кабеля' });
  if (cab.mass_kg_km === null) miss.push({ key: 'cable.mass_kg_km', text: 'Масса кабеля' });
  if (cab.EA === null) miss.push({ key: 'cable.EA_kn', text: 'Жёсткость кабеля при растяжении EA (паспорт изготовителя)' });
  if (cab.alpha === null) miss.push({ key: 'cable.alpha_e6', text: 'Температурный коэффициент линейного расширения кабеля (паспорт)' });
  if (cab.T_max === null) miss.push({ key: 'cable.t_mdrn_kn', text: 'Максимально допустимая растягивающая нагрузка кабеля (паспорт)' });
  if (!cb.approved) warn.push('Кабель не выбран из утверждённого каталога — характеристики по отчёту/вводу');
  var cableH = num((d.designDefaults || {}).cableH);
  if (cableH === null) miss.push({ key: 'designDefaults.cableH', text: 'Высота подвеса кабеля на опоре' });
  return { W0: W0, bE: bE, terrain: cl.terrain, iceRegion: cl.iceRegion, tMax: num(cl.tMax), tMin: num(cl.tMin), tAvg: num(cl.tAvg),
           altitude: num(cl.altitude) || 0, cab: cab, cableH: cableH, miss: miss, warn: warn };
}

/* Провода линии: из раздела «Линии» проекта, иначе — по классу напряжения */
function wiresFor(d, lineId, kv) {
  var line = (d.lines || []).filter(function (l) { return l.id === lineId; })[0];
  var own = line && line.wires && line.wires.length ? line.wires : null;
  var byKv = (d.wiresByKv || {})[kvKey(kv)];
  return own || byKv || [];
}

/* Анкерные участки по линиям.
   Граф линии строится по ссылкам «пред.» и «след.» без учёта направления
   (в отчёте направление обхода на разных участках может различаться).
   Участок — цепочка пролётов между «граничными» опорами: анкерными, концевыми,
   ответвительными и опорами, где сходятся не два пролёта (ответвления, концы). */
function sections(d) {
  var R_ = R(), out = [];
  var byLine = {};
  d.poles.forEach(function (p) {
    (p.fromReport || []).forEach(function (rec) {
      (byLine[rec.line_id] = byLine[rec.line_id] || []).push({ pole: p, rec: rec });
    });
  });
  function isAnchor(x) { var ref = R_ ? R_.poleByMark(x.rec.mark) : null; return ref ? /анкер|концев|ответвит/.test(ref.sch) : false; }
  Object.keys(byLine).forEach(function (line) {
    var list = byLine[line], idx = {}, adj = {}, seenEdge = {};
    list.forEach(function (x) { idx[x.rec.num] = x; adj[x.rec.num] = []; });
    function edge(a, b, L) {
      if (!idx[a] || !idx[b] || a === b || !(L > 0)) return;
      var k = a < b ? a + '\u0000' + b : b + '\u0000' + a;
      if (seenEdge[k]) return;
      seenEdge[k] = { a: a, b: b, L: L, used: false };
      adj[a].push(seenEdge[k]); adj[b].push(seenEdge[k]);
    }
    list.forEach(function (x) {
      edge(x.rec.num, x.rec.next, num(x.rec.span_next_m));
      edge(x.rec.num, x.rec.prev, num(x.rec.span_prev_m));
    });
    function boundary(n) { return adj[n].length !== 2 || isAnchor(idx[n]); }
    function walk(start, e) {
      var sec = { line: line, kv: idx[start].rec.kv, poles: [idx[start]], spans: [] }, cur = start, guard = 0;
      while (e && !e.used && guard++ < 5000) {
        e.used = true;
        var nx = e.a === cur ? e.b : e.a;
        sec.spans.push({ from: idx[cur], to: idx[nx], L: e.L });
        sec.poles.push(idx[nx]);
        cur = nx;
        if (boundary(cur)) break;
        e = adj[cur].filter(function (z) { return !z.used; })[0];
      }
      if (sec.spans.length) out.push(sec);
    }
    Object.keys(adj).forEach(function (n) {
      if (!boundary(n)) return;
      adj[n].forEach(function (e) { if (!e.used) walk(n, e); });
    });
    Object.keys(adj).forEach(function (n) {           /* кольца без граничных опор */
      adj[n].forEach(function (e) { if (!e.used) walk(n, e); });
    });
  });
  out.forEach(function (s, i) {
    s.id = 'АУ-' + (i + 1);
    s.Lr = C().rulingSpan(s.spans.map(function (x) { return x.L; }));
    s.length = s.spans.reduce(function (a, x) { return a + x.L; }, 0);
  });
  return out;
}

/* Угол поворота линии по координатам соседних опор, градусы (0 — прямая) */
var _idx = null, _idxFor = null;
function deflection(d, rec) {
  if (_idxFor !== d) {
    _idx = {}; _idxFor = d;
    d.poles.forEach(function (p) { (p.fromReport || []).forEach(function (x) { _idx[x.line_id + '|' + x.num] = x; }); });
  }
  var a = rec.prev && _idx[rec.line_id + '|' + rec.prev], b = rec.next && _idx[rec.line_id + '|' + rec.next];
  if (!a || !b || a.lat === null || b.lat === null || rec.lat === null) return null;
  function vec(p, q) { var k = Math.cos(p.lat * Math.PI / 180); return [(q.lon - p.lon) * k, q.lat - p.lat]; }
  var u = vec(a, rec), v = vec(rec, b);
  var nu = Math.hypot(u[0], u[1]), nv = Math.hypot(v[0], v[1]);
  if (!nu || !nv) return null;
  var c = Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (nu * nv)));
  return Math.acos(c) * 180 / Math.PI;
}

function stateK(state) {
  if (/аварийн/i.test(state)) return null;
  if (/ограниченно/i.test(state)) return 0.8;
  return 1;
}

/* Полный расчёт проекта */
function run(d) {
  var calc = C(), norms = N(), R_ = R();
  var inp = inputs(d);
  var res = { at: new Date().toISOString(), inputs: inp, sections: [], poles: [], spans: [], classes: {},
              summary: { ok: 0, exceed: 0, blocked: 0, excluded: 0 }, missing: {} };
  function addMiss(text, where) { (res.missing[text] = res.missing[text] || []).push(where); }
  inp.miss.forEach(function (m) { addMiss(m.text, 'проект'); });

  var clim = { W0: inp.W0, bE: inp.bE, terrain: inp.terrain, iceRegion: inp.iceRegion, tMax: inp.tMax, tMin: inp.tMin, tAvg: inp.tAvg, altitude: inp.altitude };
  var regs = null;
  try { regs = calc.regimes(clim); } catch (e) { regs = null; }

  /* 1. Анкерные участки и кабель */
  var secs = sections(d), secBySpan = {};
  secs.forEach(function (s) {
    var row = { id: s.id, line: s.line, kv: s.kv, spans: s.spans.length, length: s.length, Lr: s.Lr, status: 'blocked', reasons: [] };
    try {
      if (!regs) throw Object.assign(new Error('температуры не заданы'), { blocked: true });
      var ld = calc.loads({ d_mm: inp.cab.d_mm, mass_kg_km: inp.cab.mass_kg_km },
        { W0: inp.W0, bE: inp.bE, terrain: inp.terrain, kv: s.kv, iceRegion: inp.iceRegion, h: inp.cableH || 0, L: s.Lr, purpose: 'wire', oksn: true });
      var sol = calc.solveSection(inp.cab, ld, regs, s.Lr);
      row.solution = sol; row.loads = ld;
      row.status = sol.ok ? 'ok' : 'exceed';
      var vert = sol.regimes.filter(function (x) { return x.id === 'tmax' || x.id === 'ice'; });
      row.fVert = vert.reduce(function (a, x) { return Math.max(a, x.f); }, 0);
      row.Hsup = sol.governing.T;  /* нормативное тяжение для нагрузки на опоры */
    } catch (e) { row.reasons.push(e.message); }
    res.sections.push(row);
    s.spans.forEach(function (sp) {
      [sp.from.rec.num, sp.to.rec.num].forEach(function (n) {
        var k = s.line + '|' + n;
        (secBySpan[k] = secBySpan[k] || []).push(row);
      });
    });
  });

  /* 2. Пролёты: габарит и расстояние до проводов */
  var gNorm = norms.val('tt.dist.ground');
  secs.forEach(function (s) {
    var srow = res.sections.filter(function (x) { return x.id === s.id; })[0];
    s.spans.forEach(function (sp) {
      var row = { section: s.id, line: s.line, from: sp.from.rec.num, to: sp.to.rec.num, L: sp.L, kv: s.kv,
                  overGab: sp.from.rec.span_gabarit_m !== null && sp.L > sp.from.rec.span_gabarit_m, gab: sp.from.rec.span_gabarit_m,
                  status: 'blocked', reasons: [] };
      if (srow.status === 'blocked') { row.reasons.push('анкерный участок не рассчитан'); }
      else {
        var hA = num((sp.from.pole.design || {}).h_m) || inp.cableH, hB = num((sp.to.pole.design || {}).h_m) || inp.cableH;
        var fmax = 0;
        srow.solution.regimes.forEach(function (x) { if (x.id === 'tmax' || x.id === 'ice') fmax = Math.max(fmax, calc.sag(x.g, sp.L, x.H)); });
        var gc = calc.groundClearance(hA, hB, fmax, sp.L);
        row.fmax = fmax; row.clearance = gc.min;
        row.clearanceOk = gc.min >= gNorm.value - 1e-9;
        if (!row.clearanceOk) row.reasons.push('габарит до земли ' + calc.fmt(gc.min, 2) + ' м < ' + calc.fmt(gNorm.value, 1) + ' м (' + gNorm.ref + ')');
        /* расстояние до проводов в пролёте */
        var wires = wiresFor(d, s.line, s.kv);
        var lowest = wires.filter(function (w) { return num(w.h_m) !== null; }).sort(function (a, b) { return num(a.h_m) - num(b.h_m); })[0];
        var dn = norms.wireDistance(s.kv, lowest ? lowest.mark : '');
        if (!lowest) row.reasons.push('провода линии (высота подвеса) не заданы');
        else if (num(lowest.f_max_m) === null) row.reasons.push('стрела провеса провода ' + lowest.mark + ' в режиме наибольшей стрелы не задана');
        else {
          var dist = calc.spanDistance({ hA: num(lowest.h_m), hB: num(lowest.h_m), f: num(lowest.f_max_m) }, { hA: hA, hB: hB, f: fmax }, sp.L);
          row.wireDist = dist.min; row.wireDistNorm = dn.value;
          if (dist.min < dn.value) row.reasons.push('расстояние до провода в пролёте ' + calc.fmt(dist.min, 2) + ' м < ' + calc.fmt(dn.value, 2) + ' м (' + dn.ref + ')');
        }
        row.status = row.reasons.length ? (row.clearanceOk === false || row.wireDist !== undefined && row.wireDist < dn.value ? 'exceed' : 'blocked') : 'ok';
      }
      res.spans.push(row);
    });
  });

  /* 3. Опоры */
  d.poles.forEach(function (p) {
    var recs = p.fromReport || [], r0 = recs[0] || {};
    var ref = R_ ? R_.poleByMark(p.mark) : null;
    var row = { id: p.id, nums: (p.lines || []).map(function (l) { return l.num; }).join(' / '),
                lines: (p.lines || []).map(function (l) { return l.lineId; }), mark: p.mark, kv: p.kv, state: p.state,
                status: 'blocked', reasons: [], warns: [] };
    var k = stateK(p.state || '');
    if (k === null || recs.some(function (x) { return /нет|отсутств/i.test(x.tech_possibility || ''); })) {
      row.status = 'excluded'; row.reasons.push('нет технологической возможности (' + (p.state || 'по отчёту') + ') — размещение не проектируется');
      res.poles.push(row); res.summary.excluded++; return;
    }
    if (!ref) { row.reasons.push('марка «' + (p.mark || '—') + '» отсутствует в справочнике'); addMiss('Марка опоры в справочнике', p.mark || row.nums); res.poles.push(row); res.summary.blocked++; return; }
    row.scheme = ref.sch; row.mAdm = ref.m_adm;
    var stand = (d.stands || {})[ref.st] || null;
    if (!stand) addMiss('Геометрия стойки ' + ref.st + ' (ширина, высота над землёй)', ref.st);
    var items = [], blocked = [];
    recs.forEach(function (rec) {
      var ws = ((num(rec.span_prev_m) || 0) + (num(rec.span_next_m) || 0)) / 2;
      if (!ws) blocked.push('пролёты у опоры ' + rec.num + ' не определены');
      var wires = wiresFor(d, rec.line_id, rec.kv);
      if (!wires.length) { blocked.push('провода линии ' + rec.line_id.slice(0, 30) + ' не заданы'); addMiss('Провода ВЛ ' + kvKey(rec.kv) + ' кВ (марка, число, диаметр, масса, высота, тяжение)', rec.line_id); }
      wires.forEach(function (w) {
        var h = num(w.h_m) !== null ? num(w.h_m) : (ref.h || null);
        if (num(w.h_m) === null) row.warns.push(w.mark + ': высота подвеса принята по справочнику (' + ref.h + ' м)');
        try {
          var lw = calc.loads({ d_mm: num(w.d_mm), mass_kg_km: num(w.mass_kg_km), isSip: /сип/i.test(w.mark) },
            { W0: inp.W0, bE: inp.bE, terrain: inp.terrain, kv: rec.kv, iceRegion: inp.iceRegion, h: h || 0, L: ws || 50, purpose: 'support1', oksn: true, multi: recs.length > 1 });
          items.push({ name: w.mark + ' (' + kvKey(rec.kv) + ' кВ)', h: h, pw: Math.max(lw.p4, lw.p5), n: num(w.n) || 1, windSpan: ws,
                       T: num(w.T_kn) !== null ? num(w.T_kn) * 1000 * 1.3 : null });
        } catch (e) { blocked.push(w.mark + ': ' + e.message); if (e.missing) addMiss('Провода ВЛ ' + kvKey(rec.kv) + ' кВ: ' + e.missing.join(', '), rec.line_id); }
      });
      /* проектируемый кабель */
      var adj = secBySpan[rec.line_id + '|' + rec.num] || [];
      var Hs = adj.map(function (x) { return x.Hsup; }).filter(function (x) { return x; });
      var srow = { Hsup: Hs.length === adj.length && Hs.length ? Math.max.apply(null, Hs) : null };
      try {
        var lc = calc.loads({ d_mm: inp.cab.d_mm, mass_kg_km: inp.cab.mass_kg_km },
          { W0: inp.W0, bE: inp.bE, terrain: inp.terrain, kv: rec.kv, iceRegion: inp.iceRegion, h: inp.cableH || 0, L: ws || 50, purpose: 'support1', oksn: true, multi: recs.length > 1 });
        var Tc = srow && srow.Hsup ? srow.Hsup * 1.3 : null;
        items.push({ name: 'Проектируемый ОК (' + (d.cable.mark || 'кабель') + ')', h: num((p.design || {}).h_m) || inp.cableH, pw: Math.max(lc.p4, lc.p5), n: 1, windSpan: ws, T: Tc });
      } catch (e) { blocked.push('кабель: ' + e.message); }
      /* ранее размещённые ОК — нужны характеристики */
      if (rec.existing) { blocked.push('ранее размещённые ОК «' + rec.existing + '» — характеристики не заданы'); addMiss('Характеристики ранее размещённых ОК', rec.num); }
    });
    var angle = num(recs.map(function (x) { return x.angle; }).filter(function (x) { return x !== null && x !== undefined; })[0]);
    var angleSuspect = false;
    if (angle === null) {
      var ang = recs.map(function (x) { return deflection(d, x); }).filter(function (x) { return x !== null; });
      if (ang.length) {
        angle = Math.max.apply(null, ang);
        row.warns.push('угол поворота ' + calc.fmt(angle, 1) + '° определён по координатам опор');
        if (angle > 90) { row.reasons.push('угол поворота по координатам ' + calc.fmt(angle, 0) + '° — проверить ссылки «пред./след.» и трассу'); angleSuspect = true; }
      }
    }
    try {
      var struts = /анкер|концев|ответвит/.test(ref.sch);
      var cap = struts ? num(((d.poleCapacity || {})[p.mark] || {}).m_cap_knm) : ref.m_adm;
      if (struts && cap === null) {
        blocked.push('опора с подкосом/оттяжкой: допустимый момент конструкции в направлении тяжения не задан (типовой проект ' + ref.proj + ')');
        addMiss('Несущая способность анкерных, концевых и ответвительных опор по типовым проектам (кН·м)', p.mark);
      }
      var pm = calc.poleMoment({ mark: p.mark, scheme: ref.sch, m_adm: cap === null ? ref.m_adm : cap, kState: k, angle: angle, windSpan: 1,
                                 stand: stand }, items, { W0: inp.W0, terrain: inp.terrain });
      if (struts && cap === null) pm.exceeds = false;
      row.M = pm.M; row.Madm = pm.Madm; row.reserve = pm.reserve; row.trace = pm.trace;
      blocked = blocked.concat(pm.blocked);
      if (pm.exceeds) { row.status = 'exceed'; row.reasons.push('момент ' + calc.fmt(pm.M / 1000, 2) + ' кН·м > допустимого ' + calc.fmt(pm.Madm / 1000, 2) + ' кН·м'); }
    } catch (e) { blocked.push(e.message); }
    if (/угл/.test(ref.sch) && angle === null) addMiss('Углы поворота линии на угловых опорах', p.mark + ' ' + row.nums);
    row.reasons = row.reasons.concat(blocked);
    if (angleSuspect && row.status === 'exceed') row.status = 'blocked';
    if (row.status !== 'exceed') row.status = (blocked.length || angleSuspect) ? 'blocked' : 'ok';
    /* габаритный пролёт */
    var over = recs.filter(function (x) { return num(x.span_next_m) !== null && ref.lgab && num(x.span_next_m) > ref.lgab; });
    if (over.length) row.warns.push('пролёт ' + over.map(function (x) { return x.span_next_m; }).join(', ') + ' м больше габаритного ' + ref.lgab + ' м — развилка: полный расчёт / промежуточная опора (Е.1) / обход');
    res.summary[row.status === 'ok' ? 'ok' : row.status]++;
    res.poles.push(row);
  });
  return res;
}

global.PDRD_DESIGN = { inputs: inputs, sections: sections, run: run, wiresFor: wiresFor };
})(typeof window !== 'undefined' ? window : globalThis);
