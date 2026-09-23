/* PD_RD — картографическая подложка ситуационного плана.
   Тайлы загружаются из выбранного источника (по умолчанию OpenStreetMap),
   склеиваются в одно изображение и привязываются по углам. Подложка попадает
   в просмотр, печать и PDF; для DXF выгружается растр с файлом привязки .wld
   (в САПР растр всегда подключается как внешняя ссылка).
   При использовании OpenStreetMap на листе печатается ссылка на источник:
   © OpenStreetMap contributors (лицензия ODbL). */
(function (global) {
'use strict';
var SOURCES = [
  { id: 'osm', title: 'OpenStreetMap (улицы, дома, дороги)', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors (ODbL)', max: 19 },
  { id: 'osm-hot', title: 'OpenStreetMap Humanitarian', url: 'https://tile-a.openstreetmap.fr/hot/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors, HOT', max: 19 },
  { id: 'custom', title: 'Свой источник тайлов (URL с {z}/{x}/{y})', url: '', attr: '', max: 20 }
];
var MAX_TILES = 120;

function lon2x(lon, z) { return (lon + 180) / 360 * Math.pow(2, z); }
function lat2y(lat, z) { var r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z); }
function x2lon(x, z) { return x / Math.pow(2, z) * 360 - 180; }
function y2lat(y, z) { var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }

function loadImage(url) {
  return new Promise(function (res, rej) {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () { res(img); };
    img.onerror = function () { rej(new Error('тайл не загружен: ' + url)); };
    img.src = url;
  });
}

/* Сборка подложки по прямоугольнику координат */
function tiles(bbox, opt) {
  opt = opt || {};
  var src = SOURCES.filter(function (s) { return s.id === (opt.source || 'osm'); })[0] || SOURCES[0];
  var tpl = opt.url || src.url;
  if (!tpl) return Promise.reject(new Error('не задан адрес источника тайлов'));
  var zMax = Math.min(opt.maxZoom || 18, src.max || 19);
  var z = zMax, x0, x1, y0, y1;
  for (; z >= 2; z--) {
    x0 = Math.floor(lon2x(bbox.w, z)); x1 = Math.ceil(lon2x(bbox.e, z));
    y0 = Math.floor(lat2y(bbox.n, z)); y1 = Math.ceil(lat2y(bbox.s, z));
    if ((x1 - x0) * (y1 - y0) <= (opt.maxTiles || MAX_TILES)) break;
  }
  var nx = Math.max(1, x1 - x0), ny = Math.max(1, y1 - y0);
  var cv = document.createElement('canvas');
  cv.width = nx * 256; cv.height = ny * 256;
  var ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  var jobs = [], failed = 0;
  for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) {
    (function (i2, j2) {
      var u = tpl.replace('{z}', z).replace('{x}', x0 + i2).replace('{y}', y0 + j2).replace('{s}', 'a');
      jobs.push(loadImage(u).then(function (img) { ctx.drawImage(img, i2 * 256, j2 * 256, 256, 256); })
        .catch(function () { failed++; }));
    })(i, j);
  }
  return Promise.all(jobs).then(function () {
    if (failed === nx * ny) throw new Error('ни один тайл не загружен — проверьте доступ к источнику карты');
    return {
      dataUrl: cv.toDataURL('image/jpeg', 0.85),
      nw: { lat: y2lat(y0, z), lon: x2lon(x0, z) },
      se: { lat: y2lat(y1, z), lon: x2lon(x1, z) },
      zoom: z, tiles: nx * ny, failed: failed, attr: opt.attr || src.attr, source: src.id,
      width: cv.width, height: cv.height, name: 'Карта ' + src.title + ', масштабный уровень ' + z
    };
  });
}

/* Прямоугольник трассы с запасом */
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
  if (!deg) return Promise.resolve({ url: url, scale: 1 });
  return loadImage(url).then(function (img) {
    var a = deg * Math.PI / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    var w = img.width, h = img.height;
    var W2 = Math.ceil(w * c + h * s), H2 = Math.ceil(w * s + h * c);
    var cv = document.createElement('canvas');
    cv.width = W2; cv.height = H2;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W2, H2);
    ctx.translate(W2 / 2, H2 / 2); ctx.rotate(a); ctx.drawImage(img, -w / 2, -h / 2);
    return { url: cv.toDataURL('image/jpeg', 0.85), w: W2, h: H2 };
  });
}

