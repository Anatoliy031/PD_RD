/* PD_RD — картографическая подложка ситуационного плана.
   Источники тайлов те же, что в карте ВОЛС (karta.html): Яндекс (схема,
   спутник, гибрид) в проекции EPSG:3395, Google (схема, спутник, гибрид) и
   OpenStreetMap в EPSG:3857, а также свой сервис тайлов.

   Два режима подложки:
     'image' — тайлы склеены в одно изображение (возможно, если сервер отдаёт
               заголовок Access-Control-Allow-Origin): подложка выводится
               в просмотре, печати, PDF, а для DXF выгружается растр с файлом
               привязки .jgw;
     'tiles' — тайлы выводятся ссылками (сервер не разрешает чтение пикселей):
               подложка видна в просмотре и на печати (в том числе «Печать →
               Сохранить как PDF»), но в PDF из программы и в DXF не попадает.
   Использование тайлов — в соответствии с условиями выбранного сервиса. */
(function (global) {
'use strict';
var SOURCES = [
  { id: 'yandex-map', title: 'Яндекс — Схема', fam: 'yandex', max: 20, attr: '© Яндекс.Карты',
    layers: ['https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x={x}&y={y}&z={z}&scale=1&lang=ru_RU'] },
  { id: 'yandex-sat', title: 'Яндекс — Спутник', fam: 'yandex', max: 20, attr: '© Яндекс.Карты',
    layers: ['https://core-sat.maps.yandex.net/tiles?l=sat&x={x}&y={y}&z={z}&lang=ru_RU'] },
  { id: 'yandex-hyb', title: 'Яндекс — Гибрид', fam: 'yandex', max: 20, attr: '© Яндекс.Карты',
    layers: ['https://core-sat.maps.yandex.net/tiles?l=sat&x={x}&y={y}&z={z}&lang=ru_RU',
             'https://core-renderer-tiles.maps.yandex.net/tiles?l=skl&x={x}&y={y}&z={z}&scale=1&lang=ru_RU'] },
  { id: 'google-map', title: 'Google — Схема', fam: 'google', max: 21, attr: '© Google',
    layers: ['https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=ru'], sub: ['0', '1', '2', '3'] },
  { id: 'google-sat', title: 'Google — Спутник', fam: 'google', max: 21, attr: '© Google',
    layers: ['https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}&hl=ru'], sub: ['0', '1', '2', '3'] },
  { id: 'google-hyb', title: 'Google — Гибрид', fam: 'google', max: 21, attr: '© Google',
    layers: ['https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&hl=ru'], sub: ['0', '1', '2', '3'] },
  { id: 'osm', title: 'OpenStreetMap', fam: 'google', max: 19, attr: '© OpenStreetMap contributors (ODbL)',
    layers: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'] },
  { id: 'custom', title: 'Свой сервис тайлов ({z}/{x}/{y})', fam: 'google', max: 21, attr: '', layers: [] }
];
var MAX_TILES = 140, E = 0.0818191908426;

function byId(id) { return SOURCES.filter(function (s) { return s.id === id; })[0] || SOURCES[0]; }

/* Проекции: EPSG:3857 (сферическая) и EPSG:3395 (эллипсоидальная, Яндекс) */
function lon2x(lon, z) { return (lon + 180) / 360 * Math.pow(2, z); }
function lat2y(lat, z, fam) {
  var f = lat * Math.PI / 180, n = Math.pow(2, z);
  if (fam === 'yandex') {
    var s = Math.sin(f);
    var ts = Math.tan(Math.PI / 4 + f / 2) * Math.pow((1 - E * s) / (1 + E * s), E / 2);
    return (1 - Math.log(ts) / Math.PI) / 2 * n;
  }
  return (1 - Math.log(Math.tan(f) + 1 / Math.cos(f)) / Math.PI) / 2 * n;
}
function x2lon(x, z) { return x / Math.pow(2, z) * 360 - 180; }
function y2lat(y, z, fam) {
  var n = Math.pow(2, z);
  if (fam === 'yandex') {
    var ts = Math.exp((1 - 2 * y / n) * Math.PI), f = Math.PI / 2 - 2 * Math.atan(1 / ts);
    for (var i = 0; i < 8; i++) {
      var s = Math.sin(f);
      f = Math.PI / 2 - 2 * Math.atan(Math.pow((1 - E * s) / (1 + E * s), E / 2) / ts);
    }
    return f * 180 / Math.PI;
  }
  var t = Math.PI - 2 * Math.PI * y / n;
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(t) - Math.exp(-t)));
}

function tileUrl(tpl, src, x, y, z, i) {
  var sub = src.sub && src.sub.length ? src.sub[(x + y + i) % src.sub.length] : 'a';
  return tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y).replace('{s}', sub);
}
function loadImage(url, anonymous) {
  return new Promise(function (res, rej) {
    var img = new Image();
    if (anonymous) img.crossOrigin = 'anonymous';
    img.onload = function () { res(img); };
    img.onerror = function () { rej(new Error('тайл не загружен')); };
    img.src = url;
  });
}

