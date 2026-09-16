/* PD_RD — графическая часть.
   Каждый лист описывается набором примитивов в миллиметрах листа (начало —
   левый верхний угол). Из одного описания строятся SVG (просмотр, печать в PDF)
   и DXF (pdrd-dxf.js). Формат листов — А3 горизонтальный, рамка 20/5/5/5 мм,
   основная надпись формы 3 (ГОСТ Р 21.101-2020). */
(function (global) {
'use strict';
var W = 420, H = 297, FL = 20, FO = 5;
var DZ = { x0: FL + 5, y0: FO + 5, x1: W - FO - 5, y1: H - FO - 60 };   // рабочее поле над штампом
var LAYERS = ['РАМКА', 'ШТАМП', 'ВЛ_ОПОРЫ', 'ВЛ_ПРОВОДА', 'ВОЛС', 'МУФТЫ', 'РАЗМЕРЫ', 'ТЕКСТ', 'ПЕРЕСЕЧЕНИЯ'];
var COLORS = { 'РАМКА': '#000', 'ШТАМП': '#000', 'ВЛ_ОПОРЫ': '#333', 'ВЛ_ПРОВОДА': '#8a8a8a', 'ВОЛС': '#0a58a8', 'МУФТЫ': '#c0392b', 'РАЗМЕРЫ': '#555', 'ТЕКСТ': '#000', 'ПЕРЕСЕЧЕНИЯ': '#7a4d00' };
function num(v) { var n = typeof v === 'number' ? v : parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }
function fm(v, d) { if (v === null || v === undefined || !isFinite(v)) return '—'; var k = Math.pow(10, d === undefined ? 1 : d); return String(Math.round(v * k) / k).replace('.', ','); }

function Sheet(meta) { this.meta = meta; this.p = []; }
Sheet.prototype.line = function (x1, y1, x2, y2, layer, w) { this.p.push({ t: 'line', x1: x1, y1: y1, x2: x2, y2: y2, l: layer || 'ТЕКСТ', w: w || 0.25 }); return this; };
Sheet.prototype.rect = function (x, y, w, h, layer, lw) { this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true, layer, lw); return this; };
Sheet.prototype.poly = function (pts, closed, layer, w, dash) { this.p.push({ t: 'poly', pts: pts, c: !!closed, l: layer || 'ТЕКСТ', w: w || 0.25, dash: dash }); return this; };
Sheet.prototype.circle = function (cx, cy, r, layer, fill) { this.p.push({ t: 'circle', cx: cx, cy: cy, r: r, l: layer || 'ТЕКСТ', fill: !!fill }); return this; };
Sheet.prototype.text = function (x, y, s, h, opt) { opt = opt || {}; this.p.push({ t: 'text', x: x, y: y, s: String(s), h: h || 2.5, a: opt.a || 'start', rot: opt.rot || 0, l: opt.l || 'ТЕКСТ', b: !!opt.b }); return this; };

/* Рамка и основная надпись формы 3 */
function frame(sh, info) {
  sh.rect(FL, FO, W - FL - FO, H - 2 * FO, 'РАМКА', 0.7);
  var x = W - FO - 185, y = H - FO - 55, L = 'ШТАМП';
  sh.rect(x, y, 185, 55, L, 0.7);
  var cols = [10, 10, 10, 10, 15, 10], cx = x;
  cols.forEach(function (c) { cx += c; sh.line(cx, y, cx, y + 55, L, cx === x + 65 ? 0.7 : 0.25); });
  for (var i = 1; i < 11; i++) sh.line(x, y + 5 * i, x + 65, y + 5 * i, L, i === 6 ? 0.7 : 0.25);
  ['Изм.', 'Кол.уч', 'Лист', '№ док.', 'Подп.', 'Дата'].forEach(function (t, i) {
    var xx = x + cols.slice(0, i).reduce(function (a, b) { return a + b; }, 0) + cols[i] / 2;
    sh.text(xx, y + 29, t, 1.8, { a: 'middle', l: L });
  });
  var roles = [['Разраб.', info.razrab], ['Пров.', info.prov], ['ГИП', info.gip], ['', ''], ['Н. контр.', info.nkontr]];
  roles.forEach(function (r, i) { sh.text(x + 1, y + 34 + 5 * i, r[0], 1.8, { l: L }); sh.text(x + 21, y + 34 + 5 * i, r[1] || '', 1.8, { l: L }); sh.text(x + 56, y + 34 + 5 * i, r[1] ? info.date || '' : '', 1.5, { l: L }); });
  var rx = x + 65;
  sh.line(rx, y + 10, x + 185, y + 10, L, 0.7); sh.line(rx, y + 25, x + 185, y + 25, L, 0.7); sh.line(rx, y + 40, x + 185, y + 40, L, 0.7);
  sh.line(rx + 70, y + 25, rx + 70, y + 55, L, 0.7);
  sh.line(rx + 70, y + 30, x + 185, y + 30, L, 0.25);
  sh.line(rx + 85, y + 25, rx + 85, y + 40, L, 0.25); sh.line(rx + 100, y + 25, rx + 100, y + 40, L, 0.25);
  sh.text(rx + 60, y + 7, info.code, 4.5, { a: 'middle', l: L, b: true });
  wrap(sh, info.object, rx + 60, y + 15, 2.3, 115, 3, L);
  wrap(sh, info.volume, rx + 35, y + 30, 2.1, 68, 4, L);
  sh.text(rx + 77.5, y + 29, 'Стадия', 1.8, { a: 'middle', l: L }); sh.text(rx + 92.5, y + 29, 'Лист', 1.8, { a: 'middle', l: L }); sh.text(rx + 110, y + 29, 'Листов', 1.8, { a: 'middle', l: L });
  sh.text(rx + 77.5, y + 36.5, info.stage, 3, { a: 'middle', l: L }); sh.text(rx + 92.5, y + 36.5, String(info.sheet), 3, { a: 'middle', l: L }); sh.text(rx + 110, y + 36.5, String(info.sheets || ''), 3, { a: 'middle', l: L });
  wrap(sh, info.title, rx + 35, y + 45, 2.3, 68, 3, L);
  wrap(sh, info.org, rx + 95, y + 45, 2, 48, 4, L);
  if (!info.approved) sh.text(W / 2, H / 2, 'ШИФР НЕ УТВЕРЖДЁН', 14, { a: 'middle', l: 'ТЕКСТ', rot: -20, b: true, wm: true });
  /* дополнительные графы на поле подшивки */
  var gx = 8, gy = H - FO - 85;
  sh.rect(gx, gy, 12, 85, L, 0.7); sh.line(gx + 5, gy, gx + 5, gy + 85, L, 0.25);
  sh.line(gx, gy + 25, gx + 12, gy + 25, L, 0.7); sh.line(gx, gy + 60, gx + 12, gy + 60, L, 0.7);
  [['Взам. инв. №', 12.5], ['Подп. и дата', 42.5], ['Инв. № подл.', 72.5]].forEach(function (g) { sh.text(gx + 3.6, gy + g[1], g[0], 1.8, { a: 'middle', rot: -90, l: L }); });
}
function wrap(sh, s, cx, cy, h, width, maxLines, layer) {
  var words = String(s || '').split(/\s+/), lines = [], cur = '';
  var cw = h * 0.55;
  words.forEach(function (w) { if ((cur + ' ' + w).trim().length * cw > width && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
  if (cur) lines.push(cur);
  lines = lines.slice(0, maxLines);
  var y0 = cy - (lines.length - 1) * h * 0.65;
  lines.forEach(function (l, i) { sh.text(cx, y0 + i * h * 1.3, l, h, { a: 'middle', l: layer }); });
}

/* ---------------------------------------------------------------- геометрия */
function proj(d) {
  var pts = d.poles.filter(function (p) { return p.coords && p.coords.lat !== null && p.coords.lon !== null; });
  if (!pts.length) return null;
  var lat0 = pts.reduce(function (a, p) { return a + p.coords.lat; }, 0) / pts.length;
  var k = Math.cos(lat0 * Math.PI / 180) * 111320, m = 110574;
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  pts.forEach(function (p) { var x = p.coords.lon * k, y = p.coords.lat * m; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
  return { xy: function (p) { return [p.coords.lon * k - minX, maxY - p.coords.lat * m]; }, w: maxX - minX, h: maxY - minY };
}
function segments(d) {
  var byKey = {}, out = [], seen = {};
  d.poles.forEach(function (p) { (p.fromReport || []).forEach(function (r) { byKey[r.line_id + '|' + r.num] = p; }); });
  d.poles.forEach(function (p) {
    (p.fromReport || []).forEach(function (r) {
      [r.next, r.prev].forEach(function (n) {
        var q = n && byKey[r.line_id + '|' + n];
        if (!q || q === p) return;
        var k = p.id < q.id ? p.id + '|' + q.id : q.id + '|' + p.id;
        if (seen[k]) return; seen[k] = 1;
        out.push({ a: p, b: q, line: r.line_id });
      });
    });
  });
  return out;
}
function onRoute(p) { var x = (p.design || {}).decision; return ['place', 'recheck', 'extra', 'after'].indexOf(x) >= 0; }

function northArrow(sh, x, y) { sh.poly([[x, y], [x - 3, y + 10], [x, y + 7], [x + 3, y + 10]], true, 'ТЕКСТ', 0.35); sh.text(x, y - 2, 'С', 3, { a: 'middle' }); }
function scaleBar(sh, x, y, scale) {
  var m = scale / 1000 * 50;     // 50 мм на листе
  sh.line(x, y, x + 50, y, 'РАЗМЕРЫ', 0.35); [0, 25, 50].forEach(function (t) { sh.line(x + t, y - 1.5, x + t, y + 1.5, 'РАЗМЕРЫ', 0.35); });
  sh.text(x, y + 5, '0', 2, { a: 'middle' }); sh.text(x + 50, y + 5, fm(m, 0) + ' м', 2, { a: 'middle' });
  sh.text(x + 25, y - 3, 'М 1:' + scale, 2.5, { a: 'middle' });
}
function legend(sh, x, y) {
  sh.line(x, y, x + 12, y, 'ВЛ_ПРОВОДА', 0.35); sh.text(x + 15, y + 1, 'ВЛ (существующая)', 2.2);
  sh.line(x, y + 6, x + 12, y + 6, 'ВОЛС', 0.9); sh.text(x + 15, y + 7, 'ВОЛС проектируемая', 2.2);
  sh.circle(x + 6, y + 12, 0.8, 'ВЛ_ОПОРЫ', true); sh.text(x + 15, y + 13, 'опора ВЛ', 2.2);
  sh.poly([[x + 6, y + 16.5], [x + 3.5, y + 20.5], [x + 8.5, y + 20.5]], true, 'МУФТЫ', 0.35); sh.text(x + 15, y + 19.5, 'муфта, запас', 2.2);
  sh.circle(x + 6, y + 24, 1.2, 'МУФТЫ', false); sh.text(x + 15, y + 25, 'опора исключена / после восстановления', 2.2);
}

/* ---------------------------------------------------------------- листы */
function sheetPlan(d, base) {
  var pr = proj(d); if (!pr) return [];
  var segs = segments(d), out = [];
  var dw = DZ.x1 - DZ.x0 - 55, dh = DZ.y1 - DZ.y0;
  var scales = [1000, 2000, 5000, 10000, 25000, 50000, 100000];
  var ov = scales.filter(function (s) { return pr.w / s * 1000 <= dw && pr.h / s * 1000 <= dh; })[0] || 100000;
  function draw(sh, s, ox, oy, labels) {
    function P(p) { var q = pr.xy(p); return [DZ.x0 + (q[0] - ox) / s * 1000, DZ.y0 + (q[1] - oy) / s * 1000]; }
    function inside(q) { return q[0] >= DZ.x0 && q[0] <= DZ.x1 - 55 && q[1] >= DZ.y0 && q[1] <= DZ.y1; }
    segs.forEach(function (g) {
      var a = P(g.a), b = P(g.b); if (!inside(a) && !inside(b)) return;
      var on = onRoute(g.a) && onRoute(g.b) && (d.lines.filter(function (l) { return l.id === g.line; })[0] || {}).cable !== false;
      sh.line(a[0], a[1], b[0], b[1], on ? 'ВОЛС' : 'ВЛ_ПРОВОДА', on ? 0.7 : 0.25);
    });
    d.poles.forEach(function (p) {
      if (!p.coords || p.coords.lat === null) return;
      var q = P(p); if (!inside(q)) return;
      var x = p.design || {};
      if (x.sleeve) sh.poly([[q[0], q[1] - 1.8], [q[0] - 1.5, q[1] + 0.9], [q[0] + 1.5, q[1] + 0.9]], true, 'МУФТЫ', 0.35);
      else if (x.decision === 'after' || x.decision === 'bypass' || x.decision === 'exclude') sh.circle(q[0], q[1], 1.2, 'МУФТЫ', false);
      else sh.circle(q[0], q[1], labels ? 0.6 : 0.35, 'ВЛ_ОПОРЫ', true);
      if (labels) sh.text(q[0] + 1, q[1] - 1, (p.lines || []).map(function (l) { return l.num; }).join('/'), 1.4, { l: 'ТЕКСТ' });
    });
    northArrow(sh, DZ.x1 - 20, DZ.y0 + 5); scaleBar(sh, DZ.x1 - 50, DZ.y0 + 30, s); legend(sh, DZ.x1 - 52, DZ.y0 + 45);
  }
  var s0 = new Sheet({ title: 'Ситуационный план трассы (обзорный)', kind: 'plan', scale: ov });
  draw(s0, ov, 0, 0, pr.w / ov * 1000 > 0 && ov <= 2000);
  out.push(s0);
  var det = 2000;
  if (ov > det) {
    var tw = dw / 1000 * det, th = dh / 1000 * det;
    var nx = Math.ceil(pr.w / tw), ny = Math.ceil(pr.h / th), idx = 0;
    var ovs = s0;
    for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
      var ox = i * tw, oy = j * th;
      var any = d.poles.some(function (p) { if (!p.coords || p.coords.lat === null) return false; var q = pr.xy(p); return q[0] >= ox && q[0] < ox + tw && q[1] >= oy && q[1] < oy + th; });
      if (!any) continue;
      idx++;
      /* контур листа на обзорном плане */
      ovs.rect(DZ.x0 + ox / ov * 1000, DZ.y0 + oy / ov * 1000, tw / ov * 1000, th / ov * 1000, 'РАЗМЕРЫ', 0.18);
      ovs.text(DZ.x0 + (ox + tw / 2) / ov * 1000, DZ.y0 + (oy + th / 2) / ov * 1000, 'П' + idx, 2.5, { a: 'middle', l: 'РАЗМЕРЫ' });
      var sh = new Sheet({ title: 'Ситуационный план трассы. Фрагмент П' + idx, kind: 'plan', scale: det });
      draw(sh, det, ox, oy, true);
      out.push(sh);
    }
  }
  return out;
}

/* Элементарные кабельные участки: цепочки между муфтами и концами трассы */
function ekus(d) {
  var S = global.PDRD_SPEC; if (!S) return [];
  var spans = S.cableSpans(d), adj = {};
  spans.forEach(function (s) { (adj[s.from.id] = adj[s.from.id] || []).push({ s: s, to: s.to }); (adj[s.to.id] = adj[s.to.id] || []).push({ s: s, to: s.from }); });
  var byId = {}; d.poles.forEach(function (p) { byId[p.id] = p; });
  function bound(id) { return (adj[id] || []).length !== 2 || (byId[id].design || {}).sleeve; }
  var used = {}, out = [];
  Object.keys(adj).forEach(function (id) {
    if (!bound(id)) return;
    adj[id].forEach(function (e) {
      if (used[e.s.line + e.s.fromNum + e.s.toNum]) return;
      var len = 0, cur = id, ed = e, n = 0, guard = 0;
      while (ed && guard++ < 10000) {
        used[ed.s.line + ed.s.fromNum + ed.s.toNum] = 1; len += ed.s.L; n++; cur = ed.to.id;
        if (bound(cur)) break;
        ed = adj[cur].filter(function (z) { return !used[z.s.line + z.s.fromNum + z.s.toNum]; })[0];
      }
      out.push({ a: byId[id], b: byId[cur], len: len, spans: n });
    });
  });
  return out;
}
function label(p) { return (p.lines || []).map(function (l) { return l.num; }).join('/') + ' ' + (p.mark || ''); }

function sheetSkeleton(d) {
  var list = ekus(d), out = [], per = 24;
  if (!list.length) return [];
  var fib = (d.cable || {}).fibers || '—';
  var k = 1.02, S = global.PDRD_SPEC; if (S) k = S.specParams(d).sagFactor;
  for (var i = 0; i < Math.max(1, list.length); i += per) {
    var sh = new Sheet({ title: 'Схема линейного объекта (скелетная)' + (list.length > per ? ', лист ' + (i / per + 1) : ''), kind: 'skeleton' });
    sh.text(DZ.x0, DZ.y0 + 4, 'Элементарные кабельные участки (ЭКУ): ' + list.length + '; кабель ' + ((d.cable || {}).mark || '') + ', ' + fib + ' ОВ', 3, { b: true });
    list.slice(i, i + per).forEach(function (e, j) {
      var col = j % 2, row = Math.floor(j / 2), x = DZ.x0 + col * 190, y = DZ.y0 + 16 + row * 17;
      var isS = function (p) { return (p.design || {}).sleeve; };
      [[x + 10, e.a], [x + 150, e.b]].forEach(function (z) {
        if (isS(z[1])) sh.poly([[z[0], y - 3], [z[0] - 3, y + 2], [z[0] + 3, y + 2]], true, 'МУФТЫ', 0.35);
        else sh.rect(z[0] - 2.5, y - 2.5, 5, 5, 'ВЛ_ОПОРЫ', 0.35);
        sh.text(z[0], y + 7, label(z[1]).slice(0, 22), 1.8, { a: 'middle' });
      });
      sh.line(x + 13, y, x + 147, y, 'ВОЛС', 0.7);
      sh.text(x + 80, y - 2, 'ЭКУ-' + (i + j + 1) + ': L трассы ' + fm(e.len, 0) + ' м; кабель ' + fm(e.len * k, 0) + ' м; пролётов ' + e.spans + '; ' + fib + ' ОВ', 2, { a: 'middle' });
    });
    out.push(sh);
  }
  return out;
}

function sheetRoute(d) {
  var out = [], perRow = 28, rowsPerSheet = 5;
  var rows = [];
  d.lines.forEach(function (l) {
    if (l.cable === false) return;
    var ps = d.poles.map(function (p) { var r = (p.fromReport || []).filter(function (x) { return x.line_id === l.id; })[0]; return r ? { p: p, r: r } : null; }).filter(Boolean);
    if (!ps.length) return;
    /* порядок по ссылкам «след.» от начальной опоры */
    var idx = {}; ps.forEach(function (x) { idx[x.r.num] = x; });
    var start = ps.filter(function (x) { return !x.r.prev || !idx[x.r.prev]; })[0] || ps[0], seq = [], seen = {};
    var cur = start;
    while (cur && !seen[cur.r.num]) { seq.push(cur); seen[cur.r.num] = 1; cur = cur.r.next ? idx[cur.r.next] : null; }
    ps.forEach(function (x) { if (!seen[x.r.num]) seq.push(x); });
    for (var i = 0; i < seq.length; i += perRow) rows.push({ line: l, items: seq.slice(i, i + perRow), part: i / perRow + 1 });
  });
  for (var s = 0; s < rows.length; s += rowsPerSheet) {
    var sh = new Sheet({ title: 'Схема размещения ОК на опорах ВЛ, лист ' + (s / rowsPerSheet + 1), kind: 'route' });
    rows.slice(s, s + rowsPerSheet).forEach(function (row, j) {
      var y = DZ.y0 + 10 + j * 45, x0 = DZ.x0 + 5, step = (DZ.x1 - DZ.x0 - 10) / perRow;
      sh.text(x0, y - 4, row.line.name.slice(0, 90) + (row.part > 1 ? ' (продолжение)' : '') + ', ' + fm(row.line.kv, 1) + ' кВ', 2.5, { b: true });
      sh.line(x0, y + 6, x0 + step * (row.items.length - 1), y + 6, 'ВЛ_ПРОВОДА', 0.25);
      row.items.forEach(function (it, k) {
        var x = x0 + k * step, des = it.p.design || {};
        sh.line(x, y + 2, x, y + 14, 'ВЛ_ОПОРЫ', 0.5);
        sh.text(x, y + 18, it.r.num, 1.8, { a: 'middle' });
        sh.text(x, y + 21, it.r.mark || '—', 1.4, { a: 'middle' });
        var code = { place: des.node || '', recheck: (des.node || '') + '*', extra: 'Е1', after: 'В', bypass: '—', exclude: '×' }[des.decision] || '?';
        sh.text(x, y + 24.5, code, 1.6, { a: 'middle', l: des.decision === 'place' ? 'ТЕКСТ' : 'МУФТЫ' });
        if (des.h_m) sh.text(x, y + 27.5, fm(des.h_m, 2), 1.4, { a: 'middle', l: 'РАЗМЕРЫ' });
        if (des.sleeve) sh.poly([[x, y + 30], [x - 1.5, y + 33], [x + 1.5, y + 33]], true, 'МУФТЫ', 0.35);
        if (k < row.items.length - 1) {
          var nx = row.items[k + 1], on = onRoute(it.p) && onRoute(nx.p);
          if (on) sh.line(x, y + 9, x + step, y + 9, 'ВОЛС', 0.7);
          if (num(it.r.span_next_m)) sh.text(x + step / 2, y + 5, fm(num(it.r.span_next_m), 0), 1.4, { a: 'middle', l: 'РАЗМЕРЫ' });
        }
      });
    });
    sh.text(DZ.x0, DZ.y1 - 2, 'Обозначения: П, ПУ, А1, А2, АО, С — узлы крепления; * — после поверочного расчёта; Е1 — дополнительная опора; В — после восстановления владельцем; ▲ — муфта; числа под узлом — высота подвеса, м; над линией — длина пролёта, м.', 2);
    out.push(sh);
  }
  return out;
}

function sheetLayout(d) {
  var N = global.PDRD_NORMS, by = {};
  d.poles.forEach(function (p) { if (onRoute(p) && p.design.h_m) { var k = p.mark; (by[k] = by[k] || []).push(p); } });
  var marks = Object.keys(by), out = [], per = 6;
  if (!marks.length) return [];
  for (var i = 0; i < Math.max(1, marks.length); i += per) {
    var sh = new Sheet({ title: 'Компоновка элементов на опорах', kind: 'layout' });
    marks.slice(i, i + per).forEach(function (m, j) {
      var x = DZ.x0 + 15 + j * 62, base = DZ.y1 - 25, sc = 16;   // 1 м = 16 мм
      var ps = by[m], p = ps[0], R = global.PDRD_REFS_V25, ref = R ? R.poleByMark(m) : null;
      var hs = ps.map(function (q) { return q.design.h_m; }).sort(function (a, b) { return a - b; });
      var hc = hs[Math.floor(hs.length / 2)];
      var standH = ref && ref.h ? ref.h + 1 : 9;
      sh.line(x - 20, base, x + 30, base, 'РАЗМЕРЫ', 0.5); sh.text(x + 30, base + 3, '±0,000', 1.6, { a: 'end' });
      sh.rect(x - 1.5, base - standH * sc, 3, standH * sc, 'ВЛ_ОПОРЫ', 0.5);
      var wires = [];
      (p.fromReport || []).forEach(function (r) { ((d.wiresByKv || {})[String(r.kv).replace('.', ',')] || []).forEach(function (w) { wires.push({ w: w, kv: r.kv }); }); });
      wires.forEach(function (x2) {
        var h = num(x2.w.h_m) || (ref ? ref.h : null); if (!h) return;
        sh.line(x - 12, base - h * sc, x + 12, base - h * sc, 'ВЛ_ПРОВОДА', 0.35); sh.circle(x + 12, base - h * sc, 1, 'ВЛ_ПРОВОДА', true);
        sh.text(x + 14, base - h * sc + 1, x2.w.mark + ' ' + fm(h, 2) + ' м', 1.6);
        var dn = N.wireDistance(x2.kv, x2.w.mark);
        if (dn.value) {
          sh.line(x - 16, base - h * sc, x - 16, base - hc * sc, 'РАЗМЕРЫ', 0.18);
          sh.text(x - 17, base - (h + hc) / 2 * sc, '≥' + fm(dn.value, 2), 1.6, { a: 'end', l: 'РАЗМЕРЫ' });
        }
      });
      sh.line(x + 1.5, base - hc * sc, x + 8, base - hc * sc, 'ВОЛС', 0.5); sh.circle(x + 8, base - hc * sc, 1, 'ВОЛС', true);
      sh.text(x + 10, base - hc * sc + 1, 'ОК ' + fm(hc, 2) + ' м', 1.8, { l: 'ВОЛС' });
      sh.text(x + 10, base - hc * sc + 4, 'до элементов ≥' + fm(N.val('tt.dist.element').value, 2) + ' м', 1.4, { l: 'РАЗМЕРЫ' });
      var g = N.val('tt.dist.ground').value;
      sh.poly([[x - 20, base - g * sc], [x + 30, base - g * sc]], false, 'РАЗМЕРЫ', 0.18, true);
      sh.text(x - 20, base - g * sc - 1, 'габарит ' + fm(g, 1) + ' м при наиб. стреле', 1.4, { l: 'РАЗМЕРЫ' });
      sh.text(x, base + 8, m, 3, { a: 'middle', b: true });
      sh.text(x, base + 12, (ref ? ref.type : '') + ', опор: ' + ps.length, 1.8, { a: 'middle' });
      sh.text(x, base + 15, 'высота ОК: ' + fm(hs[0], 2) + '…' + fm(hs[hs.length - 1], 2) + ' м', 1.6, { a: 'middle' });
    });
    sh.text(DZ.x0, DZ.y0 + 3, 'Расстояния — ТТ № 282р, пп. 3.2.2–3.2.6; ПУЭ-7, пп. 2.4.89, 2.5.197. Показана медианная высота подвеса ОК для марки; высоты по каждой опоре — в ведомости опор.', 2.2);
    out.push(sh);
  }
  return out;
}

function sheetNodes(d) {
  var X = global.PDRD_DECIDE, S = global.PDRD_SPEC, tt = X.totals(d), sh = new Sheet({ title: 'Узлы крепления кабеля (типовые)', kind: 'nodes' });
  var codes = Object.keys(X.NODES).filter(function (k) { return tt.nodes[k]; });
  if (!codes.length) return [];
  codes.forEach(function (c, j) {
    var x = DZ.x0 + 20 + (j % 3) * 120, y = DZ.y0 + 20 + Math.floor(j / 3) * 100;
    sh.rect(x - 3, y, 6, 50, 'ВЛ_ОПОРЫ', 0.5);
    sh.rect(x + 3, y + 22, 6, 6, 'ВОЛС', 0.35);
    var ends = /А2|С/.test(c) ? [-1, 1] : (/А1/.test(c) ? [1] : (/АО/.test(c) ? [-1, 1, 2] : [0]));
    ends.forEach(function (e) {
      if (e === 0) sh.line(x - 30, y + 25, x + 40, y + 25, 'ВОЛС', 0.7);
      else if (e === 2) { sh.line(x + 9, y + 25, x + 30, y + 40, 'ВОЛС', 0.7); sh.text(x + 31, y + 42, 'ответвление', 1.8); }
      else { var x2 = e < 0 ? x - 30 : x + 40; sh.line(e < 0 ? x - 3 : x + 9, y + 25, x2, y + 25, 'ВОЛС', 0.7); sh.poly([[x2 - 4 * e, y + 23], [x2, y + 25], [x2 - 4 * e, y + 27]], false, 'ВОЛС', 0.35); }
    });
    if (c === 'С') { sh.poly([[x + 6, y + 32], [x + 2, y + 40], [x + 10, y + 40]], true, 'МУФТЫ', 0.35); sh.circle(x + 6, y + 46, 3, 'МУФТЫ', false); sh.text(x + 12, y + 46, 'запас', 1.8); }
    sh.text(x, y - 4, c + ' — ' + X.NODES[c], 2.2, { a: 'middle', b: true });
    var kit = (S.NODE_KIT[c] || []).map(function (k) { return k[0] + ' — ' + k[1] + ' шт.'; }).concat(['Кронштейн (бандаж) крепления — 1 компл.', 'Бирка — 1 шт.']);
    kit.forEach(function (t, i) { sh.text(x - 30, y + 58 + i * 3.5, t, 1.8); });
    sh.text(x - 30, y + 58 + kit.length * 3.5, 'Узлов в проекте: ' + tt.nodes[c], 1.8, { b: true });
  });
  sh.text(DZ.x0, DZ.y1 - 6, 'Арматура — заводского исполнения по ГОСТ Р 51177-2017 с паспортами и сертификатами (декларациями); марки — по утверждённому каталогу. Прочность заделки в натяжном зажиме — не менее 90 % разрывной прочности кабеля (ТТ № 282р, п. 3.3).', 2.2);
  return [sh];
}

function sheetMontage(d) {
  var D = global.PDRD_DESIGN, C = global.PDRD_CALC, res = d.calcResult;
  if (!D || !C || !res) return [];
  var inp = D.inputs(d); if (inp.miss.length) return [];
  var secs = D.sections(d), out = [], sh = null, y = 0, colW = 22;
  var reg; try { reg = C.regimes({ tMax: inp.tMax, tMin: inp.tMin, tAvg: inp.tAvg, altitude: inp.altitude }); } catch (e) { return []; }
  secs.forEach(function (s) {
    var ld, sol;
    try {
      ld = C.loads({ d_mm: inp.cab.d_mm, mass_kg_km: inp.cab.mass_kg_km }, { W0: inp.W0, bE: inp.bE, terrain: inp.terrain, kv: s.kv, iceRegion: inp.iceRegion, h: inp.cableH, L: s.Lr, purpose: 'wire' });
      sol = C.solveSection(inp.cab, ld, reg, s.Lr);
    } catch (e) { return; }
    var spans = s.spans.slice(0, 12), temps = [];
    for (var t = Math.ceil(inp.tMin / 10) * 10; t <= inp.tMax; t += 10) temps.push(t);
    var mt = C.montageTable(inp.cab, ld, sol, spans.map(function (x) { return x.L; }), temps[0], temps[temps.length - 1], 10);
    var need = 10 + (spans.length + 1) * 4;
    if (!sh || y + need > DZ.y1) { sh = new Sheet({ title: 'Монтажные таблицы стрел провеса и тяжений', kind: 'montage' }); out.push(sh); y = DZ.y0 + 4; }
    sh.text(DZ.x0, y, s.id + ' — ' + s.line.slice(0, 70) + '; Lпр ' + fm(s.Lr, 1) + ' м', 2.3, { b: true });
    y += 4;
    var x0 = DZ.x0, w0 = 38;
    sh.text(x0, y + 3, 'Пролёт / t, °C', 1.8);
    temps.forEach(function (tv, i) { sh.text(x0 + w0 + i * colW + colW / 2, y + 3, String(tv), 1.8, { a: 'middle' }); });
    sh.line(x0, y + 4, x0 + w0 + temps.length * colW, y + 4, 'РАЗМЕРЫ', 0.18);
    y += 4;
    sh.text(x0, y + 3, 'Тяжение H, кН', 1.8);
    mt.forEach(function (r, i) { sh.text(x0 + w0 + i * colW + colW / 2, y + 3, fm(r.H / 1000, 3), 1.8, { a: 'middle' }); });
    y += 4;
    spans.forEach(function (sp, k) {
      sh.text(x0, y + 3, sp.from.rec.num + '–' + sp.to.rec.num + ' (' + fm(sp.L, 0) + ' м), f, м', 1.8);
      mt.forEach(function (r, i) { sh.text(x0 + w0 + i * colW + colW / 2, y + 3, fm(r.sags[k], 2), 1.8, { a: 'middle' }); });
      y += 4;
    });
    if (s.spans.length > spans.length) { sh.text(x0, y + 3, '… ещё ' + (s.spans.length - spans.length) + ' пролётов — по программе PD_RD', 1.8); y += 4; }
    y += 3;
  });
  return out;
}

function sheetCrossings(d) {
  var cr = global.PDRD_TEXTS ? global.PDRD_TEXTS.crossings(d) : (d.crossings || []); if (!cr.length) return [];
  var out = [], per = 4;
  for (var i = 0; i < cr.length; i += per) {
    var sh = new Sheet({ title: 'Схемы пересечений', kind: 'cross' });
    cr.slice(i, i + per).forEach(function (c, j) {
      var x = DZ.x0 + 10 + (j % 2) * 190, y = DZ.y0 + 15 + Math.floor(j / 2) * 105, sc = 8;
      sh.line(x, y + 70, x + 160, y + 70, 'РАЗМЕРЫ', 0.35);
      sh.rect(x + 5, y + 70 - 8 * sc, 2, 8 * sc, 'ВЛ_ОПОРЫ', 0.35); sh.rect(x + 150, y + 70 - 8 * sc, 2, 8 * sc, 'ВЛ_ОПОРЫ', 0.35);
      var pts = []; for (var k = 0; k <= 20; k++) { var xx = x + 7 + k * 143 / 20, s = 4 * (k / 20) * (1 - k / 20); pts.push([xx, y + 70 - (6 - 1.2 * s) * sc]); }
      sh.poly(pts, false, 'ВОЛС', 0.7);
      sh.rect(x + 60, y + 64, 40, 6, 'ПЕРЕСЕЧЕНИЯ', 0.35);
      sh.text(x + 80, y + 68.5, (c.object || '').slice(0, 30), 1.8, { a: 'middle', l: 'ПЕРЕСЕЧЕНИЯ' });
      sh.line(x + 105, y + 70 - 4.8 * sc, x + 105, y + 64, 'РАЗМЕРЫ', 0.25);
      sh.text(x + 107, y + 50, 'габарит ≥ ' + fm(num(c.h_req_m), 2) + ' м', 2, { l: 'РАЗМЕРЫ' });
      sh.text(x + 107, y + 54, c.ref || '', 1.6, { l: 'РАЗМЕРЫ' });
      sh.text(x, y, (c.line || '').slice(0, 60) + ', пролёт ' + c.from + ' — ' + c.to, 2.3, { b: true });
      sh.text(x, y + 4, (c.kind || '') + (c.h_calc_m ? '; расчётный габарит ' + fm(c.h_calc_m, 2) + ' м' : ''), 2);
    });
    out.push(sh);
  }
  return out;
}

function sheetDampers(d) {
  var ps = d.poles.filter(function (p) { return onRoute(p) && p.design.dampers; });
  if (!ps.length) return [];
  var sh = new Sheet({ title: 'Схема установки гасителей вибрации', kind: 'dampers' });
  var x = DZ.x0 + 20, y = DZ.y0 + 30;
  sh.rect(x, y, 4, 60, 'ВЛ_ОПОРЫ', 0.5); sh.line(x - 100 + 104, y + 20, x + 150, y + 20, 'ВОЛС', 0.7);
  sh.line(x + 4, y + 20, x - 60, y + 20, 'ВОЛС', 0.7);
  [[x + 25, 'гаситель'], [x - 25, 'гаситель']].forEach(function (g) { sh.line(g[0], y + 20, g[0], y + 27, 'МУФТЫ', 0.35); sh.rect(g[0] - 6, y + 27, 12, 3, 'МУФТЫ', 0.35); sh.text(g[0], y + 35, g[1], 1.8, { a: 'middle' }); });
  sh.text(x + 60, y + 15, 'Расстояние от зажима до гасителя — по паспорту кабеля и СО 34.20.265-2005', 2);
  var yy = y + 80;
  sh.text(DZ.x0, yy, 'Опоры с гасителями (' + ps.length + '):', 2.5, { b: true });
  var txt = ps.map(function (p) { return (p.lines[0] || {}).num + ' ' + p.mark; }).join('; ');
  var lines = txt.match(/.{1,190}(;|$)/g) || [];
  lines.slice(0, 20).forEach(function (l, i) { sh.text(DZ.x0, yy + 5 + i * 3.5, l.trim(), 2); });
  return [sh];
}

function sheetGpon(d) {
  if (!(d.profile && d.profile.operator === 'rostelecom-b2c-gpon')) return [];
  var sl = d.poles.filter(function (p) { return onRoute(p) && p.design.sleeve; });
  if (!sl.length) return [];
  var sh = new Sheet({ title: 'Схема распределительной сети (точки подключения)', kind: 'gpon' });
  sh.text(DZ.x0, DZ.y0 + 4, 'Узлы распределительной сети на опорах ВЛ (муфты и шкафы). Абонентские ответвления — в жгуте (ТТ № 282р, п. 3.1).', 2.4, { b: true });
  var byLine = {};
  sl.forEach(function (p) { var l = (p.lines[0] || {}).lineId || ''; (byLine[l] = byLine[l] || []).push(p); });
  var y = DZ.y0 + 14;
  Object.keys(byLine).slice(0, 40).forEach(function (l) {
    if (y > DZ.y1 - 5) return;
    sh.text(DZ.x0, y, l.slice(0, 70), 1.8);
    byLine[l].slice(0, 20).forEach(function (p, i) {
      var x = DZ.x0 + 130 + i * 12;
      sh.poly([[x, y - 3], [x - 2, y + 0.5], [x + 2, y + 0.5]], true, 'МУФТЫ', 0.3);
      sh.text(x, y + 3, (p.lines[0] || {}).num, 1.3, { a: 'middle' });
      if (i) sh.line(x - 10, y - 1, x - 2, y - 1, 'ВОЛС', 0.35);
    });
    y += 6;
  });
  return [sh];
}

function sheetPlanWorks(d) {
  var T = global.PDRD_TEXTS, D = global.PDRD_DOCX;
  if (!T || !D) return [];
  var data = { fields: {}, tables: {}, blocks: {}, cond: {} };
  T.extend(data, d, { code: 'ПОС' }, { noSheets: true });
  var tb = data.tables['КАЛЕНДАРНЫЙ_ПЛАН']; if (!tb || !d.poles.some(onRoute)) return [];
  var sh = new Sheet({ title: 'Календарный план и схема организации работ', kind: 'pos' });
  var x0 = DZ.x0, y = DZ.y0 + 10, day = 3, t0 = 0;
  sh.text(x0, y - 4, 'Календарный план, рабочие дни', 3, { b: true });
  var total = +tb.rows[tb.rows.length - 1][1];
  for (var k = 0; k <= total; k += 5) { sh.line(x0 + 90 + k * day, y, x0 + 90 + k * day, y + 6 * tb.rows.length, 'РАЗМЕРЫ', 0.1); sh.text(x0 + 90 + k * day, y - 0.5, String(k), 1.6, { a: 'middle' }); }
  tb.rows.slice(0, -1).forEach(function (r, i) {
    var dd = +r[1];
    sh.text(x0, y + 5 + i * 6, r[0], 2);
    sh.rect(x0 + 90 + t0 * day, y + 2 + i * 6, dd * day, 3.5, 'ВОЛС', 0.35);
    t0 += dd;
  });
  var yy = y + 6 * tb.rows.length + 15;
  sh.text(x0, yy, 'Организация работ', 3, { b: true });
  ['Работы выполняются в охранной зоне ВЛ по наряду-допуску, с допуском представителем владельца инфраструктуры.',
   'Автогидроподъёмник устанавливается вне проезжей части либо с ограждением места работ.',
   'Раскатка кабеля — с барабана через раскаточные ролики на опорах с контролем тяжения динамометром.',
   'Стрелы провеса устанавливаются по монтажным таблицам для температуры воздуха при монтаже.'].forEach(function (t, i) { sh.text(x0, yy + 6 + i * 4.5, '— ' + t, 2.2); });
  return [sh];
}

/* ---------------------------------------------------------------- комплект */
var KINDS = [sheetPlan, sheetSkeleton, sheetRoute, sheetLayout, sheetNodes, sheetMontage, sheetCrossings, sheetDampers, sheetGpon, sheetPlanWorks];
var _cache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
function sheets(d) {
  if (_cache && _cache.has(d)) return _cache.get(d);
  var res = buildSheets(d);
  if (_cache) _cache.set(d, res);
  return res;
}
function reset(d) { if (_cache) _cache.delete(d); }
function buildSheets(d) {
  var p = d.passport, s = p.signs, all = [];
  KINDS.forEach(function (fn) { try { all = all.concat(fn(d)); } catch (e) { if (global.console) console.error('Лист', fn.name, e); } });
  var approved = !!(p.shifr && p.shifrApproved && p.marksApproved);
  var code = (p.shifr || 'ШИФР НЕ УТВЕРЖДЁН') + '-ЛКС';
  var dt = p.releaseDate ? p.releaseDate.slice(5, 7) + '.' + p.releaseDate.slice(2, 4) : '';
  all.forEach(function (sh, i) {
    sh.meta.num = i + 1;
    frame(sh, { code: code, object: p.object, volume: 'Линейно-кабельные сооружения. Размещение ВОЛС на опорах ВЛ', title: sh.meta.title + (sh.meta.scale ? ', М 1:' + sh.meta.scale : ''),
                stage: 'Р', sheet: i + 1, sheets: all.length, org: p.branch, razrab: s.razrab, prov: s.prov, gip: s.gip, nkontr: s.nkontr, date: dt, approved: approved });
  });
  return all;
}
function sheetList(d) {
  var list = sheets(d), code = (d.passport.shifr || 'ШИФР НЕ УТВЕРЖДЁН') + '-ЛКС';
  return { caption: 'Таблица — Ведомость рабочих чертежей основного комплекта', cols: [{ t: 'Лист', w: 20 }, { t: 'Наименование', w: 125 }, { t: 'Примечание', w: 30 }],
    rows: list.map(function (s) { return [String(s.meta.num), s.meta.title + (s.meta.scale ? ', М 1:' + s.meta.scale : ''), code]; }) };
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function toSvg(sh) {
  var o = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + 'mm" height="' + H + 'mm" font-family="Arial, sans-serif">', '<rect width="' + W + '" height="' + H + '" fill="#fff"/>'];
  sh.p.forEach(function (e) {
    var c = COLORS[e.l] || '#000';
    if (e.t === 'line') o.push('<line x1="' + e.x1.toFixed(2) + '" y1="' + e.y1.toFixed(2) + '" x2="' + e.x2.toFixed(2) + '" y2="' + e.y2.toFixed(2) + '" stroke="' + c + '" stroke-width="' + e.w + '"/>');
    else if (e.t === 'poly') o.push('<' + (e.c ? 'polygon' : 'polyline') + ' points="' + e.pts.map(function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' ') + '" fill="none" stroke="' + c + '" stroke-width="' + e.w + '"' + (e.dash ? ' stroke-dasharray="3 1.5"' : '') + '/>');
    else if (e.t === 'circle') o.push('<circle cx="' + e.cx.toFixed(2) + '" cy="' + e.cy.toFixed(2) + '" r="' + e.r + '" fill="' + (e.fill ? c : 'none') + '" stroke="' + c + '" stroke-width="0.25"/>');
    else if (e.t === 'text') o.push('<text x="' + e.x.toFixed(2) + '" y="' + e.y.toFixed(2) + '" font-size="' + e.h + '" text-anchor="' + e.a + '"' + (e.b ? ' font-weight="700"' : '') + ' fill="' + (e.wm ? '#e3a8a8' : c) + '"' + (e.rot ? ' transform="rotate(' + e.rot + ' ' + e.x.toFixed(2) + ' ' + e.y.toFixed(2) + ')"' : '') + (e.wm ? ' opacity="0.6"' : '') + '>' + esc(e.s) + '</text>');
  });
  o.push('</svg>');
  return o.join('');
}

global.PDRD_SVG = { reset: reset, W: W, H: H, LAYERS: LAYERS, Sheet: Sheet, sheets: sheets, sheetList: sheetList, toSvg: toSvg, ekus: ekus, segments: segments };
})(typeof window !== 'undefined' ? window : globalThis);
