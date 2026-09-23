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
var FILL_MIN = 0.70;
var LAYERS = ['РАМКА', 'ШТАМП', 'ВЛ_ОПОРЫ', 'ВЛ_ПРОВОДА', 'ВОЛС', 'МУФТЫ', 'РАЗМЕРЫ', 'ТЕКСТ', 'ПЕРЕСЕЧЕНИЯ', 'ПОДЛОЖКА'];
var COLORS = { 'РАМКА': '#000', 'ШТАМП': '#000', 'ВЛ_ОПОРЫ': '#222', 'ВЛ_ПРОВОДА': '#6f6f6f', 'ВОЛС': '#0a58a8', 'МУФТЫ': '#b02a1f', 'РАЗМЕРЫ': '#444', 'ТЕКСТ': '#000', 'ПЕРЕСЕЧЕНИЯ': '#7a4d00', 'ПОДЛОЖКА': '#888' };
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
  var lines = 0;
  sh.notes.forEach(function (n) { lines += Math.ceil(tw(n, FS.small) / (STAMP_W - 4)); });
  return lines * FS.small * 1.35 + 4;
}
function drawNotes(sh) {
  if (!sh.notes.length) return;
  var x = W - FO - STAMP_W, top = H - FO - STAMP_H - notesHeight(sh) + 2;
  var y = top;
  sh.text(x, y, 'Примечания:', FS.small, { b: true });
  y += FS.small * 1.35;
  sh.notes.forEach(function (n) {
    var words = String(n).split(' '), cur = '';
    words.forEach(function (w2) {
      if (tw(cur + ' ' + w2, FS.small) > STAMP_W - 4 && cur) { sh.text(x, y, cur, FS.small); y += FS.small * 1.35; cur = w2; }
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
function onRoute(p) { return ['place', 'recheck', 'extra', 'after'].indexOf((p.design || {}).decision) >= 0; }
function poleNums(p) { return (p.lines || []).map(function (l) { return l.num; }).join('/'); }

/* Условное обозначение опоры: промежуточная — стойка; анкерная, угловая
   анкерная и ответвительная — стойка с двумя подкосами; концевая — с одним
   подкосом со стороны, противоположной тяжению. Подкосы всегда идут вниз. */
function poleSymbol(sh, x, yTop, yBase, scheme, layer) {
  layer = layer || 'ВЛ_ОПОРЫ';
  var hgt = yBase - yTop, s = String(scheme || '');
  sh.line(x, yTop, x, yBase, layer, 0.6);
  var d = hgt * 0.42, top = yTop + hgt * 0.28;
  if (/концев/.test(s)) sh.line(x, top, x - d, yBase, layer, 0.5);
  else if (/анкер|ответвит/.test(s)) { sh.line(x, top, x - d, yBase, layer, 0.5); sh.line(x, top, x + d, yBase, layer, 0.5); }
  else if (/углов/.test(s)) sh.line(x - d * 0.6, yTop + hgt * 0.16, x + d * 0.6, yTop + hgt * 0.16, layer, 0.4);
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
  var u0 = d.mapUnderlay;
  var und = u0 && u0.nw && u0.se && (u0.dataUrl || (u0.tiles && u0.tiles.length)) ? u0 : null;
  var out = [];
  var Z = { x0: FL + 5, y0: FO + 5, x1: W - FO - 5, y1: H - FO - STAMP_H - 30 };

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
    var labels = items.length <= 90;
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
    sh.note('Система координат — WGS-84. Углы рабочего поля: левый верхний ' + dms(c1[0]) + ' с. ш., ' + dms(c1[1]) + ' в. д.; правый нижний ' + dms(c2[0]) + ' с. ш., ' + dms(c2[1]) + ' в. д. Сетка — параллели и меридианы с подписями.');
    if (rot) sh.note('План развёрнут для размещения трассы вдоль листа: направление на север — по стрелке.');
    sh.note('Условные обозначения: тонкая линия — существующая ВЛ; утолщённая — проектируемая ВОЛС; точка — опора ВЛ; треугольник — муфта и запас кабеля; окружность — опора, исключённая из размещения или с размещением после восстановления владельцем.');
    if (Math.max(f.w, f.h) < FILL_MIN) sh.note('Заполнение листа ограничено принятым стандартным масштабом ' + 'М 1:' + sc + ' и конфигурацией участка трассы.');
    sh.note(und ? ('Подложка: ' + (und.name || 'растровая подложка') + ', привязана по координатам углов; в архив DXF прикладываются растр и файл привязки .wld для подключения в САПР.')
                : 'Растровая подложка не задана (страница «Чертежи» → «Подложка»). Трасса дополнительно передаётся файлом KMZ для просмотра на картографической основе.');
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
    rows.slice(s, s + rowsPerSheet).forEach(function (row, j) {
      var y = j * 62, x0 = 0, step = 26;
      sh.text(x0, y, clip(row.line.name, 200, FS.text) + (row.part > 1 ? ' (продолжение)' : '') + ', ' + fm(row.line.kv, 1) + ' кВ', FS.text, { b: true });
      var base = y + 26;
      row.items.forEach(function (it, k) {
        var x = x0 + k * step, des = it.p.design || {};
        poleSymbol(sh, x, y + 8, base, schemeOf(it.p));
        sh.text(x, base + 5, it.r.num, FS.text, { a: 'middle', max: step - 1 });
        sh.text(x, base + 9.5, it.r.mark || '—', FS.small, { a: 'middle', max: step - 1 });
        var code = { place: des.node || '', recheck: (des.node || '') + '*', extra: 'Е1', after: 'В', bypass: '—', exclude: '×' }[des.decision] || '?';
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
    sh.note('Решения: * — размещение после поверочного расчёта по типовому проекту; Е1 — установка дополнительной опоры (мероприятие Е.1); В — размещение после восстановления опоры владельцем; ▲ — муфта и запас кабеля.');
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
      if (/анкер|концев|ответвит/.test(sch)) {
        var top = base - standH * sc * 0.72, arm = standH * sc * 0.42;
        sh.line(x - 1.8, top, x - arm, base, 'ВЛ_ОПОРЫ', 0.6);
        sh.text(x - arm, base + 4, 'подкос', FS.small, { a: 'middle' });
        if (!/концев/.test(sch)) {
          sh.line(x + 1.8, top, x + arm, base, 'ВЛ_ОПОРЫ', 0.6);
          sh.text(x + arm, base + 4, 'подкос', FS.small, { a: 'middle' });
        }
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
  var inp = D.inputs(d); if (inp.miss.length) return [];
  var reg; try { reg = C.regimes({ tMax: inp.tMax, tMin: inp.tMin, tAvg: inp.tAvg, altitude: inp.altitude }); } catch (e) { return []; }
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
    var need = rowH * (spans.length + 3) + 8;
    if (!sh || y + need > maxY) { sh = new Sheet({ kind: 'montage', title: 'Монтажные таблицы стрел провеса и тяжений' }); out.push(sh); y = 0; }
    sh.text(0, y, s.id + ' — ' + clip(s.line, 150, FS.text) + '; приведённый пролёт ' + fm(s.Lr, 1) + ' м', FS.text, { b: true });
    y += rowH + 1;
    var tblW = w0 + temps.length * colW;
    sh.rect(0, y - rowH + 1.2, tblW, rowH * (spans.length + 2), 'РАЗМЕРЫ', 0.3);
    sh.text(1, y, 'Пролёт / температура, °C', FS.small, { max: w0 - 2 });
    temps.forEach(function (tv, i2) { sh.text(w0 + i2 * colW + colW / 2, y, String(tv), FS.small, { a: 'middle' }); });
    sh.line(0, y + 1.5, tblW, y + 1.5, 'РАЗМЕРЫ', 0.3);
    y += rowH;
    sh.text(1, y, 'Тяжение H, кН', FS.small, { max: w0 - 2 });
    mt.forEach(function (r, i3) { sh.text(w0 + i3 * colW + colW / 2, y, fm(r.H / 1000, 3), FS.small, { a: 'middle' }); });
    y += rowH;
    spans.forEach(function (sp, k) {
      sh.text(1, y, clip(sp.from.rec.num + '–' + sp.to.rec.num + ' (' + fm(sp.L, 0) + ' м)', w0 - 2, FS.small), FS.small);
      mt.forEach(function (r, i4) { sh.text(w0 + i4 * colW + colW / 2, y, fm(r.sags[k], 2), FS.small, { a: 'middle' }); });
      y += rowH;
    });
    for (var c2 = 0; c2 <= temps.length; c2++) {
      var xx = w0 + c2 * colW - (c2 === 0 ? 0 : 0);
      sh.line(c2 === 0 ? w0 : xx, y - rowH * (spans.length + 2) - 1.3, c2 === 0 ? w0 : xx, y - 1.3, 'РАЗМЕРЫ', 0.2);
    }
    if (s.spans.length > spans.length) { sh.text(1, y, 'Ещё ' + (s.spans.length - spans.length) + ' пролётов участка — в ведомости пролётов (XLSX)', FS.small); y += rowH; }
    y += 6;
  });
  out.forEach(function (x) {
    x.note('Стрела провеса f — в середине пролёта при температуре монтажа; тяжение H — горизонтальная составляющая, одна на анкерный участок.');
    x.note('Монтаж выполнять с контролем тяжения динамометром; значения — расчёт PD_RD по ПУЭ-7, пп. 2.5.71, 2.5.185.');
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

/* ---------------------------------------------------------------- комплект */
var KINDS = [planSheets, skeletonSheets, routeSheets, layoutSheets, nodeSheets, montageSheets, crossingSheets, damperSheets, gponSheets, posSheets];
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

global.PDRD_SVG = { reset: reset, W: W, H: H, LAYERS: LAYERS, FS: FS, Sheet: Sheet, sheets: sheets, sheetList: sheetList,
  toSvg: toSvg, ekus: ekus, segments: segments, poleSymbol: poleSymbol, surname: surname, fitSheet: fitSheet, bbox: bbox, zone: zone, projection: projection };
})(typeof window !== 'undefined' ? window : globalThis);
