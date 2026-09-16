/* PD_RD — выгрузка листов в DXF R12 (AC1009, ASCII, кодовая страница ANSI_1251).
   Один лист — один файл; единицы — миллиметры листа; слои — PDRD_SVG.LAYERS. */
(function (global) {
'use strict';
var ACI = { 'РАМКА': 7, 'ШТАМП': 7, 'ВЛ_ОПОРЫ': 8, 'ВЛ_ПРОВОДА': 9, 'ВОЛС': 5, 'МУФТЫ': 1, 'РАЗМЕРЫ': 3, 'ТЕКСТ': 7, 'ПЕРЕСЕЧЕНИЯ': 30 };
var CP = { 'Ё': 0xA8, 'ё': 0xB8, '№': 0xB9, '«': 0xAB, '»': 0xBB, '—': 0x97, '–': 0x96, '°': 0xB0, '±': 0xB1, '·': 0xB7, '…': 0x85, '‰': 0x89, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95 };
function cp1251(str) {
  var out = new Uint8Array(str.length), n = 0;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i), ch = str[i];
    if (c < 128) out[n++] = c;
    else if (c >= 0x410 && c <= 0x44F) out[n++] = c - 0x410 + 0xC0;
    else if (CP[ch] !== undefined) out[n++] = CP[ch];
    else if (ch === '²') out[n++] = 50;
    else if (ch === '≥') { out = grow(out, 1); out[n++] = 62; out[n++] = 61; }
    else if (ch === '≤') { out = grow(out, 1); out[n++] = 60; out[n++] = 61; }
    else if (ch === '▲') out[n++] = 94;
    else out[n++] = 63;
  }
  return out.slice(0, n);
}
function grow(a, k) { var b = new Uint8Array(a.length + k); b.set(a); return b; }
function f(v) { return (Math.round(v * 1000) / 1000).toString(); }

function toDxf(sh) {
  var H = global.PDRD_SVG.H, L = global.PDRD_SVG.LAYERS, o = [];
  function g(code, val) { o.push(String(code)); o.push(String(val)); }
  function Y(y) { return H - y; }
  g(0, 'SECTION'); g(2, 'HEADER');
  g(9, '$ACADVER'); g(1, 'AC1009');
  g(9, '$DWGCODEPAGE'); g(3, 'ANSI_1251');
  g(9, '$INSBASE'); g(10, 0); g(20, 0); g(30, 0);
  g(9, '$EXTMIN'); g(10, 0); g(20, 0); g(30, 0);
  g(9, '$EXTMAX'); g(10, global.PDRD_SVG.W); g(20, H); g(30, 0);
  g(9, '$LIMMIN'); g(10, 0); g(20, 0);
  g(9, '$LIMMAX'); g(10, global.PDRD_SVG.W); g(20, H);
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 2);
  g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0);
  g(0, 'LTYPE'); g(2, 'DASHED'); g(70, 0); g(3, '__ __ __'); g(72, 65); g(73, 2); g(40, 4.5); g(49, 3); g(49, -1.5);
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, L.length + 1);
  g(0, 'LAYER'); g(2, '0'); g(70, 0); g(62, 7); g(6, 'CONTINUOUS');
  L.forEach(function (n) { g(0, 'LAYER'); g(2, n); g(70, 0); g(62, ACI[n] || 7); g(6, 'CONTINUOUS'); });
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1);
  g(0, 'STYLE'); g(2, 'STANDARD'); g(70, 0); g(40, 0); g(41, 0.8); g(50, 0); g(71, 0); g(42, 2.5); g(3, 'txt'); g(4, '');
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'BLOCKS'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  sh.p.forEach(function (e) {
    if (e.t === 'line') { g(0, 'LINE'); g(8, e.l); g(10, f(e.x1)); g(20, f(Y(e.y1))); g(30, 0); g(11, f(e.x2)); g(21, f(Y(e.y2))); g(31, 0); }
    else if (e.t === 'poly') {
      g(0, 'POLYLINE'); g(8, e.l); if (e.dash) g(6, 'DASHED'); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, e.c ? 1 : 0);
      e.pts.forEach(function (p) { g(0, 'VERTEX'); g(8, e.l); g(10, f(p[0])); g(20, f(Y(p[1]))); g(30, 0); });
      g(0, 'SEQEND'); g(8, e.l);
    } else if (e.t === 'circle') { g(0, 'CIRCLE'); g(8, e.l); g(10, f(e.cx)); g(20, f(Y(e.cy))); g(30, 0); g(40, f(e.r)); }
    else if (e.t === 'text') {
      if (e.wm) return;
      var al = e.a === 'middle' ? 1 : (e.a === 'end' ? 2 : 0);
      g(0, 'TEXT'); g(8, e.l); g(10, f(e.x)); g(20, f(Y(e.y))); g(30, 0); g(40, f(e.h * 0.72)); g(1, e.s.replace(/[\r\n]+/g, ' '));
      if (e.rot) g(50, f(-e.rot));
      g(7, 'STANDARD');
      if (al) { g(72, al); g(11, f(e.x)); g(21, f(Y(e.y))); g(31, 0); }
    }
  });
  g(0, 'ENDSEC'); g(0, 'EOF');
  return o.join('\r\n') + '\r\n';
}

/* Разбор DXF для самопроверки: число объектов по типам и перечень слоёв */
function parse(text) {
  var lines = text.split(/\r?\n/), ent = {}, layers = {}, sec = '', inLayerTable = false;
  for (var i = 0; i + 1 < lines.length; i += 2) {
    var c = lines[i].trim(), v = lines[i + 1];
    if (c === '2' && lines[i - 2] && lines[i - 2].trim() === '0' && lines[i - 1] === 'SECTION') sec = v;
    if (c === '0' && sec === 'ENTITIES' && /^(LINE|POLYLINE|CIRCLE|TEXT)$/.test(v)) ent[v] = (ent[v] || 0) + 1;
    if (c === '2' && lines[i - 1] === 'TABLE') inLayerTable = v === 'LAYER';
    if (c === '2' && inLayerTable && lines[i - 1] === 'LAYER') layers[v] = 1;
    if (c === '0' && v === 'ENDTAB') inLayerTable = false;
  }
  return { entities: ent, layers: Object.keys(layers), eof: /\r?\n0\r?\nEOF/.test(text) };
}

function fileName(d, sh) {
  var s = (d.passport.shifr || 'SHIFR') + '-LKS-L' + sh.meta.num;
  return s.replace(/[^\w\-]+/g, '_') + '.dxf';
}

global.PDRD_DXF = { toDxf: toDxf, cp1251: cp1251, parse: parse, fileName: fileName };
})(typeof window !== 'undefined' ? window : globalThis);
