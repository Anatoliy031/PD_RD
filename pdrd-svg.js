/* PD_RD — графическая часть.
   Лист описывается набором примитивов в миллиметрах листа (начало — левый
   верхний угол). Из одного описания строятся SVG (просмотр, печать) и DXF.
   Формат — А3 горизонтальный, рамка 20/5/5/5 мм, основная надпись формы 3
   (ГОСТ Р 21.101-2020), размеры шрифтов — по ГОСТ 2.304 (не мельче 2,5 мм).
   Примечания и условные обозначения размещаются над основной надписью справа.
   Содержание листа занимает не менее 70 % рабочего поля (см. fitSheet). */
(function (global) {
'use strict';
var W = 420, H = 297, FL = 20, FO = 5;
var STAMP_W = 185, STAMP_H = 55;
var NOTE_W = STAMP_W;      // блок примечаний — строго над основной надписью
var FILL_MIN = 0.70;
var LAYERS = ['РАМКА', 'ШТАМП', 'ВЛ_ОПОРЫ', 'ВЛ_ПРОВОДА', 'ВОЛС', 'МУФТЫ', 'РАЗМЕРЫ', 'ТЕКСТ', 'ПЕРЕСЕЧЕНИЯ', 'ПОДЛОЖКА',
              'КАРТА_ДОРОГИ', 'КАРТА_ЗДАНИЯ', 'КАРТА_ВОДА', 'КАРТА_ЖД', 'КАРТА_УГОДЬЯ', 'КАРТА_ПОДПИСИ'];
var COLORS = { 'РАМКА': '#000', 'ШТАМП': '#000', 'ВЛ_ОПОРЫ': '#222', 'ВЛ_ПРОВОДА': '#6f6f6f', 'ВОЛС': '#0a58a8', 'МУФТЫ': '#b02a1f', 'РАЗМЕРЫ': '#444', 'ТЕКСТ': '#000', 'ПЕРЕСЕЧЕНИЯ': '#7a4d00', 'ПОДЛОЖКА': '#888',
  'КАРТА_ДОРОГИ': '#7a6a52', 'КАРТА_ЗДАНИЯ': '#8a7a6a', 'КАРТА_ВОДА': '#2f7fae', 'КАРТА_ЖД': '#555',
  'КАРТА_УГОДЬЯ': '#8aa77a', 'КАРТА_ПОДПИСИ': '#5a5a5a' };
/* Размеры шрифтов, мм */
var FS = { min: 2.5, small: 2.5, text: 3.5, head: 5, stamp: 2.5, stampSmall: 2.2 };
var SCALES = [200, 250, 500, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000, 12500, 15000, 20000, 25000, 40000, 50000, 75000, 100000, 200000];

function num(v) { var n = typeof v === 'number' ? v : parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }
function fm(v, d) { if (v === null || v === undefined || !isFinite(v)) return '—'; var k = Math.pow(10, d === undefined ? 1 : d); return String(Math.round(v * k) / k).replace('.', ','); }
/* Ширина строки для узкого шрифта, мм */
function tw(s, h) { return String(s).length * h * 0.6; }
/* В основной надписи печатается только фамилия: «Е.В. Куличкин» → «Куличкин» */
function surname(fio) {
  var parts = String(fio || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  var fam = parts.filter(function (w) { return !/^[А-ЯЁA-Z]\.?[А-ЯЁA-Z]?\.?$/.test(w); });
  return (fam[0] || parts[0] || '').replace(/,$/, '');
}
function clip(s, maxMm, h) {
  s = String(s === null || s === undefined ? '' : s);
  var n = Math.max(1, Math.floor(maxMm / (h * 0.6)));
  return s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s;
}

function Sheet(meta) { this.meta = meta || {}; this.p = []; this.notes = []; }
Sheet.prototype.line = function (x1, y1, x2, y2, layer, w, dash) { this.p.push({ t: 'line', x1: x1, y1: y1, x2: x2, y2: y2, l: layer || 'ТЕКСТ', w: w || 0.25, dash: dash }); return this; };
Sheet.prototype.rect = function (x, y, w, h, layer, lw) { return this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true, layer, lw); };
Sheet.prototype.poly = function (pts, closed, layer, w, dash) { this.p.push({ t: 'poly', pts: pts, c: !!closed, l: layer || 'ТЕКСТ', w: w || 0.25, dash: dash }); return this; };
Sheet.prototype.circle = function (cx, cy, r, layer, fill) { this.p.push({ t: 'circle', cx: cx, cy: cy, r: r, l: layer || 'ТЕКСТ', fill: !!fill }); return this; };
Sheet.prototype.text = function (x, y, s, h, opt) {
  opt = opt || {};
  h = Math.max(h || FS.small, FS.min);
  if (opt.max) s = clip(s, opt.max, h);
  this.p.push({ t: 'text', x: x, y: y, s: String(s), h: h, a: opt.a || 'start', rot: opt.rot || 0, l: opt.l || 'ТЕКСТ', b: !!opt.b, wm: !!opt.wm });
  return this;
};
Sheet.prototype.image = function (x, y, w, h, href, rot, clip, remote) { this.p.push({ t: 'image', x: x, y: y, w: w, h: h, href: href, rot: rot || 0, clip: clip || null, remote: !!remote, l: 'ПОДЛОЖКА' }); return this; };
Sheet.prototype.note = function (s) { this.notes.push(String(s)); return this; };

/* Рабочее поле листа: над основной надписью, с учётом блока примечаний */
function zone(sh) {
  var nh = notesHeight(sh);
  return { x0: FL + 5, y0: FO + 5, x1: W - FO - 5, y1: H - FO - STAMP_H - nh - 4 };
}
function notesHeight(sh) {
  if (!sh.notes.length) return 0;
  var lines = 1;
  sh.notes.forEach(function (n) { lines += Math.ceil(tw(n, FS.small) / (NOTE_W - 4)); });
  return lines * FS.small * 1.35 + 3;
}
function drawNotes(sh) {
  if (!sh.notes.length) return;
  /* блок не должен подниматься выше рабочего поля: лишние строки убираются */
  var maxH = H - FO - STAMP_H - (FO + 8);
  while (sh.notes.length > 1 && notesHeight(sh) > maxH) sh.notes.pop();
  var x = W - FO - 5 - NOTE_W, top = H - FO - STAMP_H - notesHeight(sh) + 2;
  var y = top;
  sh.text(x, y, 'Примечания:', FS.small, { b: true });
  y += FS.small * 1.35;
  sh.notes.forEach(function (n) {
    var words = String(n).split(' '), cur = '';
    words.forEach(function (w2) {
      if (tw(cur + ' ' + w2, FS.small) > NOTE_W - 4 && cur) { sh.text(x, y, cur, FS.small); y += FS.small * 1.35; cur = w2; }
      else cur = (cur + ' ' + w2).trim();
    });
    if (cur) { sh.text(x, y, cur, FS.small); y += FS.small * 1.35; }
  });
}

/* Равномерное увеличение содержания листа до заполнения рабочего поля.
   Применяется к листам без масштаба (схемы, таблицы, узлы). */
function fitSheet(sh, opt) {
  opt = opt || {};
  var z = zone(sh), items = sh.p.filter(function (e) { return e.t !== 'image'; });
  if (!items.length) return 1;
  var b = bbox(sh.p);
  if (!b) return 1;
  var availW = z.x1 - z.x0, availH = z.y1 - z.y0;
  var k = Math.min(availW / Math.max(b.w, 1e-6), availH / Math.max(b.h, 1e-6), opt.max || 2.2);
  if (!(k > 0) || !isFinite(k)) return 1;
  if (k < 1) k = Math.max(k, 0.55);           /* не уместилось — сжимаем, но в пределах читаемости */
  if (k > 1 && (b.w * k) / availW < FILL_MIN && (b.h * k) / availH < FILL_MIN) k = k;  /* больше уже нельзя */
  var ox = z.x0 + (availW - b.w * k) / 2 - b.x * k;
  var oy = z.y0 + (availH - b.h * k) / 2 - b.y * k;
  sh.p.forEach(function (e) {
    if (e.t === 'line') { e.x1 = e.x1 * k + ox; e.y1 = e.y1 * k + oy; e.x2 = e.x2 * k + ox; e.y2 = e.y2 * k + oy; e.w = Math.max(0.18, e.w * Math.min(k, 1.4)); }
    else if (e.t === 'poly') { e.pts = e.pts.map(function (p) { return [p[0] * k + ox, p[1] * k + oy]; }); e.w = Math.max(0.18, e.w * Math.min(k, 1.4)); }
    else if (e.t === 'circle') { e.cx = e.cx * k + ox; e.cy = e.cy * k + oy; e.r = e.r * k; }
    else if (e.t === 'text') { e.x = e.x * k + ox; e.y = e.y * k + oy; e.h = Math.max(FS.min, e.h * k); }
    else if (e.t === 'image') { e.x = e.x * k + ox; e.y = e.y * k + oy; e.w *= k; e.h *= k; }
  });
  sh.meta.fill = Math.round(Math.max(b.w * k / availW, b.h * k / availH) * 100);
  return k;
}
function bbox(list) {
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, any = false;
  list.forEach(function (e) {
    function add(x, y) { if (!isFinite(x) || !isFinite(y)) return; any = true; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (e.t === 'line') { add(e.x1, e.y1); add(e.x2, e.y2); }
    else if (e.t === 'poly') e.pts.forEach(function (p) { add(p[0], p[1]); });
    else if (e.t === 'circle') { add(e.cx - e.r, e.cy - e.r); add(e.cx + e.r, e.cy + e.r); }
    else if (e.t === 'text') {
      var w2 = tw(e.s, e.h), x = e.a === 'middle' ? e.x - w2 / 2 : (e.a === 'end' ? e.x - w2 : e.x);
      add(x, e.y - e.h); add(x + w2, e.y + e.h * 0.3);
    } else if (e.t === 'image') { add(e.x, e.y); add(e.x + e.w, e.y + e.h); }
  });
  return any ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/* Рамка, основная надпись формы 3, графы поля подшивки */
function frame(sh, info) {
  sh.rect(FL, FO, W - FL - FO, H - 2 * FO, 'РАМКА', 0.7);
  var x = W - FO - STAMP_W, y = H - FO - STAMP_H, L = 'ШТАМП';
  sh.rect(x, y, STAMP_W, STAMP_H, L, 0.7);
  var cols = [10, 10, 10, 10, 15, 10], cx = x;
  cols.forEach(function (c) { cx += c; sh.line(cx, y, cx, y + STAMP_H, L, cx === x + 65 ? 0.7 : 0.25); });
  for (var i = 1; i < 11; i++) sh.line(x, y + 5 * i, x + 65, y + 5 * i, L, i === 6 ? 0.7 : 0.25);
  ['Изм.', 'Кол.уч', 'Лист', '№ док.', 'Подп.', 'Дата'].forEach(function (t, i) {
    var xx = x + cols.slice(0, i).reduce(function (a, b) { return a + b; }, 0) + cols[i] / 2;
    sh.text(xx, y + 29, t, FS.stampSmall, { a: 'middle', l: L, max: cols[i] - 0.5 });
  });
  var roles = [['Разраб.', surname(info.razrab)], ['Пров.', surname(info.prov)], ['Утв.', surname(info.approver)],
               ['Н. контр.', surname(info.nkontr)], ['ГИП', surname(info.gip)]];
  roles.forEach(function (r, i) {
    sh.text(x + 1, y + 33.6 + 5 * i, r[0], FS.stampSmall, { l: L, max: 19 });
    sh.text(x + 21, y + 33.6 + 5 * i, r[1] || '', FS.stampSmall, { l: L, max: 19 });
    sh.text(x + 56, y + 33.6 + 5 * i, r[1] ? info.date || '' : '', FS.stampSmall, { l: L, max: 9.5 });
  });
  var rx = x + 65;
  sh.line(rx, y + 10, x + STAMP_W, y + 10, L, 0.7); sh.line(rx, y + 25, x + STAMP_W, y + 25, L, 0.7); sh.line(rx, y + 40, x + STAMP_W, y + 40, L, 0.7);
  sh.line(rx + 70, y + 25, rx + 70, y + STAMP_H, L, 0.7);
  sh.line(rx + 70, y + 30, x + STAMP_W, y + 30, L, 0.25);
  sh.line(rx + 85, y + 25, rx + 85, y + 40, L, 0.25); sh.line(rx + 100, y + 25, rx + 100, y + 40, L, 0.25);
  sh.text(rx + 60, y + 7.5, info.code, 4.5, { a: 'middle', l: L, b: true, max: 116 });
  wrap(sh, info.object, rx + 60, y + 17, FS.stampSmall, 114, 2, L);
  wrap(sh, info.volume, rx + 35, y + 31.5, FS.min, 66, 3, L);
  sh.text(rx + 77.5, y + 29, 'Стадия', FS.stampSmall, { a: 'middle', l: L });
  sh.text(rx + 92.5, y + 29, 'Лист', FS.stampSmall, { a: 'middle', l: L });
  sh.text(rx + 110, y + 29, 'Листов', FS.stampSmall, { a: 'middle', l: L });
  sh.text(rx + 77.5, y + 37, info.stage, 3.5, { a: 'middle', l: L });
  sh.text(rx + 92.5, y + 37, String(info.sheet), 3.5, { a: 'middle', l: L });
  sh.text(rx + 110, y + 37, String(info.sheets || ''), 3.5, { a: 'middle', l: L });
  wrap(sh, info.title, rx + 35, y + 46, FS.min, 66, 4, L);
  wrap(sh, info.org, rx + 95, y + 46, FS.min, 46, 3, L);
  if (!info.approved) sh.text(W / 2, H / 2, 'ШИФР НЕ УТВЕРЖДЁН', 16, { a: 'middle', l: 'ТЕКСТ', rot: -20, b: true, wm: true });
  var gx = 8, gy = H - FO - 85;
  sh.rect(gx, gy, 12, 85, L, 0.7); sh.line(gx + 5, gy, gx + 5, gy + 85, L, 0.25);
  sh.line(gx, gy + 25, gx + 12, gy + 25, L, 0.7); sh.line(gx, gy + 60, gx + 12, gy + 60, L, 0.7);
  [['Взам. инв. №', 12.5], ['Подп. и дата', 42.5], ['Инв. № подл.', 72.5]].forEach(function (g) {
    sh.text(gx + 3.8, gy + g[1], g[0], FS.stampSmall, { a: 'middle', rot: -90, l: L });
  });
}
function wrap(sh, s, cx, cy, h, width, maxLines, layer) {
  var words = String(s || '').split(/\s+/), lines = [], cur = '';
  words.forEach(function (w2) {
    if (tw((cur + ' ' + w2).trim(), h) > width && cur) { lines.push(cur); cur = w2; } else cur = (cur + ' ' + w2).trim();
  });
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = clip(lines[maxLines - 1], width, h); }
  var y0 = cy - (lines.length - 1) * h * 0.6;
  lines.forEach(function (l, i) { sh.text(cx, y0 + i * h * 1.2, l, h, { a: 'middle', l: layer, max: width }); });
}

/* ---------------------------------------------------------------- геометрия трассы */
function projection(d) {
  var pts = d.poles.filter(function (p) { return p.coords && p.coords.lat !== null && p.coords.lon !== null; });
  if (!pts.length) return null;
  var lat0 = pts.reduce(function (a, p) { return a + p.coords.lat; }, 0) / pts.length;
  var kx = Math.cos(lat0 * Math.PI / 180) * 111320, ky = 110574;
  return {
    lat0: lat0, kx: kx, ky: ky,
    x: function (lon) { return lon * kx; },
    y: function (lat) { return -lat * ky; },
    lon: function (x) { return x / kx; },
    lat: function (y) { return -y / ky; }
  };
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
function onRoute(p) { return ['place', 'recheck', 'extra', 'after', 'strut'].indexOf((p.design || {}).decision) >= 0; }
function poleNums(p) { return (p.lines || []).map(function (l) { return l.num; }).join('/'); }

/* Условное обозначение опоры: промежуточная — стойка; анкерная, угловая
   анкерная и ответвительная — стойка с двумя подкосами; концевая — с одним
   подкосом со стороны, противоположной тяжению. Подкосы всегда идут вниз. */
function poleSymbol(sh, x, yTop, yBase, scheme, layer, strut) {
  layer = layer || 'ВЛ_ОПОРЫ';
  var hgt = yBase - yTop, s = String(scheme || '');
  if (strut) {
    /* дополнительный подпор к одностоечной опоре — выделяется красным */
    sh.line(x, yTop + hgt * 0.3, x + hgt * 0.42, yBase, 'МУФТЫ', 0.7);
    sh.line(x + hgt * 0.42 - 1.2, yBase, x + hgt * 0.42 + 1.2, yBase, 'МУФТЫ', 0.7);
  }
  sh.line(x, yTop, x, yBase, layer, 0.6);
  var d = hgt * 0.42, top = yTop + hgt * 0.28;
  if (/концев/.test(s)) sh.line(x, top, x - d, yBase, layer, 0.5);
  else if (/анкер|ответвит/.test(s)) { sh.line(x, top, x - d, yBase, layer, 0.5); sh.line(x, top, x + d, yBase, layer, 0.5); }
  sh.line(x - hgt * 0.18, yBase, x + hgt * 0.18, yBase, layer, 0.5);
}
function schemeOf(p) { var R = global.PDRD_REFS_V25, ref = R ? R.poleByMark(p.mark) : null; return ref ? ref.sch : ''; }

/* ---------------------------------------------------------------- ситуационный план */
function pca(pts, pr) {
  /* главное направление участка трассы: план разворачивается так, чтобы трасса
     шла вдоль длинной стороны листа, стрелка «север» поворачивается вместе с ним */
  if (pts.length < 2) return 0;
  var xs = pts.map(function (p) { return pr.x(p.coords.lon); }), ys = pts.map(function (p) { return pr.y(p.coords.lat); });
  var mx = xs.reduce(function (a, b) { return a + b; }, 0) / xs.length, my = ys.reduce(function (a, b) { return a + b; }, 0) / ys.length;
  var sxx = 0, syy = 0, sxy = 0;
  xs.forEach(function (x, i) { var dx = x - mx, dy = ys[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; });
  return 0.5 * Math.atan2(2 * sxy, sxx - syy);
}
function clipSeg(p1, p2, z) {
  var t0 = 0, t1 = 1, dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  var pq = [[-dx, p1[0] - z.x0], [dx, z.x1 - p1[0]], [-dy, p1[1] - z.y0], [dy, z.y1 - p1[1]]];
  for (var i = 0; i < 4; i++) {
    var pp = pq[i][0], qq = pq[i][1];
    if (pp === 0) { if (qq < 0) return null; continue; }
    var r = qq / pp;
    if (pp < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [[p1[0] + t0 * dx, p1[1] + t0 * dy], [p1[0] + t1 * dx, p1[1] + t1 * dy]];
}
function planSheets(d) {
  var pr = projection(d); if (!pr) return [];
  var segs = segments(d);
  var pts = d.poles.filter(function (p) { return p.coords && p.coords.lat !== null; });
  if (!pts.length) return [];
  var vec = d.mapVector && d.mapVector.features ? d.mapVector : null;
  var u0 = d.mapUnderlay;
  var und = u0 && u0.nw && u0.se && (u0.dataUrl || (u0.tiles && u0.tiles.length)) ? u0 : null;
  var out = [];
  var Z = { x0: FL + 5, y0: FO + 5, x1: W - FO - 5, y1: H - FO - STAMP_H - 56 };

  function rotator(rot) {
    var c = Math.cos(rot), s = Math.sin(rot);
    return function (x, y) { return [x * c + y * s, -x * s + y * c]; };
  }
  function extent(items, rot) {
    var R = rotator(rot), xs = [], ys = [];
    items.forEach(function (p) { var q = R(pr.x(p.coords.lon), pr.y(p.coords.lat)); xs.push(q[0]); ys.push(q[1]); });
    return { minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs), minY: Math.min.apply(null, ys), maxY: Math.max.apply(null, ys) };
  }
  function fillAt(items, rot, sc) {
    var e = extent(items, rot), avW = Z.x1 - Z.x0 - 4, avH = Z.y1 - Z.y0 - 4;
    return { w: (e.maxX - e.minX) / sc * 1000 / avW, h: (e.maxY - e.minY) / sc * 1000 / avH };
  }
  function bestScale(items, rot) {
    return SCALES.filter(function (s) { var f = fillAt(items, rot, s); return f.w <= 1 && f.h <= 1; })[0] || SCALES[SCALES.length - 1];
  }

  function draw(sh, items, title, forceScale, rot) {
    rot = rot || 0;
    var R = rotator(rot);
    var sc = forceScale || bestScale(items, rot);
    var e = extent(items, rot);
    var f = fillAt(items, rot, sc);
    var cx = (e.minX + e.maxX) / 2, cy = (e.minY + e.maxY) / 2;
    var mx = (Z.x0 + Z.x1) / 2, my = (Z.y0 + Z.y1) / 2;
    function XYm(x, y) { var q = R(x, y); return [mx + (q[0] - cx) / sc * 1000, my + (q[1] - cy) / sc * 1000]; }
    function P(p) { return XYm(pr.x(p.coords.lon), pr.y(p.coords.lat)); }
    function inside(q) { return q[0] >= Z.x0 - 2 && q[0] <= Z.x1 + 2 && q[1] >= Z.y0 - 2 && q[1] <= Z.y1 + 2; }
    if (und) {
      /* Подложка: либо склеенный растр, либо набор тайлов-ссылок.
         Углы каждого прямоугольника пересчитываются в координаты листа;
         при развороте плана растр помечается углом поворота. */
      var clipRect = { x0: Z.x0, y0: Z.y0, x1: Z.x1, y1: Z.y1 };
      var parts = und.mode === 'tiles' && und.tiles && und.tiles.length
        ? und.tiles.map(function (tl2) { return { nw: tl2.nw, se: tl2.se, href: tl2.url, remote: true }; })
        : (und.dataUrl ? [{ nw: und.nw, se: und.se, href: und.dataUrl, remote: false }] : []);
      parts.forEach(function (im) {
        var nwP = XYm(pr.x(im.nw.lon), pr.y(im.nw.lat)), seP = XYm(pr.x(im.se.lon), pr.y(im.se.lat));
        var neP = XYm(pr.x(im.se.lon), pr.y(im.nw.lat)), swP = XYm(pr.x(im.nw.lon), pr.y(im.se.lat));
        var wIm = Math.hypot(neP[0] - nwP[0], neP[1] - nwP[1]) + (im.remote ? 0.05 : 0);
        var hIm = Math.hypot(swP[0] - nwP[0], swP[1] - nwP[1]) + (im.remote ? 0.05 : 0);
        var ccx = (nwP[0] + seP[0]) / 2, ccy = (nwP[1] + seP[1]) / 2;
        if (!(wIm > 0.2 && hIm > 0.2)) return;
        /* тайлы за пределами рабочего поля не выводим */
        var half = Math.max(wIm, hIm) / 2 * (rot ? 1.5 : 1);
        if (ccx + half < Z.x0 || ccx - half > Z.x1 || ccy + half < Z.y0 || ccy - half > Z.y1) return;
        sh.image(ccx - wIm / 2, ccy - hIm / 2, wIm, hIm, im.href, -rot * 180 / Math.PI, clipRect, im.remote);
      });
      if (und.attr) sh.note('Картографическая основа: ' + und.attr + '.');
      if (und.mode === 'tiles') sh.note('Карта выводится ссылками на тайлы сервиса: видна в просмотре и при печати (в том числе «Печать → Сохранить как PDF»); в PDF из программы и в архив DXF не попадает — для этого используйте источник, разрешающий чтение изображений (например, OpenStreetMap), или загрузите своё изображение.');
    }
    if (vec && vec.features && vec.features.length) {
      var nDrawn = drawVector(sh, vec.features, function (la, lo) { return XYm(pr.x(lo), pr.y(la)); }, Z, sc);
      if (nDrawn) {
        sh.note('Топооснова — OpenStreetMap (© OpenStreetMap contributors, ODbL): улицы, дома с номерами, водотоки, железные дороги; слои КАРТА_* выгружаются в PDF и DXF.');
        
      }
    }
    var inv = rotator(-rot), ctr = inv(cx, cy);
    grid(sh, Z, pr, XYm, sc, ctr);
    var set = {}; items.forEach(function (p) { set[p.id] = 1; });
    segs.forEach(function (g) {
      if (!set[g.a.id] && !set[g.b.id]) return;
      if (!g.a.coords || !g.b.coords || g.a.coords.lat === null || g.b.coords.lat === null) return;
      var p1 = P(g.a), p2 = P(g.b);
      if (!inside(p1) && !inside(p2)) return;
      var cl = clipSeg(p1, p2, Z); if (!cl) return;
      var on = onRoute(g.a) && onRoute(g.b) && (d.lines.filter(function (l) { return l.id === g.line; })[0] || {}).cable !== false;
      sh.line(cl[0][0], cl[0][1], cl[1][0], cl[1][1], on ? 'ВОЛС' : 'ВЛ_ПРОВОДА', on ? 0.8 : 0.3);
    });
    var labels = items.length <= 90, planStrut = false;
    /* соседние опоры — чтобы подписи ставить в стороне от линии трассы */
    var nb = {};
    segs.forEach(function (g) {
      if (!g.a.coords || !g.b.coords || g.a.coords.lat === null || g.b.coords.lat === null) return;
      (nb[g.a.id] = nb[g.a.id] || []).push(g.b);
      (nb[g.b.id] = nb[g.b.id] || []).push(g.a);
    });
    items.forEach(function (p) {
      var q = P(p); if (!inside(q)) return;
      var x = p.design || {};
      if (x.sleeve) sh.poly([[q[0], q[1] - 2.2], [q[0] - 1.9, q[1] + 1.1], [q[0] + 1.9, q[1] + 1.1]], true, 'МУФТЫ', 0.4);
      else if (['after', 'bypass', 'exclude'].indexOf(x.decision) >= 0) sh.circle(q[0], q[1], 1.4, 'МУФТЫ', false);
      else sh.circle(q[0], q[1], labels ? 0.9 : 0.5, 'ВЛ_ОПОРЫ', true);
      if (x.reinforce) { sh.circle(q[0], q[1], 3.0, 'МУФТЫ', false); sh.circle(q[0], q[1], 3.3, 'МУФТЫ', false); planStrut = true; }
      if (!labels) return;
      var dx = 0, dy = 0;
      (nb[p.id] || []).forEach(function (o) { var r = P(o), l = Math.hypot(r[0] - q[0], r[1] - q[1]) || 1; dx += (r[0] - q[0]) / l; dy += (r[1] - q[1]) / l; });
      var ln = Math.hypot(dx, dy), nx, ny;
      if (ln > 0.35) { nx = -dx / ln; ny = -dy / ln; }            /* угловая опора — наружу угла */
      else {
        var o1 = (nb[p.id] || [])[0];
        if (o1) { var r1 = P(o1), l1 = Math.hypot(r1[0] - q[0], r1[1] - q[1]) || 1; nx = -(r1[1] - q[1]) / l1; ny = (r1[0] - q[0]) / l1; }
        else { nx = 0.7; ny = -0.7; }
      }
      var off = 4, s2 = poleNums(p), wl = tw(s2, FS.small);
      var lx = q[0] + nx * off, ly = q[1] + ny * off + FS.small * 0.35;
      lx = Math.min(Math.max(lx, Z.x0 + wl / 2 + 0.5), Z.x1 - wl / 2 - 0.5);
      ly = Math.min(Math.max(ly, Z.y0 + FS.small), Z.y1 - 0.5);
      sh.text(lx, ly, s2, FS.small, { a: 'middle', l: 'ТЕКСТ', max: 24 });
    });
    if (planStrut) sh.note('Красным двойным кольцом выделены опоры, к которым устанавливается дополнительный подпор.');
    northArrow(sh, Z.x1 - 12, Z.y0 + 5, rot);
    scaleBar(sh, Z.x1 - 62, Z.y1 - 3, sc);
    sh.meta.scale = sc;
    sh.meta.fill = Math.round(Math.max(f.w, f.h) * 100);
    sh.meta.title = title;
    var c1 = XYinv(Z.x0, Z.y0), c2 = XYinv(Z.x1, Z.y1);
    function XYinv(px, py) {
      var rx = cx + (px - mx) * sc / 1000, ry = cy + (py - my) * sc / 1000;
      var c = Math.cos(-rot), s = Math.sin(-rot);
      var x = rx * c + ry * s, y = -rx * s + ry * c;
      return [pr.lat(y), pr.lon(x)];
    }
    sh.note('Координаты — WGS-84; сетка — параллели и меридианы. Углы поля: ' + dms(c1[0]) + ' с. ш., ' + dms(c1[1]) + ' в. д. — ' + dms(c2[0]) + ' с. ш., ' + dms(c2[1]) + ' в. д.');
    if (rot) sh.note('План развёрнут вдоль листа: север — по стрелке.');
    sh.note('Обозначения: тонкая линия — ВЛ; утолщённая — проектируемая ВОЛС; точка — опора; треугольник — муфта и запас; окружность — опора с размещением после замены владельцем.');
    if (und) sh.note('Подложка: ' + (und.name || 'растр') + ', привязана по координатам углов; в архив DXF прикладываются растр и файл привязки .jgw.');
    else if (!vec) sh.note('Подложка не задана (страница «Чертежи»). Трасса передаётся также файлом KMZ для просмотра на картографической основе.');
  }

  /* обзорный лист: план разворачивается вдоль листа, если это увеличивает заполнение */
  var s0 = new Sheet({ kind: 'plan' });
  var rot0 = pca(pts, pr);
  var f0 = fillAt(pts, 0, bestScale(pts, 0)), fr = fillAt(pts, rot0, bestScale(pts, rot0));
  var useRot = Math.max(fr.w, fr.h) > Math.max(f0.w, f0.h) + 0.02;
  draw(s0, pts, 'Ситуационный план трассы (обзорный)', null, useRot ? rot0 : 0);
  out.push(s0);

  /* фрагменты: участки трассы, развёрнутые вдоль листа, заполнение не менее 70 % */
  var order = routeOrder(d, pts);
  var idx = Math.max(0, SCALES.indexOf(s0.meta.scale));
  var chunks = [], detail = SCALES[Math.max(0, idx - 4)];
  for (var step = 4; step >= 1; step--) {
    detail = SCALES[Math.max(0, idx - step)];
    chunks = []; var cur = [];
    order.forEach(function (p) {
      var test = cur.concat([p]);
      var rot = pca(test, pr);
      var f = fillAt(test, rot, detail);
      if (cur.length && (f.w > 1 || f.h > 1)) { chunks.push(cur); cur = [p]; } else cur = test;
    });
    if (cur.length) chunks.push(cur);
    chunks = chunks.filter(function (c) { return c.length > 1; });
    if (chunks.length <= 40) break;
  }
  if (detail >= s0.meta.scale) chunks = [];
  /* короткие «хвосты» присоединяем к предыдущему участку */
  for (var ci = chunks.length - 1; ci > 0; ci--) {
    if (chunks[ci].length <= 3) {
      var merged = chunks[ci - 1].concat(chunks[ci]);
      var rm = pca(merged, pr), fmg = fillAt(merged, rm, bestScale(merged, rm));
      if (Math.max(fmg.w, fmg.h) >= 0.5) { chunks[ci - 1] = merged; chunks.splice(ci, 1); }
    }
  }
  chunks.forEach(function (c, i) {
    var sh = new Sheet({ kind: 'plan' });
    var rot = pca(c, pr);
    var sc = bestScale(c, rot);
    draw(sh, c, 'Ситуационный план трассы. Участок ' + (i + 1) + ' из ' + chunks.length, sc, rot);
    out.push(sh);
  });
  return out;
}
function routeOrder(d, pts) {
  var byLine = {}, out = [];
  pts.forEach(function (p) { var l = ((p.lines || [])[0] || {}).lineId || ''; (byLine[l] = byLine[l] || []).push(p); });
  Object.keys(byLine).forEach(function (l) {
    var list = byLine[l], idx = {};
    list.forEach(function (p) { (p.fromReport || []).forEach(function (r) { if (r.line_id === l) idx[r.num] = p; }); });
    var seen = {}, seq = [];
    list.forEach(function (p) {
      if (seen[p.id]) return;
      var rec = (p.fromReport || []).filter(function (r) { return r.line_id === l; })[0] || {};
      if (rec.prev && idx[rec.prev] && !seen[idx[rec.prev].id]) return;
      var cur = p, guard = 0;
      while (cur && !seen[cur.id] && guard++ < 5000) {
        seen[cur.id] = 1; seq.push(cur);
        var r2 = (cur.fromReport || []).filter(function (r) { return r.line_id === l; })[0] || {};
        cur = r2.next ? idx[r2.next] : null;
      }
    });
    list.forEach(function (p) { if (!seen[p.id]) { seen[p.id] = 1; seq.push(p); } });
    out = out.concat(seq);
  });
  return out;
}
function dms(v) {
  var a = Math.abs(v), g = Math.floor(a), m = Math.floor((a - g) * 60), s = ((a - g) * 60 - m) * 60;
  return g + '°' + (m < 10 ? '0' : '') + m + '′' + (s < 10 ? '0' : '') + s.toFixed(1).replace('.', ',') + '″';
}
function grid(sh, z, pr, XYm, sc, ctr) {
  var steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  var target = (z.x1 - z.x0) / 1000 * sc / 4;
  var step = steps.filter(function (s) { return s >= target; })[0] || steps[steps.length - 1];
  var big = step * 400;
  var c0 = [ctr[0], ctr[1]];
  var corners = [[z.x0, z.y0], [z.x1, z.y0], [z.x0, z.y1], [z.x1, z.y1]];
  var probe = [XYm(c0[0], c0[1]), XYm(c0[0] + step, c0[1]), XYm(c0[0], c0[1] + step)];
  var ex = [(probe[1][0] - probe[0][0]) / step, (probe[1][1] - probe[0][1]) / step];
  var ey = [(probe[2][0] - probe[0][0]) / step, (probe[2][1] - probe[0][1]) / step];
  var det = ex[0] * ey[1] - ex[1] * ey[0];
  if (!det) return;
  var mm = corners.map(function (q) {
    var dx = q[0] - probe[0][0], dy = q[1] - probe[0][1];
    return [c0[0] + (dx * ey[1] - dy * ey[0]) / det, c0[1] + (dy * ex[0] - dx * ex[1]) / det];
  });
  var xs = mm.map(function (q) { return q[0]; }), ys = mm.map(function (q) { return q[1]; });
  for (var xm = Math.ceil(Math.min.apply(null, xs) / step) * step; xm <= Math.max.apply(null, xs); xm += step) {
    var seg = clipSeg(XYm(xm, c0[1] - big), XYm(xm, c0[1] + big), z);
    if (!seg) continue;
    sh.line(seg[0][0], seg[0][1], seg[1][0], seg[1][1], 'РАЗМЕРЫ', 0.2, true);
    var lbl = seg[0][1] < seg[1][1] ? seg[0] : seg[1];
    var s1 = dms(pr.lon(xm)), w1 = tw(s1, FS.min);
    var x1 = Math.min(lbl[0] + 1, z.x1 - w1 - 0.5);
    if (x1 >= z.x0) sh.text(x1, Math.max(z.y0 + 3.2, Math.min(lbl[1] + 3.2, z.y1 - 0.5)), s1, FS.min, { l: 'РАЗМЕРЫ' });
  }
  for (var ym = Math.ceil(Math.min.apply(null, ys) / step) * step; ym <= Math.max.apply(null, ys); ym += step) {
    var seg2 = clipSeg(XYm(c0[0] - big, ym), XYm(c0[0] + big, ym), z);
    if (!seg2) continue;
    sh.line(seg2[0][0], seg2[0][1], seg2[1][0], seg2[1][1], 'РАЗМЕРЫ', 0.2, true);
    var lbl2 = seg2[0][0] < seg2[1][0] ? seg2[0] : seg2[1];
    var s2 = dms(pr.lat(ym)), w2 = tw(s2, FS.min);
    var x2 = Math.min(Math.max(lbl2[0] + 1, z.x0 + 0.5), z.x1 - w2 - 0.5);
    var y2 = Math.max(z.y0 + FS.min, Math.min(lbl2[1] - 1, z.y1 - 0.5));
    sh.text(x2, y2, s2, FS.min, { l: 'РАЗМЕРЫ' });
  }
}
function northArrow(sh, x, y, rot) {
  rot = rot || 0;
  var c = Math.cos(rot), s = Math.sin(rot);
  function R(px, py) { return [x + (px * c + py * s), y + (-px * s + py * c)]; }
  var pts = [R(0, 0), R(-3.5, 12), R(0, 8.5), R(3.5, 12)];
  sh.poly(pts, true, 'ТЕКСТ', 0.4);
  var lab = R(0, -3);
  sh.text(lab[0], lab[1], 'С', 4, { a: 'middle', b: true });
}
function scaleBar(sh, x, y, sc) {
  var len = 50, m = sc / 1000 * len;
  sh.line(x, y, x + len, y, 'РАЗМЕРЫ', 0.4);
  [0, len / 2, len].forEach(function (t) { sh.line(x + t, y - 1.8, x + t, y + 1.8, 'РАЗМЕРЫ', 0.4); });
  sh.text(x, y + 5, '0', FS.small, { a: 'middle' });
  sh.text(x + len, y + 5, fm(m, 0) + ' м', FS.small, { a: 'middle' });
  sh.text(x + len / 2, y - 3, 'М 1:' + sc, FS.text, { a: 'middle', b: true });
}

/* Векторная топооснова OSM: дороги, здания, вода, железные дороги и подписи.
   Всё рисуется примитивами, поэтому попадает и в PDF, и в DXF (свои слои). */
function drawVector(sh, feats, Pll, z, sc) {
  if (!feats || !feats.length) return 0;
  var drawn = 0, named = {}, order = { landuse: 0, waterarea: 1, water: 2, building: 3, rail: 4, road: 5 };
  var labelRoads = sc <= 12000, labelHouses = sc <= 2500, labelWater = sc <= 25000;
  var list = feats.slice().sort(function (a, b) { return (order[a.kind] || 9) - (order[b.kind] || 9); });
  list.forEach(function (f) {
    var pts = f.pts.map(function (c) { return Pll(c[0], c[1]); });
    var vis = pts.some(function (q) { return q[0] >= z.x0 - 20 && q[0] <= z.x1 + 20 && q[1] >= z.y0 - 20 && q[1] <= z.y1 + 20; });
    if (!vis) return;
    var layer = { road: 'КАРТА_ДОРОГИ', building: 'КАРТА_ЗДАНИЯ', water: 'КАРТА_ВОДА', waterarea: 'КАРТА_ВОДА',
                  rail: 'КАРТА_ЖД', landuse: 'КАРТА_УГОДЬЯ' }[f.kind] || 'КАРТА_ДОРОГИ';
    if (f.closed) {
      var ok = false;
      for (var i = 1; i < pts.length; i++) { var s2 = clipSeg(pts[i - 1], pts[i], z); if (s2) { sh.line(s2[0][0], s2[0][1], s2[1][0], s2[1][1], layer, f.w, f.dash); ok = true; } }
      if (ok) drawn++;
    } else {
      for (var k = 1; k < pts.length; k++) {
        var s3 = clipSeg(pts[k - 1], pts[k], z);
        if (s3) { sh.line(s3[0][0], s3[0][1], s3[1][0], s3[1][1], layer, f.w, f.dash); drawn++; }
      }
    }
    if (!f.label) return;
    if (f.kind === 'building') {
      if (!labelHouses) return;
      var cx = 0, cy = 0;
      pts.forEach(function (q) { cx += q[0]; cy += q[1]; });
      cx /= pts.length; cy /= pts.length;
      if (cx < z.x0 || cx > z.x1 || cy < z.y0 || cy > z.y1) return;
      sh.text(cx, cy + 0.9, f.label, FS.min, { a: 'middle', l: 'КАРТА_ПОДПИСИ', max: 12 });
      return;
    }
    if (f.kind === 'road' && !labelRoads) return;
    if ((f.kind === 'water' || f.kind === 'waterarea') && !labelWater) return;
    var cnt = named[f.label] || 0;
    if (cnt >= 2) return;
    /* подпись вдоль самого длинного видимого звена */
    var best = null, bl = 0;
    for (var m = 1; m < pts.length; m++) {
      var c2 = clipSeg(pts[m - 1], pts[m], z); if (!c2) continue;
      var L2 = Math.hypot(c2[1][0] - c2[0][0], c2[1][1] - c2[0][1]);
      if (L2 > bl) { bl = L2; best = c2; }
    }
    if (!best || bl < tw(f.label, FS.small) * 1.1) return;
    var mx = (best[0][0] + best[1][0]) / 2, my = (best[0][1] + best[1][1]) / 2;
    var ang = Math.atan2(best[1][1] - best[0][1], best[1][0] - best[0][0]) * 180 / Math.PI;
    if (ang > 90) ang -= 180; else if (ang < -90) ang += 180;
    sh.text(mx, my - 1, f.label, FS.small, { a: 'middle', rot: ang, l: 'КАРТА_ПОДПИСИ', max: bl });
    named[f.label] = cnt + 1;
  });
  return drawn;
}

/* ---------------------------------------------------------------- ЭКУ и скелетная схема */
function ekus(d) {
  var S = global.PDRD_SPEC; if (!S) return [];
  var spans = S.cableSpans(d), adj = {};
  spans.forEach(function (s) { (adj[s.from.id] = adj[s.from.id] || []).push({ s: s, to: s.to }); (adj[s.to.id] = adj[s.to.id] || []).push({ s: s, to: s.from }); });
  var byId = {}; d.poles.forEach(function (p) { byId[p.id] = p; });
  function bound(id) { return (adj[id] || []).length !== 2 || (byId[id].design || {}).sleeve; }
  var used = {}, out = [];
  function ekey(s) { return s.line + '|' + s.fromNum + '|' + s.toNum; }
  Object.keys(adj).forEach(function (id) {
    if (!bound(id)) return;
    adj[id].forEach(function (e) {
      if (used[ekey(e.s)]) return;
      var len = 0, cur = id, ed = e, n = 0, guard = 0;
      while (ed && guard++ < 10000) {
        used[ekey(ed.s)] = 1; len += ed.s.L; n++; cur = ed.to.id;
        if (bound(cur)) break;
        ed = adj[cur].filter(function (z) { return !used[ekey(z.s)]; })[0];
      }
      out.push({ a: byId[id], b: byId[cur], len: len, spans: n });
    });
  });
  return out;
}
function label(p) { return poleNums(p) + ' ' + (p.mark || ''); }

function skeletonSheets(d) {
  var list = ekus(d);
  if (!list.length) return [];
  var out = [], per = 12, fib = (d.cable || {}).fibers || '—';
  var k = global.PDRD_SPEC ? global.PDRD_SPEC.specParams(d).sagFactor : 1.02;
  for (var i = 0; i < list.length; i += per) {
    var sh = new Sheet({ kind: 'skeleton', title: 'Схема линейного объекта (скелетная)' + (list.length > per ? ', лист ' + (i / per + 1) : '') });
    var y = 0;
    sh.text(0, y, 'Элементарные кабельные участки: ' + list.length + '; кабель ' + ((d.cable || {}).mark || '') + ', ' + fib + ' ОВ', FS.text, { b: true });
    y += 12;
    list.slice(i, i + per).forEach(function (e, j) {
      var yy = y + j * 20, x0 = 0, x1 = 260;
      [[x0, e.a], [x1, e.b]].forEach(function (z2) {
        var p = z2[1], isS = (p.design || {}).sleeve;
        if (isS) sh.poly([[z2[0], yy - 4], [z2[0] - 3.5, yy + 2.5], [z2[0] + 3.5, yy + 2.5]], true, 'МУФТЫ', 0.5);
        else sh.rect(z2[0] - 3, yy - 3, 6, 6, 'ВЛ_ОПОРЫ', 0.5);
        sh.text(z2[0], yy + 9, label(p), FS.small, { a: 'middle', max: 60 });
      });
      sh.line(x0 + 5, yy, x1 - 5, yy, 'ВОЛС', 0.9);
      sh.text((x0 + x1) / 2, yy - 3, 'ЭКУ-' + (i + j + 1) + ': трасса ' + fm(e.len, 0) + ' м, кабель ' + fm(e.len * k, 0) + ' м, пролётов ' + e.spans + ', ' + fib + ' ОВ', FS.small, { a: 'middle' });
    });
    sh.note('ЭКУ — элементарный кабельный участок между муфтами и концами трассы. Длина кабеля указана с коэффициентом на провис ' + fm(k, 3) + ' без технологических запасов.');
    fitSheet(sh);
    out.push(sh);
  }
  return out;
}

/* ---------------------------------------------------------------- схема размещения по опорам */
function routeSheets(d) {
  var out = [], perRow = 14, rowsPerSheet = 4, rows = [];
  d.lines.forEach(function (l) {
    if (l.cable === false) return;
    var ps = d.poles.map(function (p) { var r = (p.fromReport || []).filter(function (x) { return x.line_id === l.id; })[0]; return r ? { p: p, r: r } : null; }).filter(Boolean);
    if (!ps.length) return;
    var idx = {}; ps.forEach(function (x) { idx[x.r.num] = x; });
    var start = ps.filter(function (x) { return !x.r.prev || !idx[x.r.prev]; })[0] || ps[0], seq = [], seen = {}, cur = start, guard = 0;
    while (cur && !seen[cur.r.num] && guard++ < 5000) { seq.push(cur); seen[cur.r.num] = 1; cur = cur.r.next ? idx[cur.r.next] : null; }
    ps.forEach(function (x) { if (!seen[x.r.num]) seq.push(x); });
    for (var i = 0; i < seq.length; i += perRow) rows.push({ line: l, items: seq.slice(i, i + perRow), part: i / perRow + 1 });
  });
  if (!rows.length) return [];
  for (var s = 0; s < rows.length; s += rowsPerSheet) {
    var sh = new Sheet({ kind: 'route', title: 'Схема размещения ОК на опорах ВЛ, лист ' + (Math.floor(s / rowsPerSheet) + 1) });
    var anyStrut = false;
    rows.slice(s, s + rowsPerSheet).forEach(function (row, j) {
      var y = j * 62, x0 = 0, step = 26;
      sh.text(x0, y, clip(row.line.name, 200, FS.text) + (row.part > 1 ? ' (продолжение)' : '') + ', ' + fm(row.line.kv, 1) + ' кВ', FS.text, { b: true });
      var base = y + 26;
      row.items.forEach(function (it, k) {
        var x = x0 + k * step, des = it.p.design || {};
        poleSymbol(sh, x, y + 8, base, schemeOf(it.p), des.reinforce ? 'МУФТЫ' : 'ВЛ_ОПОРЫ', !!des.reinforce);
        if (des.reinforce) anyStrut = true;
        sh.text(x, base + 5, it.r.num, FS.text, { a: 'middle', max: step - 1, l: des.reinforce ? 'МУФТЫ' : 'ТЕКСТ' });
        sh.text(x, base + 9.5, it.r.mark || '—', FS.small, { a: 'middle', max: step - 1 });
        var code = { place: des.node || '', recheck: (des.node || '') + '*', strut: des.node || '', extra: 'Е1', after: 'В', bypass: '—', exclude: '×' }[des.decision] || '?';
        sh.text(x, base + 14, code, FS.text, { a: 'middle', l: des.decision === 'place' ? 'ТЕКСТ' : 'МУФТЫ' });
        if (des.h_m) sh.text(x, base + 18.5, fm(des.h_m, 2), FS.small, { a: 'middle', l: 'РАЗМЕРЫ' });
        if (des.sleeve) sh.poly([[x, y + 2], [x - 2.2, y + 6], [x + 2.2, y + 6]], true, 'МУФТЫ', 0.5);
        if (k < row.items.length - 1) {
          var nx = row.items[k + 1];
          if (onRoute(it.p) && onRoute(nx.p)) sh.line(x, y + 13, x + step, y + 13, 'ВОЛС', 0.9);
          if (num(it.r.span_next_m)) sh.text(x + step / 2, y + 11, fm(num(it.r.span_next_m), 0), FS.small, { a: 'middle', l: 'РАЗМЕРЫ' });
        }
      });
    });
    sh.note('Под опорой указаны: номер опоры, марка опоры, узел крепления кабеля и высота подвеса кабеля, м. Над линией — длина пролёта, м.');
    sh.note('Узлы крепления: П — поддерживающий; ПУ — поддерживающий угловой; А1 — анкерный односторонний; А2 — анкерный двусторонний; АО — анкерный с ответвлением; С — узел спуска (муфта, запас).');
    sh.note('Решения: * — размещение после поверочного расчёта по типовому проекту; Е1 — установка дополнительной опоры (мероприятие Е.1); В — размещение после замены опоры владельцем; ▲ — муфта и запас кабеля.');
    if (anyStrut) sh.note('Красным выделены опоры, к которым устанавливается дополнительный подпор: не проходящие по допустимой нагрузке и одностоечные с муфтой (мероприятие Е.1, позиция спецификации «Подпор»).');
    fitSheet(sh);
    out.push(sh);
  }
  return out;
}

/* ---------------------------------------------------------------- компоновка на опорах */
function layoutSheets(d) {
  var N = global.PDRD_NORMS, R = global.PDRD_REFS_V25, by = {};
  d.poles.forEach(function (p) { if (onRoute(p) && p.design && p.design.h_m) { (by[p.mark] = by[p.mark] || []).push(p); } });
  var marks = Object.keys(by); if (!marks.length) return [];
  var out = [], per = 4;
  for (var i = 0; i < marks.length; i += per) {
    var sh = new Sheet({ kind: 'layout', title: 'Компоновка элементов на опорах' + (marks.length > per ? ', лист ' + (i / per + 1) : '') });
    marks.slice(i, i + per).forEach(function (m, j) {
      var x = j * 95 + 30, base = 130, sc = 13;   // 1 м = 13 мм
      var ps = by[m], p = ps[0], ref = R ? R.poleByMark(m) : null, sch = ref ? ref.sch : '';
      var hs = ps.map(function (q) { return q.design.h_m; }).sort(function (a, b) { return a - b; });
      var hc = hs[Math.floor(hs.length / 2)];
      var standH = ref && ref.h ? ref.h + 1.2 : 9;
      sh.line(x - 28, base, x + 34, base, 'РАЗМЕРЫ', 0.5);
      sh.text(x + 34, base + 4, '±0,000', FS.small, { a: 'end' });
      sh.rect(x - 1.8, base - standH * sc, 3.6, standH * sc, 'ВЛ_ОПОРЫ', 0.6);
      /* подкосы и оттяжки анкерных, концевых, угловых и ответвительных опор */
      /* подкосы анкерных, концевых, угловых и ответвительных опор: в пределах своей
         колонки листа, подпись — вдоль подкоса, не выходя за его длину */
      function brace(side, topK, armK, layer, lbl, w) {
        var yT = base - standH * sc * topK, xT = x + side * 1.8, xB = x + side * standH * sc * armK;
        sh.line(xT, yT, xB, base, layer, w);
        sh.line(xB - 2.2, base, xB + 2.2, base, layer, w);               /* опорная плита */
        var ang = Math.atan2(base - yT, xB - xT) * 180 / Math.PI;
        if (ang > 90) ang -= 180;
        var mx = (xT + xB) / 2, my = (yT + base) / 2, off = 2.2;
        var nx = -(base - yT), ny = (xB - xT), nl = Math.hypot(nx, ny);
        nx = nx / nl * off * side; ny = ny / nl * off * side;
        sh.text(mx - nx, my - ny, lbl, FS.small, { a: 'middle', rot: ang, l: layer === 'МУФТЫ' ? 'МУФТЫ' : 'ТЕКСТ' });
      }
      if (/анкер|концев|ответвит/.test(sch)) {
        brace(-1, 0.62, 0.28, 'ВЛ_ОПОРЫ', 'подкос', 0.6);
        if (!/концев/.test(sch)) brace(1, 0.62, 0.28, 'ВЛ_ОПОРЫ', 'подкос', 0.6);
      }
      var wires = [];
      (p.fromReport || []).forEach(function (r) { ((d.wiresByKv || {})[String(r.kv).replace('.', ',')] || []).forEach(function (w) { wires.push({ w: w, kv: r.kv }); }); });
      wires.forEach(function (x2) {
        var h = num(x2.w.h_m) || (ref ? ref.h : null); if (!h) return;
        sh.line(x - 16, base - h * sc, x + 16, base - h * sc, 'ВЛ_ПРОВОДА', 0.5);
        sh.circle(x + 16, base - h * sc, 1.2, 'ВЛ_ПРОВОДА', true);
        sh.text(x + 18, base - h * sc + 1.2, clip(x2.w.mark, 30, FS.small) + ' ' + fm(h, 2) + ' м', FS.small);
        var dn = N.wireDistance(x2.kv, x2.w.mark);
        if (dn.value) {
          sh.line(x - 22, base - h * sc, x - 22, base - hc * sc, 'РАЗМЕРЫ', 0.2);
          sh.line(x - 23.5, base - h * sc, x - 20.5, base - h * sc, 'РАЗМЕРЫ', 0.2);
          sh.line(x - 23.5, base - hc * sc, x - 20.5, base - hc * sc, 'РАЗМЕРЫ', 0.2);
          sh.text(x - 24, base - (h + hc) / 2 * sc, '≥' + fm(dn.value, 2), FS.small, { a: 'end', l: 'РАЗМЕРЫ' });
        }
      });
      /* кабель и узел крепления */
      var yk = base - hc * sc;
      if (/анкер|концев|ответвит/.test(sch)) {
        sh.line(x + 1.8, yk, x + 12, yk, 'ВОЛС', 0.8);
        sh.poly([[x + 12, yk - 1.6], [x + 18, yk], [x + 12, yk + 1.6]], true, 'ВОЛС', 0.4);
        sh.line(x - 1.8, yk, x - 12, yk, 'ВОЛС', 0.8);
        sh.poly([[x - 12, yk - 1.6], [x - 18, yk], [x - 12, yk + 1.6]], true, 'ВОЛС', 0.4);
        sh.text(x, yk - 4, 'натяжные зажимы', FS.small, { a: 'middle', l: 'ВОЛС' });
      } else {
        sh.line(x - 12, yk, x + 12, yk, 'ВОЛС', 0.8);
        sh.circle(x + 3, yk, 1.2, 'ВОЛС', true);
        sh.text(x, yk - 4, 'поддерживающий зажим', FS.small, { a: 'middle', l: 'ВОЛС' });
      }
      sh.text(x + 20, yk + 1.2, 'ОК ' + fm(hc, 2) + ' м', FS.small, { l: 'ВОЛС' });
      var g = N.val('tt.dist.ground').value;
      sh.poly([[x - 28, base - g * sc], [x + 34, base - g * sc]], false, 'РАЗМЕРЫ', 0.2, true);
      sh.text(x - 28, base - g * sc - 1.5, 'габарит ' + fm(g, 1) + ' м при наибольшей стреле', FS.small, { l: 'РАЗМЕРЫ' });
      sh.text(x, base + 12, m, FS.head, { a: 'middle', b: true });
      sh.text(x, base + 18, clip((ref ? ref.type : '') + ', опор: ' + ps.length, 90, FS.small), FS.small, { a: 'middle' });
      sh.text(x, base + 23, 'высота ОК: ' + fm(hs[0], 2) + '…' + fm(hs[hs.length - 1], 2) + ' м', FS.small, { a: 'middle' });
      var nStrut = ps.filter(function (q) { return q.design.reinforce; }).length;
      if (nStrut) {
        /* дополнительный подпор — крутой, ниже кабеля и подписей, красным; для опор с
           подкосами — внутри треугольника подкоса */
        var anch = /анкер|концев|ответвит/.test(sch);
        brace(1, anch ? 0.4 : 0.45, anch ? 0.13 : 0.18, 'МУФТЫ', 'подпор', 0.7);
        sh.text(x, base + 28, 'с подпором: ' + nStrut + ' оп. (' + ps.filter(function (q) { return q.design.reinforce; }).map(poleNums).slice(0, 6).join(', ') + ')', FS.small, { a: 'middle', l: 'МУФТЫ', max: 90 });
      }
    });
    sh.note('Расстояния от кабеля до проводов — ТТ № 282р, п. 3.2.2 и ПУЭ-7, пп. 2.4.89, 2.5.197; до элементов опоры — не менее ' + fm(N.val('tt.dist.element').value, 2) + ' м (ТТ № 282р, п. 3.2.3).');
    sh.note('Показана медианная высота подвеса кабеля для марки опоры; высота по каждой опоре приведена в ведомости опор. Анкерные, концевые, угловые и ответвительные опоры показаны с подкосами по типовому проекту.');
    fitSheet(sh);
    out.push(sh);
  }
  return out;
}

/* ---------------------------------------------------------------- узлы крепления */
function nodeSheets(d) {
  var X = global.PDRD_DECIDE, S = global.PDRD_SPEC, tt = X.totals(d);
  var codes = Object.keys(X.NODES).filter(function (k) { return tt.nodes[k]; });
  if (!codes.length) return [];
  var out = [], per = 4;
  for (var i = 0; i < codes.length; i += per) {
    var sh = new Sheet({ kind: 'nodes', title: 'Узлы крепления кабеля (типовые)' + (codes.length > per ? ', лист ' + (i / per + 1) : '') });
    codes.slice(i, i + per).forEach(function (c, j) {
      var x = j * 95 + 35, y = 20;
      var sch = { 'П': 'промежуточная', 'ПУ': 'угловая', 'А2': 'анкерная', 'А1': 'концевая', 'АО': 'ответвительная', 'С': 'анкерная' }[c];
      poleSymbol(sh, x, y, y + 62, sch);
      var yk = y + 26;
      if (/А1|А2|АО|С/.test(c)) {
        var ends = c === 'А1' ? [1] : (c === 'АО' ? [-1, 1, 2] : [-1, 1]);
        ends.forEach(function (e) {
          if (e === 2) { sh.line(x, yk, x + 22, yk + 16, 'ВОЛС', 0.8); sh.text(x + 23, yk + 18, 'ответвление', FS.small); return; }
          var x2 = x + e * 24;
          sh.line(x + e * 2, yk, x2, yk, 'ВОЛС', 0.8);
          sh.poly([[x2 - 4 * e, yk - 1.8], [x2, yk], [x2 - 4 * e, yk + 1.8]], true, 'ВОЛС', 0.4);
        });
        sh.text(x, yk - 4, 'натяжной зажим', FS.small, { a: 'middle', l: 'ВОЛС' });
      } else {
        sh.line(x - 26, yk, x + 26, yk, 'ВОЛС', 0.8);
        sh.circle(x + 3, yk, 1.4, 'ВОЛС', true);
        sh.text(x, yk - 4, 'поддерживающий зажим', FS.small, { a: 'middle', l: 'ВОЛС' });
      }
      if (c === 'С') {
        sh.poly([[x + 6, yk + 8], [x + 1, yk + 17], [x + 11, yk + 17]], true, 'МУФТЫ', 0.5);
        sh.text(x + 13, yk + 15, 'муфта', FS.small);
        sh.circle(x + 6, yk + 25, 4.5, 'МУФТЫ', false);
        sh.text(x + 13, yk + 26, 'запас кабеля', FS.small);
      }
      sh.text(x, y - 6, c + ' — ' + clip(X.NODES[c], 120, FS.small), FS.text, { a: 'middle', b: true });
      var kit = (S.NODE_KIT[c] || []).map(function (k2) { return k2[0] + ' — ' + k2[1] + ' шт.'; })
        .concat(['Кронштейн (бандаж) крепления — 1 компл.', 'Бирка маркировочная — 1 шт.', 'Узлов в проекте: ' + tt.nodes[c]]);
      kit.forEach(function (t2, k3) { sh.text(x - 34, y + 76 + k3 * 5.5, clip(t2, 92, FS.small), FS.small, { b: k3 === kit.length - 1 }); });
    });
    sh.note('Арматура — заводского исполнения по ГОСТ Р 51177-2017 с паспортами, сертификатами или декларациями соответствия; марки — по утверждённому каталогу.');
    sh.note('Прочность заделки кабеля в натяжном зажиме — не менее 90 % разрывной прочности кабеля (ТТ № 282р, п. 3.3). Бирка крепится не далее 0,10 м от места крепления (ТТ № 282р, п. 3.1).');
    fitSheet(sh);
    out.push(sh);
  }
  return out;
}

/* ---------------------------------------------------------------- монтажные таблицы */
function montageSheets(d) {
  var D = global.PDRD_DESIGN, C = global.PDRD_CALC, res = d.calcResult;
  if (!D || !C || !res) return [];
  var inp = D.inputs(d);
  var reg = null; try { reg = C.regimes({ tMax: inp.tMax, tMin: inp.tMin, tAvg: inp.tAvg, altitude: inp.altitude }); } catch (e) { reg = null; }
  if (inp.miss.length || !reg) return montageForm(d, D.sections(d), inp);
  var secs = D.sections(d), out = [], sh = null, y = 0, rowH = 5.5, colW = 30, w0 = 60;
  var maxY = 210;
  secs.forEach(function (s) {
    var ld, sol;
    try {
      ld = C.loads({ d_mm: inp.cab.d_mm, mass_kg_km: inp.cab.mass_kg_km }, { W0: inp.W0, bE: inp.bE, terrain: inp.terrain, kv: s.kv, iceRegion: inp.iceRegion, h: inp.cableH, L: s.Lr, purpose: 'wire' });
      sol = C.solveSection(inp.cab, ld, reg, s.Lr);
    } catch (e) { return; }
    var spans = s.spans.slice(0, 10), temps = [];
    for (var t = Math.ceil(inp.tMin / 10) * 10; t <= inp.tMax; t += 10) temps.push(t);
    var mt = C.montageTable(inp.cab, ld, sol, spans.map(function (x) { return x.L; }), temps[0], temps[temps.length - 1], 10);
    var nRows = spans.length + 2;
    var need = rowH * nRows + 12;
    if (!sh || y + need > maxY) { sh = new Sheet({ kind: 'montage', title: 'Монтажные таблицы стрел провеса и тяжений' }); out.push(sh); y = 0; }
    sh.text(0, y + FS.text, s.id + ' — ' + clip(s.line, 150, FS.text) + '; приведённый пролёт ' + fm(s.Lr, 1) + ' м', FS.text, { b: true });
    var y0 = y + FS.text + 2.5, tblW = w0 + temps.length * colW;
    /* сетка таблицы: внешняя рамка и разделители по одной геометрии */
    sh.rect(0, y0, tblW, rowH * nRows, 'РАЗМЕРЫ', 0.4);
    for (var r2 = 1; r2 < nRows; r2++) sh.line(0, y0 + r2 * rowH, tblW, y0 + r2 * rowH, 'РАЗМЕРЫ', 0.2);
    for (var c3 = 0; c3 <= temps.length; c3++) {
      var xg = w0 + c3 * colW - (c3 === 0 ? colW : 0);
      if (c3 === 0) xg = w0;
      sh.line(xg, y0, xg, y0 + rowH * nRows, 'РАЗМЕРЫ', c3 === 0 ? 0.4 : 0.2);
    }
    var base = y0 + rowH * 0.72;
    sh.text(1.2, base, 'Пролёт / температура, °C', FS.small, { max: w0 - 2.4 });
    temps.forEach(function (tv, i2) { sh.text(w0 + i2 * colW + colW / 2, base, String(tv), FS.small, { a: 'middle', max: colW - 2 }); });
    sh.text(1.2, base + rowH, 'Тяжение H, кН', FS.small, { max: w0 - 2.4 });
    mt.forEach(function (r3, i3) { sh.text(w0 + i3 * colW + colW / 2, base + rowH, fm(r3.H / 1000, 3), FS.small, { a: 'middle', max: colW - 2 }); });
    spans.forEach(function (sp, k) {
      var yy = base + rowH * (k + 2);
      sh.text(1.2, yy, clip(sp.from.rec.num + '–' + sp.to.rec.num + ' (' + fm(sp.L, 0) + ' м), стрела f, м', w0 - 2.4, FS.small), FS.small);
      mt.forEach(function (r4, i4) { sh.text(w0 + i4 * colW + colW / 2, yy, fm(r4.sags[k], 2), FS.small, { a: 'middle', max: colW - 2 }); });
    });
    y = y0 + rowH * nRows + 3;
    if (s.spans.length > spans.length) { sh.text(1.2, y + FS.small, 'Ещё ' + (s.spans.length - spans.length) + ' пролётов участка — в ведомости пролётов (XLSX)', FS.small); y += FS.small + 2; }
    y += 6;
  });
  out.forEach(function (x) {
    x.note('Стрела провеса f — в середине пролёта при температуре монтажа; тяжение H — горизонтальная составляющая, одна на анкерный участок.');
    x.note('Монтаж выполнять с контролем тяжения динамометром; значения — расчёт PD_RD по ПУЭ-7, пп. 2.5.71, 2.5.185.');
    fitSheet(x, { max: 1.6 });
  });
  return out;
}

/* Монтажные таблицы при неполных исходных данных: форма с анкерными участками и
   пролётами, значения — после ввода данных; перечень недостающих данных — в примечаниях */
function montageForm(d, secs, inp) {
  if (!secs.length) return [];
  var out = [], sh = null, y = 0, rowH = 5.5, colW = 30, w0 = 60, maxY = 210;
  var temps = [];
  var tMin = inp.tMin !== null ? inp.tMin : -30, tMax = inp.tMax !== null ? inp.tMax : 40;
  for (var t0 = Math.ceil(tMin / 10) * 10; t0 <= tMax; t0 += 10) temps.push(t0);
  secs.forEach(function (s) {
    var spans = s.spans.slice(0, 10), nRows = spans.length + 2;
    if (!sh || y + rowH * nRows + 12 > maxY) { sh = new Sheet({ kind: 'montage', title: 'Монтажные таблицы стрел провеса и тяжений' }); out.push(sh); y = 0; }
    sh.text(0, y + FS.text, s.id + ' — ' + clip(s.line, 150, FS.text) + '; приведённый пролёт ' + fm(s.Lr, 1) + ' м', FS.text, { b: true });
    var y0 = y + FS.text + 2.5, tblW = w0 + temps.length * colW;
    sh.rect(0, y0, tblW, rowH * nRows, 'РАЗМЕРЫ', 0.4);
    for (var r2 = 1; r2 < nRows; r2++) sh.line(0, y0 + r2 * rowH, tblW, y0 + r2 * rowH, 'РАЗМЕРЫ', 0.2);
    for (var c3 = 0; c3 <= temps.length; c3++) sh.line(w0 + c3 * colW, y0, w0 + c3 * colW, y0 + rowH * nRows, 'РАЗМЕРЫ', c3 === 0 ? 0.4 : 0.2);
    var base = y0 + rowH * 0.72;
    sh.text(1.2, base, 'Пролёт / температура, °C', FS.small, { max: w0 - 2.4 });
    temps.forEach(function (tv, i2) { sh.text(w0 + i2 * colW + colW / 2, base, String(tv), FS.small, { a: 'middle' }); });
    sh.text(1.2, base + rowH, 'Тяжение H, кН', FS.small, { max: w0 - 2.4 });
    temps.forEach(function (tv, i3) { sh.text(w0 + i3 * colW + colW / 2, base + rowH, '—', FS.small, { a: 'middle' }); });
    spans.forEach(function (sp, k) {
      var yy = base + rowH * (k + 2);
      sh.text(1.2, yy, clip(sp.from.rec.num + '–' + sp.to.rec.num + ' (' + fm(sp.L, 0) + ' м), стрела f, м', w0 - 2.4, FS.small), FS.small);
      temps.forEach(function (tv, i4) { sh.text(w0 + i4 * colW + colW / 2, yy, '—', FS.small, { a: 'middle' }); });
    });
    y = y0 + rowH * nRows + 6;
  });
  out.forEach(function (x) {
    x.note('Значения стрел провеса и тяжений не рассчитаны: не хватает исходных данных — ' + inp.miss.map(function (m) { return m.text; }).join('; ') + '. Таблицы заполнятся автоматически после ввода данных на странице «Расчёты»; выпуск до этого заблокирован.');
    fitSheet(x, { max: 1.6 });
  });
  return out;
}

/* ---------------------------------------------------------------- пересечения */
function crossingSheets(d) {
  var cr = global.PDRD_TEXTS ? global.PDRD_TEXTS.crossings(d) : (d.crossings || []);
  if (!cr.length) return [];
  var out = [], per = 4;
  for (var i = 0; i < cr.length; i += per) {
    var sh = new Sheet({ kind: 'cross', title: 'Схемы пересечений' + (cr.length > per ? ', лист ' + (i / per + 1) : '') });
    cr.slice(i, i + per).forEach(function (c, j) {
      var x = (j % 2) * 200, y = Math.floor(j / 2) * 110, sc = 9;
      sh.text(x, y, clip((c.line || '') + ', пролёт ' + c.from + ' — ' + c.to, 190, FS.text), FS.text, { b: true });
      sh.text(x, y + 5.5, clip((c.object || '') + (c.kind ? ' (' + c.kind + ')' : ''), 190, FS.small), FS.small);
      var base = y + 80;
      sh.line(x, base, x + 175, base, 'РАЗМЕРЫ', 0.4);
      poleSymbol(sh, x + 8, base - 8 * sc, base, 'анкерная');
      poleSymbol(sh, x + 167, base - 8 * sc, base, 'анкерная');
      var pts = [];
      for (var k = 0; k <= 24; k++) { var xx = x + 8 + k * 159 / 24, s2 = 4 * (k / 24) * (1 - k / 24); pts.push([xx, base - (6.5 - 1.6 * s2) * sc]); }
      sh.poly(pts, false, 'ВОЛС', 0.9);
      sh.rect(x + 70, base - 7, 45, 7, 'ПЕРЕСЕЧЕНИЯ', 0.5);
      sh.text(x + 92, base - 2, clip(c.object || 'пересекаемый объект', 43, FS.small), FS.small, { a: 'middle', l: 'ПЕРЕСЕЧЕНИЯ' });
      sh.line(x + 120, base - 4.9 * sc, x + 120, base - 7, 'РАЗМЕРЫ', 0.3);
      sh.text(x + 122, base - 30, 'требуемый габарит ≥ ' + fm(num(c.h_req_m), 2) + ' м', FS.small, { l: 'РАЗМЕРЫ' });
      sh.text(x + 122, base - 25, 'расчётный габарит ' + fm(c.h_calc_m, 2) + ' м', FS.small, { l: 'РАЗМЕРЫ' });
      sh.text(x + 122, base - 20, clip(c.ref || '', 70, FS.small), FS.small, { l: 'РАЗМЕРЫ' });
    });
    sh.note('Габариты проверяются при наибольшей стреле провеса кабеля; основание указано для каждого пересечения.');
    fitSheet(sh);
    out.push(sh);
  }
  return out;
}

/* ---------------------------------------------------------------- гасители */
function damperSheets(d) {
  var ps = d.poles.filter(function (p) { return onRoute(p) && p.design && p.design.dampers; });
  if (!ps.length) return [];
  var sh = new Sheet({ kind: 'dampers', title: 'Схема установки гасителей вибрации' });
  var x = 40, y = 20;
  poleSymbol(sh, x, y, y + 70, 'анкерная');
  sh.line(x - 60, y + 26, x + 150, y + 26, 'ВОЛС', 0.9);
  [[x + 28, 'гаситель'], [x - 28, 'гаситель']].forEach(function (g) {
    sh.line(g[0], y + 26, g[0], y + 34, 'МУФТЫ', 0.5);
    sh.rect(g[0] - 7, y + 34, 14, 4, 'МУФТЫ', 0.5);
    sh.text(g[0], y + 43, g[1], FS.small, { a: 'middle' });
  });
  sh.text(x + 60, y + 20, 'Расстояние от зажима до гасителя — по паспорту кабеля и СО 34.20.265-2005', FS.small);
  var txt = ps.map(function (p) { return poleNums(p) + ' ' + p.mark; }).join('; ');
  sh.text(0, y + 80, 'Опоры с гасителями (' + ps.length + '):', FS.text, { b: true });
  var lines = txt.match(/.{1,120}(;|$)/g) || [];
  lines.slice(0, 16).forEach(function (l, i) { sh.text(0, y + 88 + i * 5, l.trim(), FS.small); });
  sh.note('Гасители устанавливаются на пролётах, длина которых не менее указанной изготовителем кабеля; по два на опору.');
  fitSheet(sh);
  return [sh];
}

/* ---------------------------------------------------------------- распределительная сеть */
function gponSheets(d) {
  if (!(d.profile && d.profile.operator === 'rostelecom-b2c-gpon')) return [];
  var sl = d.poles.filter(function (p) { return onRoute(p) && p.design && p.design.sleeve; });
  if (!sl.length) return [];
  var sh = new Sheet({ kind: 'gpon', title: 'Схема распределительной сети (точки подключения)' });
  var byLine = {};
  sl.forEach(function (p) { var l = ((p.lines || [])[0] || {}).lineId || ''; (byLine[l] = byLine[l] || []).push(p); });
  var y = 0;
  Object.keys(byLine).slice(0, 30).forEach(function (l) {
    sh.text(0, y, clip(l, 130, FS.small), FS.small);
    byLine[l].slice(0, 16).forEach(function (p, i) {
      var x = 140 + i * 16;
      sh.poly([[x, y - 4], [x - 2.6, y + 1], [x + 2.6, y + 1]], true, 'МУФТЫ', 0.4);
      sh.text(x, y + 5, poleNums(p), FS.small, { a: 'middle', max: 15 });
      if (i) sh.line(x - 13, y - 1.5, x - 3, y - 1.5, 'ВОЛС', 0.5);
    });
    y += 12;
  });
  sh.note('Узлы распределительной сети на опорах ВЛ — муфты и оптические распределительные шкафы. Абонентские ответвления в пролётах прокладываются только в жгуте (ТТ № 282р, п. 3.1).');
  fitSheet(sh);
  return [sh];
}

/* ---------------------------------------------------------------- ПОС */
function posSheets(d) {
  var T = global.PDRD_TEXTS; if (!T || !d.poles.some(onRoute)) return [];
  var data = { fields: {}, tables: {}, blocks: {}, cond: {} };
  T.extend(data, d, { code: 'ПОС' }, { noSheets: true });
  var tb = data.tables['КАЛЕНДАРНЫЙ_ПЛАН']; if (!tb) return [];
  var sh = new Sheet({ kind: 'pos', title: 'Календарный план и схема организации работ' });
  var total = +tb.rows[tb.rows.length - 1][1] || 1, day = Math.max(2, 180 / total), x0 = 0, y = 10;
  sh.text(x0, 0, 'Календарный план производства работ, рабочие дни', FS.head, { b: true });
  for (var k = 0; k <= total; k += Math.max(1, Math.round(total / 10))) {
    sh.line(x0 + 110 + k * day, y, x0 + 110 + k * day, y + 9 * tb.rows.length, 'РАЗМЕРЫ', 0.15);
    sh.text(x0 + 110 + k * day, y - 2, String(k), FS.small, { a: 'middle' });
  }
  var t0 = 0;
  tb.rows.slice(0, -1).forEach(function (r, i) {
    var dd = +r[1];
    sh.text(x0, y + 7 + i * 9, clip(r[0], 105, FS.small), FS.small);
    sh.rect(x0 + 110 + t0 * day, y + 3 + i * 9, Math.max(1, dd * day), 5, 'ВОЛС', 0.5);
    t0 += dd;
  });
  var yy = y + 9 * tb.rows.length + 12;
  sh.text(x0, yy, 'Организация работ', FS.head, { b: true });
  ['Работы выполняются в охранной зоне ВЛ по наряду-допуску, с допуском представителем владельца инфраструктуры.',
   'Автогидроподъёмник устанавливается вне проезжей части либо с ограждением места работ.',
   'Раскатка кабеля — с барабана через раскаточные ролики на опорах с контролем тяжения динамометром.',
   'Стрелы провеса устанавливаются по монтажным таблицам для температуры воздуха при монтаже.'].forEach(function (t, i) {
    sh.text(x0, yy + 8 + i * 6, '— ' + clip(t, 260, FS.small), FS.small);
  });
  sh.note('Продолжительность этапов рассчитана по объёмам работ и параметрам производительности, принятым в проекте (страница «Проект»).');
  fitSheet(sh);
  return [sh];
}

/* ---------------------------------------------------------------- типовые листы филиала */
function ellipse(sh, cx, cy, rx, ry, layer, w, rot) {
  var pts = [], a = (rot || 0) * Math.PI / 180;
  for (var i = 0; i <= 36; i++) {
    var u = i / 36 * 2 * Math.PI, x = rx * Math.cos(u), y = ry * Math.sin(u);
    pts.push([cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)]);
  }
  sh.poly(pts, false, layer, w);
}
function leader(sh, x1, y1, x2, y2, label) {
  sh.line(x1, y1, x2, y2, 'РАЗМЕРЫ', 0.25);
  sh.line(x2, y2, x2 + tw(label, FS.text) + 2, y2, 'РАЗМЕРЫ', 0.25);
  sh.text(x2 + 1, y2 - 1, label, FS.text, { l: 'ТЕКСТ' });
}
function dimV(sh, x, y1, y2, label) {
  sh.line(x, y1, x, y2, 'РАЗМЕРЫ', 0.25);
  sh.line(x - 1.5, y1, x + 1.5, y1, 'РАЗМЕРЫ', 0.25); sh.line(x - 1.5, y2, x + 1.5, y2, 'РАЗМЕРЫ', 0.25);
  sh.text(x - 1.5, (y1 + y2) / 2, label, FS.text, { a: 'middle', rot: -90, l: 'РАЗМЕРЫ' });
}
/* Таблица спецификации узла на листе */
function nodeSpec(sh, x, y, rows) {
  var cols = [[10, 'Поз.'], [42, 'Обозначение'], [62, 'Наименование'], [12, 'Кол.'], [16, 'Масса ед., кг'], [18, 'Примечание']];
  var W2 = cols.reduce(function (a, c) { return a + c[0]; }, 0), rh = 8;
  sh.rect(x, y, W2, rh * (rows.length + 1), 'РАЗМЕРЫ', 0.4);
  var cx = x;
  cols.forEach(function (c, i) {
    if (i) sh.line(cx, y, cx, y + rh * (rows.length + 1), 'РАЗМЕРЫ', 0.25);
    sh.text(cx + c[0] / 2, y + rh * 0.65, c[1], FS.small, { a: 'middle', max: c[0] - 1 });
    cx += c[0];
  });
  rows.forEach(function (r, k) {
    var yy = y + rh * (k + 1);
    sh.line(x, yy, x + W2, yy, 'РАЗМЕРЫ', k ? 0.25 : 0.4);
    var cx2 = x;
    r.forEach(function (v, i) {
      var c = cols[i], txt = v === null || v === undefined ? '' : String(v).replace('.', ',');
      if (i === 2 && tw(txt, FS.small) > c[0] - 2) {
        var cut = Math.floor((c[0] - 2) / (FS.small * 0.6)), sp = txt.lastIndexOf(' ', cut);
        if (sp < 10) sp = cut;
        sh.text(cx2 + 1, yy + rh * 0.42, txt.slice(0, sp), FS.small, { max: c[0] - 2 });
        sh.text(cx2 + 1, yy + rh * 0.85, txt.slice(sp).trim(), FS.small, { max: c[0] - 2 });
      } else sh.text(i === 2 ? cx2 + 1 : cx2 + c[0] / 2, yy + rh * 0.65, txt, FS.small, { a: i === 2 ? 'start' : 'middle', max: c[0] - 2 });
      cx2 += c[0];
    });
  });
  return { w: W2, h: rh * (rows.length + 1) };
}
function cat(d, key) { var S = global.PDRD_SPEC; return S ? S.catalogOf(d, key) : { type: '', mass: '' }; }
function stand(sh, x, yTop, yBase, w) {
  sh.rect(x - w / 2, yTop, w, yBase - yTop, 'ВЛ_ОПОРЫ', 0.6);
  sh.line(x - 14, yBase, x + 14, yBase, 'ВЛ_ОПОРЫ', 0.5);
  [-10, -4, 2, 8].forEach(function (k) { sh.line(x + k, yBase, x + k - 3, yBase + 3, 'ВЛ_ОПОРЫ', 0.25); });
}
function polePic(sh, x, yTop, yBase, label, kv10) {
  sh.rect(x - 2, yTop, 4, yBase - yTop + 8, 'ВЛ_ОПОРЫ', 0.5);
  sh.line(x - 7, yTop + 3, x + 7, yTop + 3, 'ВЛ_ОПОРЫ', 0.5);
  [-6, 6].forEach(function (k) { sh.circle(x + k, yTop + 1.2, 1.1, 'ВЛ_ОПОРЫ', false); });
  if (kv10) { sh.line(x, yTop - 6, x, yTop, 'ВЛ_ОПОРЫ', 0.5); sh.circle(x, yTop - 7, 1.2, 'ВЛ_ОПОРЫ', false); }
  wrap(sh, label, x, yTop - (kv10 ? 20 : 14), FS.text, 50, 3, 'ТЕКСТ');
}

/* Профиль пересечения с автодорогой. kvs: '0,4' или '0,4-10' */
function crossProfile(d, mode) {
  var N = global.PDRD_NORMS, cr = (global.PDRD_TEXTS ? global.PDRD_TEXTS.crossings(d) : (d.crossings || []))
    .filter(function (c) { return /дорог|шоссе|трасс/i.test((c.object || '') + ' ' + (c.kind || '')); });
  var hC = num((d.designDefaults || {}).cableH) || 6, g = N.val('tt.dist.ground').value;
  var c0 = cr[0] || null;
  var title = mode === '0,4' ? 'Профиль пересечения с автодорогой в пролёте опор ВЛ 0,4 кВ ПАО «Россети Юг» — «Кубаньэнерго»'
                             : 'Профиль пересечения с автодорогой в пролёте опор ВЛ 0,4–10 кВ ПАО «Россети Юг» — «Кубаньэнерго»';
  var sh = new Sheet({ kind: 'typical', title: title });
  var xL = 30, xR = 290, base = 140, v = 12;           // 1 м = 12 мм по вертикали
  var yA = base - hC * v;
  polePic(sh, xL, yA - 8, base, 'Опора ВЛ-0,4 кВ ПАО «Россети Юг»', false);
  polePic(sh, xR, yA - 8, base, mode === '0,4' ? 'Опора ВЛ-0,4 кВ ПАО «Россети Юг»' : 'Опора ВЛ-10 кВ ПАО «Россети Юг»', mode !== '0,4');
  sh.line(xL - 20, base, xR + 20, base, 'РАЗМЕРЫ', 0.5);
  [xL, xR].forEach(function (x) { sh.circle(x, yA, 3, 'ВОЛС', false); sh.circle(x, yA, 1.6, 'ВОЛС', false); });
  var fN = c0 && c0.fmax ? c0.fmax * 0.6 : (hC - g) * 0.35, fM = c0 && c0.fmax ? c0.fmax : (hC - g) * 0.8;
  function sagCurve(f, dash) {
    var pts = [];
    for (var i = 0; i <= 30; i++) { var s = i / 30; pts.push([xL + (xR - xL) * s, yA + 4 * s * (1 - s) * f * v]); }
    sh.poly(pts, false, 'ВОЛС', 0.7, dash);
  }
  sagCurve(fN, false); sagCurve(fM, false);
  var mid = (xL + xR) / 2, yMax = yA + fM * v;
  sh.poly([[mid - 24, base], [mid - 18, base - 3], [mid + 18, base - 3], [mid + 24, base]], true, 'ПЕРЕСЕЧЕНИЯ', 0.6);
  leader(sh, mid - 5, base - 2, mid - 90, base - 14, 'А/дорога' + (c0 ? ' (' + clip(c0.object, 40, FS.text) + ')' : ''));
  leader(sh, mid - 25, yA + 4 * 0.4 * 0.6 * fN * v, mid - 70, yA - 14, 'Проектируемый ВОК в режиме нормальной нагрузки');
  leader(sh, mid - 30, yA + fM * v * 0.9, mid - 90, yMax + 18, 'Проектируемый ВОК в режиме наибольшей нагрузки');
  dimV(sh, mid + 35, yMax, base - 3, 'не менее ' + fm(g, 1) + ' м');
  dimV(sh, xL - 10, yA, base, fm(hC, 1) + ' м');
  dimV(sh, xR + 10, yA, base, fm(hC, 1) + ' м');
  sh.line(xL, base + 14, xR, base + 14, 'РАЗМЕРЫ', 0.25);
  [xL, xR].forEach(function (x) { sh.line(x, base + 10, x, base + 17, 'РАЗМЕРЫ', 0.25); });
  sh.text(mid, base + 12.5, 'Длина пролёта' + (c0 && c0.L ? ' ' + fm(c0.L, 0) + ' м' : ''), FS.text, { a: 'middle' });
  sh.note('Стрела провеса проектируемого кабеля указана при нормальных условиях. Согласно ПУЭ (7 издание), пункт 2.5.197, расстояние от фазных проводов до волоконно-оптического кабеля на опорах ВЛ до 35 кВ должно быть не менее 0,6 м.');
  if (c0) sh.note('Пересечение: ' + (c0.line || '') + ', пролёт ' + c0.from + ' — ' + c0.to + '; требуемый габарит ' + fm(num(c0.h_req_m), 2) + ' м (' + (c0.ref || '') + ')' + (c0.h_calc_m ? '; расчётный ' + fm(c0.h_calc_m, 2) + ' м' : '') + '.');
  else sh.note('Типовой профиль: высота подвеса — по проекту (' + fm(hC, 1) + ' м), габарит до проезжей части — не менее ' + fm(g, 1) + ' м (ТТ № 282р, п. 3.2.4; ПУЭ-7, п. 2.5.197).');
  fitSheet(sh);
  return sh;
}

/* ---- графика типовых узлов: стойка в аксонометрии, штриховка, спиральные зажимы ---- */
var OBL = { dx: 0.62, dy: -0.36 };        /* косоугольная проекция: смещение глубины */
function prism(sh, x, yTop, w, h, dep, cut) {
  /* лицевая грань, правая грань, верхняя грань; cut — обрыв снизу волнистой линией */
  var ox = dep * OBL.dx, oy = dep * OBL.dy;
  sh.line(x, yTop, x, yTop + h, 'ВЛ_ОПОРЫ', 0.5); sh.line(x + w, yTop, x + w, yTop + h, 'ВЛ_ОПОРЫ', 0.5);
  sh.line(x + w + ox, yTop + oy, x + w + ox, yTop + h + oy, 'ВЛ_ОПОРЫ', 0.5);
  sh.poly([[x, yTop], [x + ox, yTop + oy], [x + w + ox, yTop + oy], [x + w, yTop]], true, 'ВЛ_ОПОРЫ', 0.5);
  sh.line(x, yTop, x + w, yTop, 'ВЛ_ОПОРЫ', 0.5);
  if (cut) {
    var pts = [], n = 8;
    for (var i = 0; i <= n; i++) pts.push([x + (w + ox) * i / n, yTop + h + (i % 2 ? 1.2 : -1.2) + oy * i / n]);
    sh.poly(pts, false, 'ВЛ_ОПОРЫ', 0.3);
  } else sh.line(x, yTop + h, x + w, yTop + h, 'ВЛ_ОПОРЫ', 0.5);
}
function hatch(sh, pts, step) {
  /* штриховка выпуклого многоугольника под 45° */
  var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  for (var c = x0 - (y1 - y0); c < x1; c += step) {
    var p1 = [c, y1], p2 = [c + (y1 - y0), y0], seg = clipPoly(p1, p2, pts);
    if (seg) sh.line(seg[0][0], seg[0][1], seg[1][0], seg[1][1], 'ВЛ_ОПОРЫ', 0.18);
  }
  sh.poly(pts, true, 'ВЛ_ОПОРЫ', 0.5);
}
function clipPoly(a, b, poly) {
  /* отсечение отрезка выпуклым многоугольником (Cyrus–Beck) */
  var t0 = 0, t1 = 1, d = [b[0] - a[0], b[1] - a[1]], n = poly.length;
  var area = 0; for (var k = 0; k < n; k++) { var q1 = poly[k], q2 = poly[(k + 1) % n]; area += q1[0] * q2[1] - q2[0] * q1[1]; }
  var sgn = area > 0 ? 1 : -1;
  for (var i = 0; i < n; i++) {
    var p = poly[i], q = poly[(i + 1) % n];
    var nx = sgn * (q[1] - p[1]), ny = -sgn * (q[0] - p[0]);
    var num2 = nx * (a[0] - p[0]) + ny * (a[1] - p[1]), den = nx * d[0] + ny * d[1];
    if (Math.abs(den) < 1e-12) { if (num2 > 0) return null; continue; }
    var tt = -num2 / den;
    if (den < 0) { if (tt > t0) t0 = tt; } else { if (tt < t1) t1 = tt; }
    if (t0 > t1) return null;
  }
  return [[a[0] + d[0] * t0, a[1] + d[1] * t0], [a[0] + d[0] * t1, a[1] + d[1] * t1]];
}
function spiral(sh, x1, y1, x2, y2, r) {
  /* спиральный зажим (протектор): утолщение кабеля с витками */
  var L = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / L, uy = (y2 - y1) / L, nx = -uy * r, ny = ux * r;
  sh.poly([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]], true, 'ВОЛС', 0.35);
  for (var s = 0; s < L; s += r * 1.1) {
    var px = x1 + ux * s, py = y1 + uy * s;
    sh.line(px + nx, py + ny, px + ux * r * 0.9 - nx, py + uy * r * 0.9 - ny, 'ВОЛС', 0.2);
  }
}
function turnbuckle(sh, x, y, ang, len) {
  var c = Math.cos(ang), s = Math.sin(ang), w = 1.4;
  function P(u, v) { return [x + u * c - v * s, y + u * s + v * c]; }
  sh.poly([P(0, 0), P(len * 0.2, -w), P(len * 0.8, -w), P(len, 0), P(len * 0.8, w), P(len * 0.2, w)], true, 'ВОЛС', 0.4);
  sh.line(P(len * 0.35, -w)[0], P(len * 0.35, -w)[1], P(len * 0.35, w)[0], P(len * 0.35, w)[1], 'ВОЛС', 0.2);
  sh.line(P(len * 0.65, -w)[0], P(len * 0.65, -w)[1], P(len * 0.65, w)[0], P(len * 0.65, w)[1], 'ВОЛС', 0.2);
}
function band(sh, x, y, w, dep) {
  /* ленточный хомут на стойке: полоса по лицевой и боковой граням */
  var ox = dep * OBL.dx, oy = dep * OBL.dy;
  sh.line(x - 0.6, y, x + w, y, 'РАЗМЕРЫ', 0.6); sh.line(x + w, y, x + w + ox, y + oy, 'РАЗМЕРЫ', 0.6);
  sh.line(x - 0.6, y + 1.4, x + w, y + 1.4, 'РАЗМЕРЫ', 0.3); sh.line(x + w, y + 1.4, x + w + ox, y + 1.4 + oy, 'РАЗМЕРЫ', 0.3);
}
function tag(sh, x1, y1, x2, y2, label, left) {
  /* позиционная выноска: наклонная линия и полка с номером */
  sh.line(x1, y1, x2, y2, 'РАЗМЕРЫ', 0.25);
  var w2 = Math.max(6, tw(label, FS.text) + 2);
  sh.line(x2, y2, left ? x2 - w2 : x2 + w2, y2, 'РАЗМЕРЫ', 0.25);
  sh.text(left ? x2 - w2 / 2 : x2 + w2 / 2, y2 - 1, label, FS.text, { a: 'middle' });
  sh.circle(x1, y1, 0.5, 'РАЗМЕРЫ', true);
}
function coil(sh, cx, cy, rx, ry, rot) {
  [0, 1.2, 2.4, 3.6].forEach(function (k) { ellipse(sh, cx, cy, rx - k, ry - k, 'ВОЛС', k ? 0.3 : 0.5, rot); });
  var a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  function E(u, v) { return [cx + u * c - v * s, cy + u * s + v * c]; }
  var p1 = E(-rx, 0), p2 = E(rx, 0), p3 = E(0, -ry), p4 = E(0, ry);
  sh.line(p1[0], p1[1], p2[0], p2[1], 'ВЛ_ОПОРЫ', 0.6); sh.line(p3[0], p3[1], p4[0], p4[1], 'ВЛ_ОПОРЫ', 0.6);
  [p1, p2, p3, p4].forEach(function (q) { sh.line(q[0] - 1.5, q[1] - 1, q[0] + 1.5, q[1] + 1, 'ВЛ_ОПОРЫ', 0.6); });
}
function sleeveCyl(sh, cx, y, r, h) {
  ellipse(sh, cx, y, r, r * 0.35, 'МУФТЫ', 0.5, 0);
  sh.line(cx - r, y, cx - r, y + h, 'МУФТЫ', 0.5); sh.line(cx + r, y, cx + r, y + h, 'МУФТЫ', 0.5);
  var pts = []; for (var i = 0; i <= 18; i++) { var u = Math.PI * i / 18; pts.push([cx + r * Math.cos(u), y + h + r * 0.35 * Math.sin(u)]); }
  sh.poly(pts, false, 'МУФТЫ', 0.5);
  sh.line(cx - r, y + h * 0.3, cx + r, y + h * 0.3, 'МУФТЫ', 0.25);
}
/* узел натяжной УН.П на лицевой грани стойки: пластина с болтами и проушинами */
function tensNode(sh, x, y, w, dep, reach) {
  var ox = dep * OBL.dx, oy = dep * OBL.dy;
  sh.poly([[x - reach, y], [x + w + reach, y], [x + w + reach + 3, y - 2], [x - reach + 3, y - 2]], true, 'ВЛ_ОПОРЫ', 0.5);
  sh.poly([[x - reach, y], [x + w + reach, y], [x + w + reach, y + 2.2], [x - reach, y + 2.2]], true, 'ВЛ_ОПОРЫ', 0.4);
  [x - reach + 2.5, x + w + reach - 2.5].forEach(function (bx) { sh.circle(bx + 1, y - 1, 0.9, 'ВЛ_ОПОРЫ', false); });
  sh.line(x + w + ox * 0.5, y - 1 + oy * 0.5, x + w + reach, y - 1, 'ВЛ_ОПОРЫ', 0.3);
  return { left: [x - reach - 1, y + 1], right: [x + w + reach + 3, y - 1] };
}

function sleeveSheet(d) {
  var sh = new Sheet({ kind: 'typical', title: 'Натяжное крепление ОК с размещением муфты и запаса кабеля на стойке типа СВ' });
  sh.text(165, -6, 'Натяжное крепление ОК с размещением муфты', FS.head, { a: 'middle' });
  sh.text(165, 0, 'и запаса кабеля на стойке типа СВ', FS.head, { a: 'middle' });
  [[70, true], [240, false]].forEach(function (v2) {
    var x = v2[0], withSleeve = v2[1], W2 = 16, DEP = 12;
    prism(sh, x, 8, W2, 205, DEP, true);
    sh.text(x - 64, 42, 'Стойка типа СВ', FS.small);
    var nd = tensNode(sh, x, 62, W2, DEP, 9);
    /* левая ветвь кабеля: натяжной комплект со спиралью и талрепом */
    turnbuckle(sh, nd.left[0], nd.left[1], Math.PI - 0.52, 12);
    var lx = nd.left[0] - 12 * Math.cos(0.52), ly = nd.left[1] + 12 * Math.sin(0.52);
    spiral(sh, lx, ly, lx - 34, ly + 20, 1.2);
    sh.line(lx - 34, ly + 20, lx - 58, ly + 34, 'ВОЛС', 0.8);
    /* правая ветвь */
    turnbuckle(sh, nd.right[0], nd.right[1], -0.52, 10);
    var rx = nd.right[0] + 10 * Math.cos(0.52), ry = nd.right[1] - 10 * Math.sin(0.52);
    spiral(sh, rx, ry, rx + 34, ry - 20, 1.2);
    sh.line(rx + 34, ry - 20, rx + 56, ry - 33, 'ВОЛС', 0.8);
    /* шлейф ОК: от спиралей огибает стойку и уходит вниз к запасу */
    sh.poly([[lx - 6, ly + 4], [x - 4, ly + 12], [x + W2 + 2, ly + 10], [x + W2 + 8, 88], [x + W2 + 6, 110], [x + W2 + 2, 124]], false, 'ВОЛС', 0.6);
    sh.poly([[rx + 6, ry - 2], [x + W2 + 16, 72], [x + W2 + 12, 96], [x + W2 + 8, 122]], false, 'ВОЛС', 0.6);
    /* зажим шлейфовый столбовой */
    sh.rect(x + W2 + 4, 90, 4, 8, 'ВЛ_ОПОРЫ', 0.5); sh.line(x + W2, 92, x + W2 + 4, 92, 'ВЛ_ОПОРЫ', 0.4);
    /* хомуты */
    [94, 146, 178].forEach(function (yy) { band(sh, x, yy, W2, DEP); });
    /* запас кабеля на устройстве */
    coil(sh, x + W2 / 2 + 2, 162, 26, 34, -22);
    if (withSleeve) sleeveCyl(sh, x + W2 / 2 + 12, 118, 5, 16);
    /* выноски */
    tag(sh, x - 4, 61, x - 18, 50, '1', true);
    tag(sh, rx + 20, ry - 12, rx + 26, ry - 24, '2');
    tag(sh, lx - 20, ly + 12, lx - 34, ly + 4, '2', true);
    tag(sh, x + W2 + 7, 95, x + W2 + 28, 102, '3');
    tag(sh, x + W2 / 2 + 26, 170, x + W2 / 2 + 40, 178, '4');
    tag(sh, x, 95, x - 24, 104, '5', true);
    tag(sh, x, 147, x - 24, 142, '5', true);
    tag(sh, x, 179, x - 24, 186, '5', true);
    tag(sh, x + W2 + 14, 80, x + W2 + 34, 72, 'шлейф ОК');
    if (withSleeve) tag(sh, x + W2 / 2 + 16, 124, x + W2 / 2 + 40, 118, 'муфта');
    sh.text(x + 8, 232, withSleeve ? 'с муфтой и запасом кабеля' : 'с запасом кабеля', FS.text, { a: 'middle', b: true });
  });
  var a = cat(d, 'node_tens'), b = cat(d, 'clamp_tens'), c = cat(d, 'loop_clamp'), e = cat(d, 'sleeve_holder'), f = cat(d, 'band');
  nodeSpec(sh, 330, 60, [
    ['1', a.type || 'УН.П', 'Узел крепления натяжной', 1, a.mass || 3.7, 'шт.'],
    ['2', '', 'Натяжной комплект ' + (b.type || 'НК-1'), 1, '—', 'к-т'],
    ['3', c.type || 'ЗКШ-3-11/14-2', 'Зажим шлейфовый столбовой', 1, c.mass || 0.4, 'шт.'],
    ['4', e.type || 'УПМК (эконом)', 'Устройство для подвеса муфты', 1, e.mass || 3.2, 'шт.'],
    ['5', f.type || 'ТУ 3449-101-27560230-11', 'Хомут ленточный (лента 1,8 м × 1 + 1 замок)', 3, f.mass || 0.17, 'шт.']
  ]);
  sh.note('Спецификация приведена на один узел. Марки изделий — по спецификации проекта.');
  sh.note('Запас кабеля укладывается кольцами на устройство; радиус изгиба — не менее 20 диаметров кабеля.');
  fitSheet(sh);
  return sh;
}

function tensionScheme(d) {
  var sh = new Sheet({ kind: 'typical', title: 'Схема натяжного крепления ОК и обводки шлейфа на опорах ВЛ' });
  sh.text(190, -6, 'Схема натяжного крепления ОК и обводки шлейфа на опорах ВЛ', FS.head, { a: 'middle' });
  /* общий вид опоры */
  prism(sh, 30, 20, 6, 200, 4, false);
  var yN = 60;
  sh.line(29, yN, 52, yN - 10, 'ВОЛС', 0.7); spiral(sh, 42, yN - 5, 58, yN - 12, 0.9);
  sh.line(29, yN + 1, 8, yN - 2, 'ВОЛС', 0.7); spiral(sh, 18, yN - 1, 6, yN - 3, 0.9);
  sh.poly([[29, yN + 1], [31, yN + 7], [36, yN + 4], [38, yN - 2]], false, 'ВОЛС', 0.5);
  sh.poly([[28, yN - 1], [40, yN - 3], [41, yN + 1], [29, yN + 3]], true, 'ВЛ_ОПОРЫ', 0.4);
  tag(sh, 14, yN - 1, 6, yN + 10, '5', true); tag(sh, 31, yN + 6, 26, yN + 16, '2', true); tag(sh, 36, yN + 4, 42, yN + 16, '3');
  tag(sh, 54, yN - 11, 62, yN - 16, '4'); tag(sh, 38, yN + 2, 50, yN + 8, 'ОК');
  /* разрез 1-1 */
  var cx = 115;
  sh.text(cx, 38, '1–1', FS.text, { a: 'middle', b: true }); sh.line(cx - 4, 39.5, cx + 4, 39.5, 'РАЗМЕРЫ', 0.3);
  sh.line(cx, 44, cx, 170, 'РАЗМЕРЫ', 0.25, true);
  tag(sh, cx, 58, cx - 30, 52, 'ось трассы ВЛ', true); tag(sh, cx, 158, cx - 30, 152, 'ось трассы ВЛ', true);
  hatch(sh, [[cx - 11, 94], [cx + 11, 94], [cx + 9, 114], [cx - 9, 114]], 2.2);
  sh.poly([[cx, 70], [cx + 2, 80], [cx + 12, 90], [cx + 16, 104], [cx + 12, 118], [cx + 2, 128], [cx, 138]], false, 'ВОЛС', 0.6);
  [[cx, 70], [cx, 138]].forEach(function (q) { sh.poly([[q[0] - 1.4, q[1] + (q[1] < 100 ? -4 : 4)], [q[0], q[1]], [q[0] + 1.4, q[1] + (q[1] < 100 ? -4 : 4)]], false, 'ВОЛС', 0.4); });
  sh.line(cx - 12, 94, cx - 12, 88, 'ВЛ_ОПОРЫ', 0.4); sh.line(cx + 12, 94, cx + 12, 88, 'ВЛ_ОПОРЫ', 0.4);
  tag(sh, cx + 1, 84, cx - 26, 90, '1', true); tag(sh, cx + 1, 124, cx - 26, 130, '1', true);
  /* схема монтажа, узел 1 */
  var mx = 185, my = 30;
  sh.text(mx + 75, my - 12, 'Схема монтажа', FS.head);
  sh.text(mx + 75, my - 4, (cat(d, 'node_tens').type || 'УН.П') + '   Узел 1', FS.head);
  sh.rect(mx + 55, my + 6, 34, 36, 'ВЛ_ОПОРЫ', 0.5); sh.rect(mx + 67, my + 24, 10, 7, 'ВЛ_ОПОРЫ', 0.4);
  sh.line(mx + 72, my - 2, mx + 72, my + 50, 'РАЗМЕРЫ', 0.2, true);
  sh.line(mx + 44, my + 10, mx + 100, my + 10, 'ВЛ_ОПОРЫ', 0.6);
  [mx + 47, mx + 97].forEach(function (bx) { sh.circle(bx, my + 10, 1.2, 'ВЛ_ОПОРЫ', false); });
  spiral(sh, mx + 2, my + 10, mx + 24, my + 10, 1); turnbuckle(sh, mx + 26, my + 10, 0, 16);
  sh.line(mx + 42, my + 10, mx + 45, my + 10, 'ВОЛС', 0.6);
  spiral(sh, mx + 120, my + 10, mx + 142, my + 10, 1); turnbuckle(sh, mx + 103, my + 10, 0, 16);
  sh.line(mx - 8, my + 10, mx + 2, my + 10, 'ВОЛС', 0.8); sh.line(mx + 142, my + 10, mx + 152, my + 10, 'ВОЛС', 0.8);
  sh.poly([[mx + 20, my + 12], [mx + 30, my + 32], [mx + 54, my + 44], [mx + 90, my + 44], [mx + 114, my + 32], [mx + 124, my + 12]], false, 'ВОЛС', 0.6);
  tag(sh, mx + 8, my + 10, mx + 2, my + 2, '5', true); tag(sh, mx + 132, my + 10, mx + 128, my + 0, '1');
  tag(sh, mx + 104, my + 40, mx + 120, my + 50, 'ОКСН');
  /* аксонометрия узла на стойке */
  var ax = 355;
  prism(sh, ax, my - 6, 22, 58, 16, true);
  sh.poly([[ax - 12, my + 12], [ax + 34 + 10, my + 12], [ax + 34 + 10 + 10 * OBL.dx, my + 12 + 10 * OBL.dy], [ax - 12 + 10 * OBL.dx, my + 12 + 10 * OBL.dy]], true, 'ВЛ_ОПОРЫ', 0.5);
  [[ax - 8, my + 11], [ax + 38, my + 11]].forEach(function (q) { sh.circle(q[0], q[1] - 2, 1.2, 'ВЛ_ОПОРЫ', false); sh.line(q[0], q[1] - 2, q[0] + 10 * OBL.dx, q[1] - 2 + 10 * OBL.dy, 'ВЛ_ОПОРЫ', 0.4); });
  tag(sh, ax + 44, my + 8, ax + 54, my - 2, '1');
  var a = cat(d, 'node_tens'), c = cat(d, 'loop_clamp'), f = cat(d, 'band'), b = cat(d, 'clamp_tens');
  nodeSpec(sh, 190, 100, [
    ['1', a.type || 'УН.П', 'Узел натяжной для стоек прямоугольного сечения', 1, a.mass || 3.5, 'шт.'],
    ['2', c.type || 'ЗКШ-3-11/14-2', 'Зажим шлейфовый', 1, c.mass || 0.4, 'шт.'],
    ['3', f.type || 'ТУ 3449-101-27560230-11', 'Хомут ленточный (лента 1,5 м × 1 + 1 замок)', 1, f.mass || 0.17, 'к-т'],
    ['4', '', 'Натяжной комплект ' + (b.type || 'НК-1') + ' (комплект 1)', 1, '—', 'к-т'],
    ['5', '', 'Натяжной комплект ' + (b.type || 'НК-1') + ' (комплект 2)', 1, '—', 'к-т']
  ]);
  sh.note('1. Натяжной комплект ' + (b.type || 'НК-1') + ' применять согласно монтажной ведомости.');
  sh.note('2. Минимальный радиус изгиба волоконно-оптического кабеля (ВОК) — 20 диаметров кабеля.');
  sh.note('3. Подвес ВОК осуществить на расстоянии не менее 1 м от фазных проводов.');
  fitSheet(sh);
  return sh;
}

function suspensionScheme(d) {
  var sh = new Sheet({ kind: 'typical', title: 'Схема поддерживающего крепления ОК на опорах' });
  sh.text(175, -6, 'Схема поддерживающего крепления ОК на опорах', FS.head, { a: 'middle' });
  /* общий вид опоры */
  prism(sh, 30, 30, 6, 190, 4, false);
  sh.line(20, 220, 60, 220, 'ВЛ_ОПОРЫ', 0.5); [24, 30, 36, 42].forEach(function (k) { sh.line(k, 220, k - 3, 223, 'ВЛ_ОПОРЫ', 0.25); });
  sh.poly([[26, 68], [40, 66], [40, 68], [26, 70]], true, 'ВЛ_ОПОРЫ', 0.4);
  sh.line(18, 74, 58, 66, 'ВОЛС', 0.8); sh.circle(38, 70, 1.1, 'ВОЛС', true);
  tag(sh, 38, 67, 50, 58, '1'); tag(sh, 46, 69, 60, 72, '2'); tag(sh, 30, 72, 24, 84, 'ОК', true);
  /* разрез */
  var cx = 125;
  sh.line(cx, 40, cx, 120, 'РАЗМЕРЫ', 0.25, true);
  tag(sh, cx, 48, cx - 36, 42, 'ось трассы ВЛ', true); tag(sh, cx, 110, cx - 36, 104, 'ось трассы ВЛ', true);
  hatch(sh, [[cx - 24, 64], [cx - 2, 64], [cx - 2, 86], [cx - 22, 86]], 2.2);
  sh.line(cx - 1, 64, cx + 3, 86, 'ВЛ_ОПОРЫ', 0.6); sh.circle(cx + 4, 89, 1.3, 'ВОЛС', true);
  tag(sh, cx - 12, 64, cx - 6, 54, '2'); tag(sh, cx + 1, 70, cx + 14, 64, '3'); tag(sh, cx + 3, 80, cx + 14, 76, '1'); tag(sh, cx + 4, 90, cx + 14, 96, 'ОК');
  /* аксонометрия узла */
  var ax = 250, ay = 40;
  sh.text(ax - 10, ay - 22, 'Схема монтажа', FS.head);
  sh.text(ax - 10, ay - 14, cat(d, 'node_susp').type || 'УК-П-К', FS.head);
  prism(sh, ax, ay - 6, 26, 80, 18, true);
  sh.poly([[ax - 22, ay + 26], [ax + 26 + 26, ay + 18], [ax + 52 + 10 * OBL.dx, ay + 18 + 10 * OBL.dy], [ax - 22 + 10 * OBL.dx, ay + 26 + 10 * OBL.dy]], true, 'ВЛ_ОПОРЫ', 0.5);
  [[ax - 16, ay + 24], [ax + 46, ay + 17]].forEach(function (q) { sh.circle(q[0], q[1], 1.3, 'ВЛ_ОПОРЫ', false); });
  sh.circle(ax + 13, ay + 52, 4.5, 'ВОЛС', false); sh.circle(ax + 13, ay + 52, 2.2, 'ВОЛС', false);
  sh.line(ax + 13, ay + 29, ax + 13, ay + 47, 'ВЛ_ОПОРЫ', 0.5);
  spiral(sh, ax - 30, ay + 62, ax + 60, ay + 44, 1.1);
  sh.line(ax - 40, ay + 64, ax - 30, ay + 62, 'ВОЛС', 0.8); sh.line(ax + 60, ay + 44, ax + 72, ay + 42, 'ВОЛС', 0.8);
  tag(sh, ax + 50, ay + 19, ax + 62, ay + 8, '1'); tag(sh, ax + 40, ay + 49, ax + 56, ay + 36, '2');
  var a = cat(d, 'node_susp'), b = cat(d, 'clamp_susp');
  nodeSpec(sh, 200, 140, [
    ['1', a.type || 'УК-П-К', 'Узел крепления поддерживающий', 1, a.mass || 0.97, 'шт.'],
    ['2', '', 'Поддерживающий комплект ' + (b.type || 'ПК-1'), 1, '—', 'к-т']
  ]);
  sh.note('1. Подвес ВОК осуществить на расстоянии не менее 0,6 м от фазных проводов.');
  fitSheet(sh);
  return sh;
}

/* Лист из изображения-образца заказчика (без перерисовки): изображение вписывается
   в рабочее поле с сохранением пропорций */
function imageSheet(title, parts, notes) {
  var IMG = global.PDRD_TYPICAL_IMG || {};
  var sh = new Sheet({ kind: 'typical', title: title, source: 'image' });
  (notes || []).forEach(function (n) { sh.note(n); });
  var z = zone(sh), W0 = z.x1 - z.x0, H0 = z.y1 - z.y0;
  var ok = parts.every(function (p) { return IMG[p.key]; });
  if (!ok) return null;
  if (parts.length === 1) {
    var im = IMG[parts[0].key], k = Math.min(W0 / im.w, H0 / im.h);
    var w = im.w * k, h = im.h * k;
    sh.image(z.x0 + (W0 - w) / 2, z.y0 + (H0 - h) / 2, w, h, im.src, 0, null, false);
    sh.meta.fill = Math.round(Math.max(w / W0, h / H0) * 100);
  } else {
    /* основной рисунок сверху, таблица спецификации — под ним справа */
    var a = IMG[parts[0].key], b = IMG[parts[1].key];
    var hb = Math.min(H0 * 0.28, W0 * 0.55 * b.h / b.w), wb = hb * b.w / b.h;
    var ha = H0 - hb - 4, ka = Math.min(W0 / a.w, ha / a.h), wa = a.w * ka;
    ha = a.h * ka;
    sh.image(z.x0 + (W0 - wa) / 2, z.y0, wa, ha, a.src, 0, null, false);
    sh.image(z.x1 - wb, z.y0 + ha + 4, wb, hb, b.src, 0, null, false);
    sh.meta.fill = Math.round(Math.max(wa / W0, (ha + hb + 4) / H0) * 100);
  }
  return sh;
}

function typicalSheets(d) {
  var X = global.PDRD_DECIDE, out = [];
  var NOTE_PROF = 'Стрела провеса проектируемого кабеля указана при нормальных условиях. Согласно ПУЭ (7 издание), пункт 2.5.197, расстояние от фазных проводов до волоконно-оптического кабеля на опорах ВЛ до 35 кВ должно быть не менее 0,6 м.';
  function pick(img, fallback) { return img || fallback(); }
  var tt = X ? X.totals(d) : { nodes: {}, sleeves: 0 };
  if (tt.sleeves) out.push(pick(imageSheet('Натяжное крепление ОК с размещением муфты и запаса кабеля на стойке типа СВ', [{ key: 'mufta_sv' }, { key: 'mufta_sv_spec' }], []),
    function () { return sleeveSheet(d); }));
  if (tt.nodes['А1'] || tt.nodes['А2'] || tt.nodes['АО'] || tt.nodes['С']) out.push(pick(imageSheet('Схема натяжного крепления ОК и обводки шлейфа на опорах ВЛ', [{ key: 'natyazhnoe' }], []),
    function () { return tensionScheme(d); }));
  if (tt.nodes['П'] || tt.nodes['ПУ']) out.push(pick(imageSheet('Схема поддерживающего крепления ОК на опорах', [{ key: 'podderzh' }], []),
    function () { return suspensionScheme(d); }));
  /* два обязательных листа в конце комплекта каждого проекта (образцы заказчика без изменений) */
  out.push(pick(imageSheet('Профиль пересечения с автодорогой в пролете опор ВЛ 0,4 кВ филиала ПАО «Россети Юг» - «Кубаньэнерго»', [{ key: 'profil_04' }], [NOTE_PROF]),
    function () { return crossProfile(d, '0,4'); }));
  out.push(pick(imageSheet('Профиль пересечения с автодорогой в пролете опор ВЛ 0,4-10 кВ филиала ПАО «Россети Юг» - «Кубаньэнерго»', [{ key: 'profil_04_10' }], [NOTE_PROF]),
    function () { return crossProfile(d, '0,4-10'); }));
  return out;
}

/* ---------------------------------------------------------------- комплект */
var KINDS = [planSheets, skeletonSheets, routeSheets, layoutSheets, nodeSheets, montageSheets, crossingSheets, damperSheets, gponSheets, posSheets, typicalSheets];
var _cache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
function sheets(d) {
  if (_cache && _cache.has(d)) return _cache.get(d);
  var res = buildSheets(d);
  if (_cache) _cache.set(d, res);
  return res;
}
function reset(d) { if (_cache) { if (d) _cache.delete(d); else _cache = new WeakMap(); } }
function buildSheets(d) {
  var p = d.passport, s = p.signs, all = [];
  KINDS.forEach(function (fn) { try { all = all.concat(fn(d)); } catch (e) { if (global.console) console.error('Лист', fn.name, e); } });
  var approved = !!(p.shifr && p.shifrApproved && p.marksApproved);
  var code = (p.shifr || 'ШИФР НЕ УТВЕРЖДЁН') + '-ЛКС';
  var dt = p.releaseDate ? p.releaseDate.slice(5, 7) + '.' + p.releaseDate.slice(2, 4) : '';
  all.forEach(function (sh, i) {
    sh.meta.num = i + 1;
    drawNotes(sh);
    frame(sh, { code: code, object: p.object, volume: 'Линейно-кабельные сооружения. Размещение ВОЛС на опорах ВЛ',
                title: sh.meta.title + (sh.meta.scale ? ', М 1:' + sh.meta.scale : ''), stage: 'Р', sheet: i + 1, sheets: all.length,
                org: p.branch, razrab: s.razrab, prov: s.prov, gip: s.gip, nkontr: s.nkontr, approver: s.approver, date: dt, approved: approved });
  });
  return all;
}
/* Почему какой-то лист не построен или построен формой — для страницы «Чертежи» */
function diagnose(d) {
  var out = [], D = global.PDRD_DESIGN, X = global.PDRD_DECIDE;
  if (!d.poles.some(onRoute)) { out.push('Решения по опорам не приняты — листы трассы и типовые листы не строятся (страница «Решения»).'); return out; }
  var kvs = {}, seen = {};
  d.lines.forEach(function (l) { seen[String(l.kv)] = 1; var k = num(l.kv); if (l.cable !== false && k !== null) kvs[k <= 1 ? 'lv' : 'hv'] = 1; });
  d.poles.forEach(function (p) { if (!onRoute(p)) return; (p.fromReport || []).forEach(function (r) { seen[String(r.kv)] = 1; var k = num(r.kv); if (k !== null) kvs[k <= 1 ? 'lv' : 'hv'] = 1; }); });
  if (D) {
    var inp = D.inputs(d);
    if (inp.miss.length) out.push('Монтажные таблицы построены формой без значений — не хватает: ' + inp.miss.map(function (m) { return m.text; }).join('; ') + '.');
  }
  if (X) { var tt = X.totals(d); if (!tt.sleeves) out.push('Лист «Натяжное крепление ОК с размещением муфты…» не построен: муфты не назначены (страница «Решения» → «Муфты и запасы кабеля»).'); }
  if (!global.PDRD_TYPICAL_IMG) out.push('Образцы типовых листов не загрузились (файл pdrd-typical-img.js) — листы начерчены программой.');
  return out;
}
function sheetList(d) {
  var list = sheets(d), code = (d.passport.shifr || 'ШИФР НЕ УТВЕРЖДЁН') + '-ЛКС';
  return { caption: 'Таблица — Ведомость рабочих чертежей основного комплекта',
    cols: [{ t: 'Лист', w: 20 }, { t: 'Наименование', w: 125 }, { t: 'Примечание', w: 30 }],
    rows: list.map(function (s) { return [String(s.meta.num), s.meta.title + (s.meta.scale ? ', М 1:' + s.meta.scale : ''), code]; }) };
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function toSvg(sh) {
  var o = ['<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + 'mm" height="' + H + 'mm" font-family="Arial Narrow, Arial, sans-serif">',
           '<rect width="' + W + '" height="' + H + '" fill="#fff"/>'];
  var clips = sh.p.filter(function (e) { return e.t === 'image' && e.clip; });
  if (clips.length) {
    o.push('<defs>');
    clips.forEach(function (e, i) {
      e._cid = 'clip' + i;
      o.push('<clipPath id="' + e._cid + '"><rect x="' + e.clip.x0 + '" y="' + e.clip.y0 + '" width="' + (e.clip.x1 - e.clip.x0) + '" height="' + (e.clip.y1 - e.clip.y0) + '"/></clipPath>');
    });
    o.push('</defs>');
  }
  sh.p.forEach(function (e) {
    var c = COLORS[e.l] || '#000';
    if (e.t === 'line') o.push('<line x1="' + e.x1.toFixed(2) + '" y1="' + e.y1.toFixed(2) + '" x2="' + e.x2.toFixed(2) + '" y2="' + e.y2.toFixed(2) + '" stroke="' + c + '" stroke-width="' + e.w.toFixed(2) + '"' + (e.dash ? ' stroke-dasharray="2 1.5"' : '') + '/>');
    else if (e.t === 'poly') o.push('<' + (e.c ? 'polygon' : 'polyline') + ' points="' + e.pts.map(function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' ') + '" fill="none" stroke="' + c + '" stroke-width="' + e.w.toFixed(2) + '"' + (e.dash ? ' stroke-dasharray="2 1.5"' : '') + '/>');
    else if (e.t === 'circle') o.push('<circle cx="' + e.cx.toFixed(2) + '" cy="' + e.cy.toFixed(2) + '" r="' + e.r.toFixed(2) + '" fill="' + (e.fill ? c : 'none') + '" stroke="' + c + '" stroke-width="0.25"/>');
    else if (e.t === 'image') {
      var cx2 = e.x + e.w / 2, cy2 = e.y + e.h / 2;
      o.push('<image x="' + e.x.toFixed(2) + '" y="' + e.y.toFixed(2) + '" width="' + e.w.toFixed(2) + '" height="' + e.h.toFixed(2) + '" preserveAspectRatio="none" opacity="0.9"' +
        (e._cid ? ' clip-path="url(#' + e._cid + ')"' : '') +
        (e.rot ? ' transform="rotate(' + e.rot.toFixed(3) + ' ' + cx2.toFixed(2) + ' ' + cy2.toFixed(2) + ')"' : '') + ' xlink:href="' + e.href + '"/>');
    }
    else if (e.t === 'text') o.push('<text x="' + e.x.toFixed(2) + '" y="' + e.y.toFixed(2) + '" font-size="' + e.h.toFixed(2) + '" text-anchor="' + e.a + '"' + (e.b ? ' font-weight="700"' : '') + ' fill="' + (e.wm ? '#e3a8a8' : c) + '"' + (e.rot ? ' transform="rotate(' + e.rot + ' ' + e.x.toFixed(2) + ' ' + e.y.toFixed(2) + ')"' : '') + (e.wm ? ' opacity="0.6"' : '') + '>' + esc(e.s) + '</text>');
  });
  o.push('</svg>');
  return o.join('');
}

global.PDRD_SVG = { diagnose: diagnose, reset: reset, drawVector: drawVector, W: W, H: H, LAYERS: LAYERS, FS: FS, Sheet: Sheet, sheets: sheets, sheetList: sheetList,
  toSvg: toSvg, ekus: ekus, segments: segments, poleSymbol: poleSymbol, surname: surname, fitSheet: fitSheet, bbox: bbox, zone: zone, projection: projection };
})(typeof window !== 'undefined' ? window : globalThis);
