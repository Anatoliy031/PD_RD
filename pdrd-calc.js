/* PD_RD — расчётное ядро.
   Все функции чистые (без DOM и хранилища). Единицы: м, мм (диаметры, стенка
   гололёда), Н, Н/м, Па, °C, Н·м. Каждая функция возвращает значение и «след» —
   строки с формулой, подставленными числами и ссылкой на пункт; след печатается
   в разделе «Расчёты» тома «Иная документация».
   Нормативные таблицы — ПУЭ, 7-е изд., гл. 2.4, 2.5 (текст сверен 16.09.2026
   по файлу проекта). Ссылки выводятся из реестра PDRD_NORMS. */
(function (global) {
'use strict';

var G = 9.80665;        // ускорение свободного падения для веса, м/с² (стандартное значение)
var G_ICE = 9.8;        // для гололёдной нагрузки — по ПУЭ-7 п. 2.5.53
var RHO_ICE = 0.9;      // г/см³, ПУЭ-7 п. 2.5.46, 2.5.53

function r(x, d) { if (x === null || x === undefined || !isFinite(x)) return '—'; var k = Math.pow(10, d === undefined ? 3 : d); return String(Math.round(x * k) / k).replace('.', ','); }
function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (var i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  return ys[ys.length - 1];
}
function need(obj, keys, where) {
  var miss = keys.filter(function (k) { var v = obj[k]; return v === null || v === undefined || v === '' || (typeof v === 'number' && !isFinite(v)); });
  if (miss.length) { var e = new Error((where ? where + ': ' : '') + 'нет исходных данных — ' + miss.join(', ')); e.missing = miss; e.blocked = true; throw e; }
}

/* ------------------------------------------------------------ климат, ПУЭ-7 */
var ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7 };
var W0_TABLE = [400, 500, 650, 800, 1000, 1250, 1500];     // табл. 2.5.1, Па
var B_TABLE = [10, 15, 20, 25, 30, 35, 40];                // табл. 2.5.3, мм

function w0ByRegion(reg) {
  var n = ROMAN[String(reg || '').trim().toUpperCase()];
  if (!n) return null;
  return W0_TABLE[n - 1];
}
function bByRegion(reg) {
  var n = ROMAN[String(reg || '').trim().toUpperCase()];
  if (!n) return null;
  return B_TABLE[n - 1];
}
function regionNum(reg) { return ROMAN[String(reg || '').trim().toUpperCase()] || null; }

/* Wг — п. 2.5.43 */
function windIce(W0, kv) {
  var w = 0.25 * W0, trace = ['Wг = 0,25·W0 = 0,25·' + r(W0, 0) + ' = ' + r(w, 1) + ' Па (ПУЭ-7, п. 2.5.43)'];
  var steps = [80, 120, 160, 200, 240, 280, 320, 360], up = null;
  if (w <= 360) { for (var i = 0; i < steps.length; i++) if (w <= steps[i]) { up = steps[i]; break; } }
  else up = Math.round(w / 40) * 40;
  trace.push('округление до ' + up + ' Па');
  var min = kv <= 20 ? 200 : (kv >= 330 ? 160 : 0);
  if (up < min) { trace.push('для ВЛ ' + (kv <= 20 ? 'до 20 кВ' : '330–750 кВ') + ' не менее ' + min + ' Па → ' + min + ' Па'); up = min; }
  return { value: up, trace: trace };
}

/* Kw — табл. 2.5.2 */
var KW_H = [15, 20, 40, 60, 80, 100, 150, 200, 250, 300, 350];
var KW = {
  A: [1.00, 1.25, 1.50, 1.70, 1.85, 2.00, 2.25, 2.45, 2.65, 2.75, 2.75],
  B: [0.65, 0.85, 1.10, 1.30, 1.45, 1.60, 1.90, 2.10, 2.30, 2.50, 2.75],
  C: [0.40, 0.55, 0.80, 1.00, 1.15, 1.25, 1.55, 1.80, 2.00, 2.20, 2.35]
};
function kw(h, terrain) {
  var t = String(terrain || '').trim().toUpperCase().replace('А', 'A').replace('В', 'B').replace('С', 'C');
  if (!KW[t]) { var e = new Error('тип местности не задан (A, B или C по ПУЭ-7, п. 2.5.6)'); e.blocked = true; throw e; }
  return interp(KW_H, KW[t], h);
}
/* αw — п. 2.5.52 */
function alphaW(W) { return interp([200, 240, 280, 300, 320, 360, 400, 500, 580], [1, 0.94, 0.88, 0.85, 0.83, 0.80, 0.76, 0.71, 0.70], W); }
/* Kl — п. 2.5.52; для ВЛ до 1 кВ K1 = 1,0 (п. 2.4.11) */
function kl(L, kv) { if (kv <= 1) return 1.0; return interp([50, 100, 150, 250], [1.2, 1.1, 1.05, 1.0], L); }
/* Ki, Kd — п. 2.5.49, табл. 2.5.4: при высоте до 25 м поправки не вводятся */
function kiKd(h, d) {
  if (h <= 25) return { ki: 1, kd: 1, note: 'h ≤ 25 м — поправки Ki, Kd не вводятся (ПУЭ-7, п. 2.5.49)' };
  return { ki: interp([25, 30, 50, 70, 100], [1.0, 1.4, 1.6, 1.8, 2.0], h),
           kd: interp([10, 20, 30, 50, 70], [1.0, 0.9, 0.8, 0.7, 0.6], d), note: 'табл. 2.5.4' };
}
/* Cx — п. 2.5.52; для СИП на ВЛ до 1 кВ — 1,1 (п. 2.4.11) */
function cx(d, iced, kv, isSip) {
  if (kv <= 1 && isSip) return 1.1;
  if (iced) return 1.2;
  return d >= 20 ? 1.1 : 1.2;
}

/* Коэффициенты надёжности.
   purpose: 'wire' — механический расчёт провода/кабеля (пп. 2.5.54, 2.5.55);
            'support1' / 'support2' — нагрузки на опоры по I / II группе
            предельных состояний (пп. 2.5.62, 2.5.65, 2.5.69, 2.5.70).
   Для ВЛ до 1 кВ с ОКСН: γnw = 1,0, γnг = 1,2, γp = 1,0 (п. 2.4.11). */
function gammas(o) {
  var kv = o.kv, multi = !!o.multi, iceN = regionNum(o.iceRegion) || 1, p = o.purpose || 'wire';
  var g = { gp_w: o.gammaP_w || 1.0, gp_i: o.gammaP_i || 1.0, refs: [] };
  if (kv <= 1) {
    if (o.oksn !== false || multi) { g.gnw = 1.0; g.gng = 1.2; g.refs.push('γnw = 1,0; γnг = 1,2 — ВЛ до 1 кВ с ОКСН (ПУЭ-7, п. 2.4.11)'); }
    else { g.gnw = 0.8; g.gng = 0.8; g.refs.push('γnw = γnг = 0,8 — одноцепная ВЛ до 1 кВ (ПУЭ-7, п. 2.4.11)'); }
    g.gp_w = 1.0; g.gp_i = 1.0;
  } else {
    g.gnw = multi ? 1.1 : 1.0; g.gng = multi ? 1.3 : 1.0;
    g.refs.push('γnw = ' + r(g.gnw, 1) + ', γnг = ' + r(g.gng, 1) + (multi ? ' — многоцепные опоры' : ' — одноцепная ВЛ до 220 кВ') + ' (ПУЭ-7, пп. 2.5.54, 2.5.55)');
  }
  g.gf_i = iceN <= 2 ? 1.3 : 1.6;
  if (p === 'wire') {
    g.gf_w = 1.1; g.gd = 0.5; g.gf_g = 1.0; g.gf_t = 1.0;
    g.refs.push('γf ветер = 1,1 (п. 2.5.54); γf гололёд = ' + r(g.gf_i, 1) + ', γd = 0,5 (п. 2.5.55)');
  } else {
    var first = p === 'support1';
    g.gf_w = first ? 1.3 : 1.1; g.gd = first ? 1.0 : 0.5; g.gf_g = 1.05; g.gf_t = first ? 1.3 : 1.0;
    g.refs.push('опоры, ' + (first ? 'I' : 'II') + ' группа: γf ветер = ' + r(g.gf_w, 1) + ' (п. 2.5.62); γf гололёд = ' + r(g.gf_i, 1) + ', γd = ' + r(g.gd, 1) + ' (п. 2.5.65); γf вес = 1,05 (п. 2.5.69); γf тяжение = ' + r(g.gf_t, 1) + ' (п. 2.5.70)');
  }
  return g;
}

/* Погонные нагрузки на провод или кабель.
   el: { d_mm, mass_kg_km, isSip }
   c : { W0, bE, terrain, kv, iceRegion, multi, h, L, purpose, oksn } */
function loads(el, c) {
  need(el, ['d_mm', 'mass_kg_km'], 'кабель/провод');
  need(c, ['W0', 'bE', 'terrain', 'kv', 'h', 'L'], 'климат');
  var t = [], d = el.d_mm, b = c.bE, gm = gammas(c);
  var k = kiKd(c.h, d), KW_ = kw(c.h, c.terrain), KL = kl(c.L, c.kv);
  var p1n = el.mass_kg_km / 1000 * G;
  var p1 = p1n * gm.gf_g;
  t.push('Вес: p1 = m·g' + (gm.gf_g !== 1 ? '·γf' : '') + ' = ' + r(el.mass_kg_km / 1000, 4) + '·' + r(G, 5) + (gm.gf_g !== 1 ? '·' + r(gm.gf_g, 2) : '') + ' = ' + r(p1) + ' Н/м' + (gm.gf_g !== 1 ? ' (ПУЭ-7, п. 2.5.69)' : ''));
  var kb = k.ki * k.kd * b;
  var p2n = Math.PI * kb * (d + kb) * RHO_ICE * G_ICE * 1e-3;
  t.push('Гололёд нормативный: Pг = π·Ki·Kd·bэ·(d + Ki·Kd·bэ)·ρ·g·10⁻³ = π·' + r(kb, 2) + '·(' + r(d, 2) + ' + ' + r(kb, 2) + ')·0,9·9,8·10⁻³ = ' + r(p2n) + ' Н/м (ПУЭ-7, п. 2.5.53; ' + k.note + ')');
  var p2 = p2n * gm.gng * gm.gp_i * gm.gf_i * gm.gd;
  t.push('Гололёд расчётный: p2 = Pг·γnг·γp·γf·γd = ' + r(p2n) + '·' + r(gm.gng, 2) + '·' + r(gm.gp_i, 2) + '·' + r(gm.gf_i, 2) + '·' + r(gm.gd, 2) + ' = ' + r(p2) + ' Н/м');
  var p3 = p1 + p2;
  t.push('Вес с гололёдом: p3 = p1 + p2 = ' + r(p3) + ' Н/м');
  /* ветер без гололёда */
  var W = c.W0, aw = alphaW(W), cx0 = cx(d, false, c.kv, el.isSip);
  var p4n = aw * KL * KW_ * cx0 * W * d * 1e-3;
  var p4 = p4n * gm.gnw * gm.gp_w * gm.gf_w;
  t.push('Ветер без гололёда: P = αw·Kl·Kw·Cx·W·d·10⁻³ = ' + r(aw, 3) + '·' + r(KL, 3) + '·' + r(KW_, 3) + '·' + r(cx0, 2) + '·' + r(W, 0) + '·' + r(d, 2) + '·10⁻³ = ' + r(p4n) + ' Н/м; расчётная p4 = P·γnw·γp·γf = ' + r(p4) + ' Н/м (ПУЭ-7, пп. 2.5.52, 2.5.54' + (c.kv <= 1 ? ', 2.4.11' : '') + ')');
  /* ветер при гололёде */
  var wi = windIce(W, c.kv), Wg = wi.value, by = b;   // by = bэ при отсутствии региональных карт (п. 2.5.48)
  var aw2 = alphaW(Wg), cx1 = cx(d, true, c.kv, el.isSip);
  var dF = d + 2 * k.ki * k.kd * by;
  var p5n = aw2 * KL * KW_ * cx1 * Wg * dF * 1e-3;
  var p5 = p5n * gm.gnw * gm.gp_w * gm.gf_w;
  t.push(wi.trace.join('; '));
  t.push('Ветер при гололёде (by = bэ, п. 2.5.48): P = ' + r(aw2, 3) + '·' + r(KL, 3) + '·' + r(KW_, 3) + '·' + r(cx1, 2) + '·' + r(Wg, 0) + '·(' + r(d, 2) + ' + 2·' + r(k.ki * k.kd * by, 2) + ')·10⁻³ = ' + r(p5n) + ' Н/м; расчётная p5 = ' + r(p5) + ' Н/м');
  var p6 = Math.sqrt(p1 * p1 + p4 * p4), p7 = Math.sqrt(p3 * p3 + p5 * p5);
  t.push('Результирующие: p6 = √(p1² + p4²) = ' + r(p6) + ' Н/м; p7 = √(p3² + p5²) = ' + r(p7) + ' Н/м');
  t = t.concat(gm.refs);
  return { p1: p1, p1n: p1n, p2: p2, p2n: p2n, p3: p3, p4: p4, p4n: p4n, p5: p5, p5n: p5n, p6: p6, p7: p7,
           Wg: Wg, kw: KW_, kl: KL, gammas: gm, trace: t };
}

/* Режимы нормального режима (п. 2.5.71) и температуры (п. 2.5.51) */
function regimes(clim, L) {
  need(clim, ['tMax', 'tMin', 'tAvg'], 'климат (температуры по СП 131.13330.2020)');
  var tW = clim.tAvg <= -5 ? -10 : -5, tI = clim.tAvg <= -5 ? -10 : -5;
  if (clim.altitude > 2000) tI = -15; else if (clim.altitude > 1000) tI = -10;
  return [
    { id: 'tmax', name: 'Высшая температура', t: clim.tMax, load: 'p1', ref: 'п. 2.5.71, 1' },
    { id: 'tmin', name: 'Низшая температура', t: clim.tMin, load: 'p1', ref: 'п. 2.5.71, 2' },
    { id: 'tavg', name: 'Среднегодовая температура', t: clim.tAvg, load: 'p1', ref: 'п. 2.5.71, 3' },
    { id: 'ice', name: 'Гололёд без ветра', t: tI, load: 'p3', ref: 'п. 2.5.71, 4' },
    { id: 'wind', name: 'Ветер без гололёда', t: tW, load: 'p6', ref: 'п. 2.5.71, 5' },
    { id: 'icewind', name: 'Гололёд с ветром', t: tI, load: 'p7', ref: 'п. 2.5.71, 6' }
  ];
}

/* ------------------------------------------------------------ уравнение состояния
   Пологая нить (параболическая аппроксимация), горизонтальное тяжение H:
     H2 − EA·g2²·L²/(24·H2²) = H1 − EA·g1²·L²/(24·H1²) − EA·α·(t2 − t1)
   Для пролётов с перепадом используется длина пролёта по горизонтали; при
   |Δh|/L > 0,1 результат помечается как требующий уточнённого расчёта. */
function stateEq(p) {
  need(p, ['EA', 'alpha', 'L', 'g1', 'H1', 't1', 'g2', 't2'], 'уравнение состояния');
  var A = p.H1 - p.EA * p.g1 * p.g1 * p.L * p.L / (24 * p.H1 * p.H1) - p.EA * p.alpha * (p.t2 - p.t1);
  var B = p.EA * p.g2 * p.g2 * p.L * p.L / 24;
  /* H³ − A·H² − B = 0 — единственный положительный корень */
  var H = Math.max(A, Math.cbrt(B), 1e-6);
  for (var i = 0; i < 200; i++) {
    var f = H * H * H - A * H * H - B, df = 3 * H * H - 2 * A * H;
    var nH = H - f / df;
    if (!(nH > 0)) nH = H / 2;
    if (Math.abs(nH - H) < 1e-9 * Math.max(1, H)) { H = nH; break; }
    H = nH;
  }
  return H;
}
function sag(g, L, H) { return g * L * L / (8 * H); }
/* Полное тяжение в точке подвеса (больший из концов при перепаде Δh) */
function tensionMax(g, L, H, dh) {
  var f = sag(g, L, H), y = Math.abs(dh || 0);
  /* высота нижней точки относительно верхней опоры: для параболы x0 = L/2 + H·dh/(g·L) */
  var sMax = g * (L / 2 + H * y / (g * L));
  return Math.sqrt(H * H + sMax * sMax) + 0 * f;
}
function rulingSpan(ls) {
  var s1 = 0, s3 = 0;
  ls.forEach(function (l) { s1 += l; s3 += l * l * l; });
  return s1 > 0 ? Math.sqrt(s3 / s1) : null;
}

/* Подбор исходного состояния кабеля для анкерного участка.
   cab: { EA, alpha, T_max (допустимая растягивающая нагрузка в наиболее тяжёлом
          режиме, Н), T_avg (допустимая при среднегодовой температуре, Н, необяз.),
          H_install_avg (заданное проектом тяжение при tсг, необяз.) }
   ld : результат loads(); reg: regimes(); L — приведённый пролёт */
function solveSection(cab, ld, reg, L) {
  need(cab, ['EA', 'alpha', 'T_max'], 'паспорт кабеля');
  var gOf = function (x) { return ld[x.load]; };
  var avg = reg.filter(function (x) { return x.id === 'tavg'; })[0];
  function all(H0) {
    return reg.map(function (x) {
      var H = stateEq({ EA: cab.EA, alpha: cab.alpha, L: L, g1: ld.p1, H1: H0, t1: avg.t, g2: gOf(x), t2: x.t });
      var T = tensionMax(gOf(x), L, H, 0);
      var lim = x.id === 'tavg' && cab.T_avg ? cab.T_avg : cab.T_max;
      return { id: x.id, name: x.name, t: x.t, g: gOf(x), H: H, T: T, f: sag(gOf(x), L, H), limit: lim, ratio: T / lim, ref: x.ref };
    });
  }
  var H0, mode;
  if (cab.H_install_avg) { H0 = cab.H_install_avg; mode = 'задано проектом'; }
  else {
    var lo = 1, hi = cab.T_max;
    for (var i = 0; i < 80; i++) {
      var mid = (lo + hi) / 2;
      var mx = Math.max.apply(null, all(mid).map(function (x) { return x.ratio; }));
      if (mx > 1) hi = mid; else lo = mid;
    }
    H0 = lo; mode = 'по наиболее нагруженному режиму';
  }
  var res = all(H0);
  var gov = res.reduce(function (a, x) { return x.ratio > a.ratio ? x : a; });
  var fmax = res.reduce(function (a, x) { return x.f > a.f ? x : a; });
  return { L: L, H0: H0, mode: mode, regimes: res, governing: gov, maxSag: fmax,
           ok: gov.ratio <= 1 + 1e-9,
           trace: ['Приведённый пролёт Lпр = ' + r(L, 1) + ' м',
                   'Тяжение при среднегодовой температуре H0 = ' + r(H0 / 1000, 3) + ' кН (' + mode + ')',
                   'Определяющий режим — ' + gov.name + ': T = ' + r(gov.T / 1000, 3) + ' кН при допустимом ' + r(gov.limit / 1000, 3) + ' кН (' + r(gov.ratio * 100, 1) + ' %)',
                   'Наибольшая стрела — ' + fmax.name + ': f = ' + r(fmax.f, 2) + ' м'] };
}

/* Монтажная таблица: горизонтальное тяжение одно на анкерный участок, стрелы — по каждому пролёту */
function montageTable(cab, ld, sec, spans, tFrom, tTo, step) {
  step = step || 5;
  var avgT = sec.regimes.filter(function (x) { return x.id === 'tavg'; })[0].t;
  var rows = [];
  for (var t = tFrom; t <= tTo + 1e-9; t += step) {
    var H = stateEq({ EA: cab.EA, alpha: cab.alpha, L: sec.L, g1: ld.p1, H1: sec.H0, t1: avgT, g2: ld.p1, t2: t });
    rows.push({ t: t, H: H, sags: spans.map(function (l) { return sag(ld.p1, l, H); }) });
  }
  return rows;
}

/* Габарит до земли в пролёте (земля принята на уровне оснований опор).
   hA, hB — высоты подвеса над землёй, f — стрела в середине пролёта. */
function groundClearance(hA, hB, f, L) {
  var best = Infinity, xb = 0;
  for (var i = 0; i <= 200; i++) {
    var x = L * i / 200;
    var chord = hA + (hB - hA) * x / L;
    var y = chord - 4 * f * x * (L - x) / (L * L);
    if (y < best) { best = y; xb = x; }
  }
  return { min: best, x: xb };
}

/* Расстояние провод — кабель по вертикали в пролёте при одинаковых условиях.
   w, c: { hA, hB, f } — провод выше кабеля. Возвращает наименьшее расстояние. */
function spanDistance(w, c, L) {
  var best = Infinity, xb = 0;
  for (var i = 0; i <= 200; i++) {
    var x = L * i / 200, s = 4 * x * (L - x) / (L * L);
    var yw = w.hA + (w.hB - w.hA) * x / L - w.f * s;
    var yc = c.hA + (c.hB - c.hA) * x / L - c.f * s;
    var dd = yw - yc;
    if (dd < best) { best = dd; xb = x; }
  }
  return { min: best, x: xb };
}

/* ------------------------------------------------------------ компоновка на опоре
   items: [{ name, h (м), owner, kind: 'wire'|'cable'|'element' }] — занятые отметки;
   Возвращает допустимый интервал высот для нового кабеля с учётом
   расстояния до проводов (normWire), между креплениями (0,3 м) и габарита. */
function freeIntervals(o) {
  need(o, ['topLimit', 'normWire', 'fixDist', 'hMinCable'], 'компоновка');
  var lo = o.hMinCable, hi = Infinity, t = [];
  (o.items || []).forEach(function (it) {
    if (it.kind === 'wire') { hi = Math.min(hi, it.h - o.normWire); t.push(it.name + ' на ' + r(it.h, 2) + ' м → не выше ' + r(it.h - o.normWire, 2) + ' м'); }
  });
  hi = Math.min(hi, o.topLimit);
  var busy = (o.items || []).filter(function (it) { return it.kind !== 'wire'; })
    .map(function (it) { return [it.h - o.fixDist, it.h + o.fixDist, it.name]; })
    .sort(function (a, b) { return a[0] - b[0]; });
  var free = [], cur = lo;
  busy.forEach(function (b) {
    if (b[0] > cur) free.push([cur, Math.min(b[0], hi)]);
    cur = Math.max(cur, b[1]);
    t.push(b[2] + ' занимает ' + r(b[0], 2) + '…' + r(b[1], 2) + ' м');
  });
  if (hi > cur) free.push([cur, hi]);
  free = free.filter(function (x) { return x[1] - x[0] > 1e-6; });
  return { free: free, lo: lo, hi: hi, trace: t };
}

/* ------------------------------------------------------------ нагрузка на опору
   pole: { mark, scheme, m_adm (кН·м), kState (1 или 0,8), angle (°), windSpan (м),
           stand: { width_m, height_m } | null }
   items: [{ name, h, pw (Н/м, ветер на опору), n (шт.), T (Н, расчётное тяжение
           для схемы с тяжением) }] */
function poleMoment(pole, items, clim) {
  need(pole, ['m_adm', 'scheme'], 'опора ' + (pole.mark || ''));
  var t = [], M = 0, blocks = [];
  var sch = String(pole.scheme);
  var tens = /анкер|углов|концев|ответвит/.test(sch);
  var share = 0, shareTxt = '';
  if (/концев|ответвит/.test(sch)) { share = 1; shareTxt = 'одностороннее тяжение (' + sch + ')'; }
  else if (/углов/.test(sch)) {
    if (!(pole.angle > 0)) blocks.push('угол поворота линии не задан');
    else { share = 2 * Math.sin(pole.angle * Math.PI / 360); shareTxt = '2·sin(α/2) = 2·sin(' + r(pole.angle, 1) + '°/2) = ' + r(share, 3); }
  } else if (/анкер/.test(sch)) { share = 1; shareTxt = 'одностороннее тяжение в монтажном режиме (ПУЭ-7, п. 2.5.74)'; }
  items.forEach(function (it) {
    var n = it.n || 1;
    var span = it.windSpan || pole.windSpan;
    var Fw = it.pw * span * n;
    var mw = Fw * it.h;
    M += mw;
    t.push(it.name + ': ветер ' + r(it.pw, 3) + ' Н/м × ' + r(span, 1) + ' м × ' + n + ' = ' + r(Fw, 1) + ' Н; плечо ' + r(it.h, 2) + ' м → ' + r(mw / 1000, 3) + ' кН·м');
    if (tens) {
      if (it.T === null || it.T === undefined) blocks.push(it.name + ': тяжение не задано');
      else if (share) {
        var mt = it.T * share * n * it.h;
        M += mt;
        t.push(it.name + ': тяжение ' + r(it.T / 1000, 3) + ' кН × ' + r(share, 3) + ' × ' + n + ' × ' + r(it.h, 2) + ' м → ' + r(mt / 1000, 3) + ' кН·м (' + shareTxt + ')');
      }
    }
  });
  if (pole.stand && pole.stand.width_m && pole.stand.height_m && clim) {
    var h = pole.stand.height_m, KWp = kw(h / 2, clim.terrain);
    var Qc = KWp * clim.W0 * (pole.stand.cx || 0.7) * pole.stand.width_m * h;
    var Q = Qc * (1 + (pole.stand.pulse === undefined ? 0.8 : pole.stand.pulse)) * 1.3;
    M += Q * h / 2;
    t.push('Ветер на стойку: Q = Kw·W0·Cx·A·(1 + kп)·γf = ' + r(KWp, 2) + '·' + r(clim.W0, 0) + '·' + r(pole.stand.cx || 0.7, 2) + '·' + r(pole.stand.width_m * h, 2) + '·' + r(1 + (pole.stand.pulse === undefined ? 0.8 : pole.stand.pulse), 1) + '·1,3 = ' + r(Q, 0) + ' Н; плечо ' + r(h / 2, 2) + ' м → ' + r(Q * h / 2000, 3) + ' кН·м (ПУЭ-7, пп. 2.5.59, 2.5.60, 2.5.63)');
  } else {
    blocks.push('геометрия стойки не подтверждена — ветер на стойку не учтён');
  }
  var k = pole.kState === undefined ? 1 : pole.kState;
  var Madm = pole.m_adm * 1000 * k;
  t.push('M = ' + r(M / 1000, 3) + ' кН·м; ' + (k !== 1 ? 'Mдоп·k = ' + r(pole.m_adm, 2) + '·' + r(k, 2) + ' = ' : 'Mдоп = ') + r(Madm / 1000, 3) + ' кН·м');
  var reserve = (Madm - M) / Madm;
  return { M: M, Madm: Madm, reserve: reserve, ok: M <= Madm && !blocks.length, exceeds: M > Madm,
           blocked: blocks, tensioned: tens, trace: t };
}

/* ------------------------------------------------------------ длина кабеля */
function cableLength(o) {
  need(o, ['spansSum', 'sagFactor'], 'длина кабеля');
  var t = [], L = o.spansSum * o.sagFactor;
  t.push('Σ пролётов × k провиса = ' + r(o.spansSum, 1) + ' × ' + r(o.sagFactor, 3) + ' = ' + r(L, 1) + ' м');
  var add = (o.drops || 0) + (o.reserves || 0) + (o.splicing || 0);
  if (add) { L += add; t.push('+ спуски ' + r(o.drops || 0, 1) + ' + запасы ' + r(o.reserves || 0, 1) + ' + разделка ' + r(o.splicing || 0, 1) + ' = ' + r(L, 1) + ' м'); }
  if (o.emergencyShare) { var e = o.spansSum * o.emergencyShare; L += e; t.push('+ аварийный запас ' + r(o.emergencyShare * 100, 1) + ' % протяжённости = ' + r(e, 1) + ' м'); }
  return { value: L, trace: t };
}

global.PDRD_CALC = {
  G: G, interp: interp, w0ByRegion: w0ByRegion, bByRegion: bByRegion, windIce: windIce,
  kw: kw, alphaW: alphaW, kl: kl, kiKd: kiKd, cx: cx, gammas: gammas, loads: loads, regimes: regimes,
  stateEq: stateEq, sag: sag, tensionMax: tensionMax, rulingSpan: rulingSpan, solveSection: solveSection,
  montageTable: montageTable, groundClearance: groundClearance, spanDistance: spanDistance,
  freeIntervals: freeIntervals, poleMoment: poleMoment, cableLength: cableLength, fmt: r
};
})(typeof window !== 'undefined' ? window : globalThis);
