/* PD_RD — чертежи в PDF (jsPDF 2.5.1 с cdnjs; шрифт DejaVu Sans Condensed
   с jsDelivr загружается только при формировании PDF). */
(function (global) {
'use strict';
var FONT_URL = 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSansCondensed.ttf';
var COLORS = { 'РАМКА': [0, 0, 0], 'ШТАМП': [0, 0, 0], 'ВЛ_ОПОРЫ': [51, 51, 51], 'ВЛ_ПРОВОДА': [138, 138, 138], 'ВОЛС': [10, 88, 168], 'МУФТЫ': [192, 57, 43], 'РАЗМЕРЫ': [85, 85, 85], 'ТЕКСТ': [0, 0, 0], 'ПЕРЕСЕЧЕНИЯ': [122, 77, 0] };
var _font = null;
function loadFont(url) {
  if (_font) return Promise.resolve(_font);
  return fetch(url || FONT_URL).then(function (r) { if (!r.ok) throw new Error('шрифт не загружен (' + r.status + ')'); return r.arrayBuffer(); })
    .then(function (buf) {
      var b = new Uint8Array(buf), s = '', CH = 0x8000;
      for (var i = 0; i < b.length; i += CH) s += String.fromCharCode.apply(null, b.subarray(i, i + CH));
      _font = btoa(s); return _font;
    });
}
function render(sheets, opt) {
  opt = opt || {};
  return loadFont(opt.fontUrl).then(function (font) {
    var J = global.jspdf && global.jspdf.jsPDF;
    if (!J) throw new Error('библиотека jsPDF не загружена');
    var doc = new J({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true });
    doc.addFileToVFS('DejaVuSansCondensed.ttf', font);
    doc.addFont('DejaVuSansCondensed.ttf', 'DejaVu', 'normal');
    doc.setFont('DejaVu', 'normal');
    sheets.forEach(function (sh, i) {
      if (i) doc.addPage('a3', 'landscape');
      sh.p.forEach(function (e) {
        var c = COLORS[e.l] || [0, 0, 0];
        doc.setDrawColor(c[0], c[1], c[2]);
        if (e.t === 'line') { doc.setLineWidth(e.w); doc.line(e.x1, e.y1, e.x2, e.y2); }
        else if (e.t === 'poly') {
          doc.setLineWidth(e.w);
          if (e.dash && doc.setLineDashPattern) doc.setLineDashPattern([3, 1.5], 0);
          var pts = e.c ? e.pts.concat([e.pts[0]]) : e.pts;
          for (var k = 1; k < pts.length; k++) doc.line(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]);
          if (e.dash && doc.setLineDashPattern) doc.setLineDashPattern([], 0);
        } else if (e.t === 'circle') {
          doc.setLineWidth(0.25);
          if (e.fill) { doc.setFillColor(c[0], c[1], c[2]); doc.circle(e.cx, e.cy, e.r, 'F'); } else doc.circle(e.cx, e.cy, e.r, 'S');
        } else if (e.t === 'image') {
          try { doc.addImage(e.href, e.x, e.y, e.w, e.h, undefined, 'FAST'); } catch (err) { if (global.console) console.warn('подложка не добавлена в PDF', err); }
        } else if (e.t === 'text') {
          if (e.wm) doc.setTextColor(227, 168, 168); else doc.setTextColor(c[0], c[1], c[2]);
          doc.setFontSize(e.h * 2.8346);
          doc.text(e.s, e.x, e.y, { align: e.a === 'middle' ? 'center' : (e.a === 'end' ? 'right' : 'left'), angle: e.rot ? -e.rot : 0 });
        }
      });
    });
    doc.setProperties({ title: opt.title || 'Чертежи', creator: 'PD_RD ' + (global.PDRD ? global.PDRD.VERSION : '') });
    return doc.output('arraybuffer');
  });
}
global.PDRD_PDF = { render: render, FONT_URL: FONT_URL };
})(typeof window !== 'undefined' ? window : globalThis);