/* Подбор масштабного уровня и перечня тайлов на прямоугольник координат */
function plan(bbox, opt) {
  opt = opt || {};
  var src = byId(opt.source);
  var layers = (opt.url ? [opt.url] : src.layers).filter(Boolean);
  if (!layers.length) throw new Error('не задан адрес источника тайлов');
  var zMax = Math.min(opt.maxZoom || 18, src.max || 19), z = zMax, x0, x1, y0, y1;
  for (; z >= 2; z--) {
    x0 = Math.floor(lon2x(bbox.w, z)); x1 = Math.ceil(lon2x(bbox.e, z));
    y0 = Math.floor(lat2y(bbox.n, z, src.fam)); y1 = Math.ceil(lat2y(bbox.s, z, src.fam));
    if ((x1 - x0) * (y1 - y0) <= (opt.maxTiles || MAX_TILES)) break;
  }
  var list = [];
  for (var i = 0; i < layers.length; i++) {
    for (var x = x0; x < x1; x++) for (var y = y0; y < y1; y++) {
      list.push({ url: tileUrl(layers[i], src, x, y, z, i), x: x, y: y, z: z, layer: i,
                  nw: { lat: y2lat(y, z, src.fam), lon: x2lon(x, z) },
                  se: { lat: y2lat(y + 1, z, src.fam), lon: x2lon(x + 1, z) } });
    }
  }
  return { src: src, z: z, x0: x0, x1: x1, y0: y0, y1: y1, tiles: list, layers: layers.length,
           nw: { lat: y2lat(y0, z, src.fam), lon: x2lon(x0, z) },
           se: { lat: y2lat(y1, z, src.fam), lon: x2lon(x1, z) },
           nx: Math.max(1, x1 - x0), ny: Math.max(1, y1 - y0) };
}

/* Загрузка подложки: сначала попытка склеить растр, при запрете чтения
   пикселей — режим ссылок на тайлы */
function tiles(bbox, opt) {
  opt = opt || {};
  var p;
  try { p = plan(bbox, opt); } catch (e) { return Promise.reject(e); }
  var cv = document.createElement('canvas');
  cv.width = p.nx * 256; cv.height = p.ny * 256;
  var ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  var ok = 0, fail = 0;
  var jobs = p.tiles.map(function (t) {
    return loadImage(t.url, true)
      .then(function (img) { ctx.drawImage(img, (t.x - p.x0) * 256, (t.y - p.y0) * 256, 256, 256); ok++; })
      .catch(function () { fail++; });
  });
  return Promise.all(jobs).then(function () {
    var base = { nw: p.nw, se: p.se, zoom: p.z, count: p.tiles.length, failed: fail,
                 attr: opt.attr || p.src.attr, source: p.src.id,
                 name: 'Карта: ' + p.src.title + ', масштабный уровень ' + p.z };
    if (ok) {
      try {
        var url = cv.toDataURL('image/jpeg', 0.9);
        base.mode = 'image'; base.dataUrl = url; base.width = cv.width; base.height = cv.height;
        return base;
      } catch (e) { /* пиксели читать нельзя — переходим к режиму ссылок */ }
    }
    base.mode = 'tiles';
    base.tiles = p.tiles.map(function (t) { return { url: t.url, nw: t.nw, se: t.se, layer: t.layer }; });
    base.dataUrl = '';
    return checkTiles(base).then(function () { return base; });
  });
}
/* Проверяем, что тайлы вообще отдаются (без чтения пикселей) */
function checkTiles(base) {
  var few = base.tiles.slice(0, 3);
  return Promise.all(few.map(function (t) { return loadImage(t.url, false).then(function () { return true; }).catch(function () { return false; }); }))
    .then(function (res) {
      if (!res.some(Boolean)) throw new Error('источник карты недоступен с этого компьютера');
      return base;
    });
}

function routeBbox(d, padShare) {
  var ps = d.poles.filter(function (p) { return p.coords && p.coords.lat !== null && p.coords.lon !== null; });
  if (!ps.length) return null;
  var lat = ps.map(function (p) { return p.coords.lat; }), lon = ps.map(function (p) { return p.coords.lon; });
  var n = Math.max.apply(null, lat), s = Math.min.apply(null, lat), e = Math.max.apply(null, lon), w = Math.min.apply(null, lon);
  var k = padShare === undefined ? 0.12 : padShare;
  var dy = Math.max((n - s) * k, 0.0015), dx = Math.max((e - w) * k, 0.0015);
  return { n: n + dy, s: s - dy, e: e + dx, w: w - dx };
}