/* Обрезка растра по рабочему полю листа */
function cropToClip(e) {
  if (!e.clip) return Promise.resolve();
  var x0 = Math.max(e.x, e.clip.x0), y0 = Math.max(e.y, e.clip.y0);
  var x1 = Math.min(e.x + e.w, e.clip.x1), y1 = Math.min(e.y + e.h, e.clip.y1);
  if (!(x1 > x0 && y1 > y0)) { e.href = ''; e.w = 0; e.h = 0; return Promise.resolve(); }
  if (x0 === e.x && y0 === e.y && x1 === e.x + e.w && y1 === e.y + e.h) return Promise.resolve();
  return loadImage(e.href).then(function (img) {
    var sx = img.width / e.w, sy = img.height / e.h;
    var cw = Math.max(1, Math.round((x1 - x0) * sx)), ch = Math.max(1, Math.round((y1 - y0) * sy));
    var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    cv.getContext('2d').drawImage(img, Math.round((x0 - e.x) * sx), Math.round((y0 - e.y) * sy), cw, ch, 0, 0, cw, ch);
    e.href = cv.toDataURL('image/jpeg', 0.85);
    e.x = x0; e.y = y0; e.w = x1 - x0; e.h = y1 - y0; e.pxW = cw; e.pxH = ch; e.clip = null;
  }).catch(function () { });
}

/* Разворот растровых подложек на повёрнутых листах: после этого все растры
   выводятся без поворота — одинаково в SVG, PDF, печати и файле привязки. */
function bake(sheets) {
  var jobs = [];
  sheets.forEach(function (sh) {
    sh.p.forEach(function (e) {
      if (e.t !== 'image') return;
      if (!e.rot) {
        jobs.push(loadImage(e.href).then(function (img) { e.pxW = img.width; e.pxH = img.height; }).then(function () { return cropToClip(e); }).catch(function () { }));
        return;
      }
      jobs.push(rotateDataUrl(e.href, e.rot).then(function (r) {
        var a = Math.abs(e.rot * Math.PI / 180), c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
        var W2 = e.w * c + e.h * s, H2 = e.w * s + e.h * c;
        var cx = e.x + e.w / 2, cy = e.y + e.h / 2;
        e.href = r.url; e.x = cx - W2 / 2; e.y = cy - H2 / 2; e.w = W2; e.h = H2; e.rot = 0; e.pxW = r.w; e.pxH = r.h;
        return cropToClip(e);
      }).catch(function () { }));
    });
  });
  return Promise.all(jobs).then(function () { return sheets; });
}

/* Файл привязки .wld для растра, выгружаемого рядом с DXF (координаты — мм листа) */
function worldFile(e, sheetH, pxW, pxH) {
  var A = e.w / pxW, E = -e.h / pxH;
  var C = e.x + A / 2, F = (sheetH - e.y) + E / 2;
  return [A, 0, 0, E, C, F].map(function (v) { return (Math.round(v * 1e6) / 1e6).toString(); }).join('\r\n') + '\r\n';
}
function dataUrlToBytes(url) {
  var i = url.indexOf(','), b = atob(url.slice(i + 1)), a = new Uint8Array(b.length);
  for (var k = 0; k < b.length; k++) a[k] = b.charCodeAt(k);
  return a;
}
function imageOf(sheet) { return (sheet.p || []).filter(function (e) { return e.t === 'image'; })[0] || null; }

global.PDRD_MAP = { SOURCES: SOURCES, cropToClip: cropToClip, tiles: tiles, routeBbox: routeBbox, rotateDataUrl: rotateDataUrl, bake: bake,
  worldFile: worldFile, dataUrlToBytes: dataUrlToBytes, imageOf: imageOf, lon2x: lon2x, lat2y: lat2y, x2lon: x2lon, y2lat: y2lat };
})(typeof window !== 'undefined' ? window : globalThis);