function rotateDataUrl(url, deg) {
  if (!deg) return Promise.resolve({ url: url });
  return loadImage(url, true).then(function (img) {
    var a = deg * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    var w = img.width, h = img.height, W2 = Math.ceil(w * c + h * s), H2 = Math.ceil(w * s + h * c);
    var cv = document.createElement('canvas'); cv.width = W2; cv.height = H2;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W2, H2);
    ctx.translate(W2 / 2, H2 / 2); ctx.rotate(a); ctx.drawImage(img, -w / 2, -h / 2);
    return { url: cv.toDataURL('image/jpeg', 0.9), w: W2, h: H2 };
  });
}

function cropToClip(e) {
  if (!e.clip) return Promise.resolve();
  var x0 = Math.max(e.x, e.clip.x0), y0 = Math.max(e.y, e.clip.y0);
  var x1 = Math.min(e.x + e.w, e.clip.x1), y1 = Math.min(e.y + e.h, e.clip.y1);
  if (!(x1 > x0 && y1 > y0)) { e.href = ''; e.w = 0; e.h = 0; e.clip = null; return Promise.resolve(); }
  if (x0 === e.x && y0 === e.y && x1 === e.x + e.w && y1 === e.y + e.h) { e.clip = null; return Promise.resolve(); }
  if (e.remote) return Promise.resolve();          /* ссылки на тайлы обрезает сам просмотрщик */
  return loadImage(e.href, true).then(function (img) {
    var sx = img.width / e.w, sy = img.height / e.h;
    var cw = Math.max(1, Math.round((x1 - x0) * sx)), ch = Math.max(1, Math.round((y1 - y0) * sy));
    var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    cv.getContext('2d').drawImage(img, Math.round((x0 - e.x) * sx), Math.round((y0 - e.y) * sy), cw, ch, 0, 0, cw, ch);
    e.href = cv.toDataURL('image/jpeg', 0.9);
    e.x = x0; e.y = y0; e.w = x1 - x0; e.h = y1 - y0; e.pxW = cw; e.pxH = ch; e.clip = null;
  }).catch(function () { });
}

/* Выпрямление и обрезка растров перед выгрузкой (PDF, DXF) */
function bake(sheets) {
  var jobs = [];
  sheets.forEach(function (sh) {
    sh.p.forEach(function (e) {
      if (e.t !== 'image' || !e.href) return;
      if (e.remote) return;
      if (!e.rot) {
        jobs.push(loadImage(e.href, true).then(function (img) { e.pxW = img.width; e.pxH = img.height; })
          .then(function () { return cropToClip(e); }).catch(function () { }));
        return;
      }
      jobs.push(rotateDataUrl(e.href, e.rot).then(function (r) {
        var a = Math.abs(e.rot * Math.PI / 180), c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
        var W2 = e.w * c + e.h * s, H2 = e.w * s + e.h * c, cx = e.x + e.w / 2, cy = e.y + e.h / 2;
        e.href = r.url; e.x = cx - W2 / 2; e.y = cy - H2 / 2; e.w = W2; e.h = H2; e.rot = 0; e.pxW = r.w; e.pxH = r.h;
        return cropToClip(e);
      }).catch(function () { }));
    });
  });
  return Promise.all(jobs).then(function () { return sheets; });
}

function worldFile(e, sheetH, pxW, pxH) {
  var A = e.w / pxW, En = -e.h / pxH;
  var C = e.x + A / 2, F = (sheetH - e.y) + En / 2;
  return [A, 0, 0, En, C, F].map(function (v) { return (Math.round(v * 1e6) / 1e6).toString(); }).join('\r\n') + '\r\n';
}
function dataUrlToBytes(url) {
  var i = url.indexOf(','), b = atob(url.slice(i + 1)), a = new Uint8Array(b.length);
  for (var k = 0; k < b.length; k++) a[k] = b.charCodeAt(k);
  return a;
}
function imageOf(sheet) { return (sheet.p || []).filter(function (e) { return e.t === 'image' && e.href && !e.remote; })[0] || null; }
function hasRemote(sheet) { return (sheet.p || []).some(function (e) { return e.t === 'image' && e.remote; }); }

global.PDRD_MAP = { SOURCES: SOURCES, byId: byId, plan: plan, tiles: tiles, routeBbox: routeBbox,
  rotateDataUrl: rotateDataUrl, cropToClip: cropToClip, bake: bake, worldFile: worldFile,
  dataUrlToBytes: dataUrlToBytes, imageOf: imageOf, hasRemote: hasRemote,
  lon2x: lon2x, lat2y: lat2y, x2lon: x2lon, y2lat: y2lat };
})(typeof window !== 'undefined' ? window : globalThis);
