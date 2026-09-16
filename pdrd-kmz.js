/* PD_RD — трасса, опоры и муфты в KML/KMZ (WGS-84). */
(function (global) {
'use strict';
function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
var STYLE = { place: 'ok', recheck: 'cond', extra: 'cond', after: 'bad', bypass: 'off', exclude: 'off' };
function kml(d) {
  var X = global.PDRD_DECIDE, S = global.PDRD_SVG, o = [];
  o.push('<?xml version="1.0" encoding="UTF-8"?>');
  o.push('<kml xmlns="http://www.opengis.net/kml/2.2"><Document>');
  o.push('<name>' + esc(d.passport.object || 'PD_RD') + '</name>');
  o.push('<description>' + esc('Обозначение: ' + (d.passport.shifr || 'не утверждено') + '; отчёт п. 13: ' + d.basis.report13.number + '; PD_RD ' + global.PDRD.VERSION) + '</description>');
  [['ok', 'ff2e8b57'], ['cond', 'ff00a5ff'], ['bad', 'ff2b2ba3'], ['off', 'ff909090'], ['sl', 'ff0000ff']].forEach(function (s) {
    o.push('<Style id="' + s[0] + '"><IconStyle><color>' + s[1] + '</color><scale>0.6</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle><LabelStyle><scale>0.6</scale></LabelStyle></Style>');
  });
  o.push('<Style id="vols"><LineStyle><color>ffa8580a</color><width>4</width></LineStyle></Style>');
  o.push('<Style id="vl"><LineStyle><color>ff9a9a9a</color><width>1.5</width></LineStyle></Style>');
  var segs = S.segments(d), on = function (p) { return ['place', 'recheck', 'extra', 'after'].indexOf((p.design || {}).decision) >= 0; };
  var lineOff = {}; d.lines.forEach(function (l) { if (l.cable === false) lineOff[l.id] = 1; });
  ['vols', 'vl'].forEach(function (kind) {
    o.push('<Folder><name>' + (kind === 'vols' ? 'Трасса ВОЛС' : 'ВЛ без кабеля') + '</name>');
    segs.forEach(function (g) {
      var isV = on(g.a) && on(g.b) && !lineOff[g.line];
      if ((kind === 'vols') !== isV) return;
      if (!g.a.coords || !g.b.coords || g.a.coords.lat === null || g.b.coords.lat === null) return;
      o.push('<Placemark><styleUrl>#' + kind + '</styleUrl><name>' + esc(g.line) + '</name><LineString><tessellate>1</tessellate><coordinates>' +
        g.a.coords.lon.toFixed(7) + ',' + g.a.coords.lat.toFixed(7) + ',0 ' + g.b.coords.lon.toFixed(7) + ',' + g.b.coords.lat.toFixed(7) + ',0</coordinates></LineString></Placemark>');
    });
    o.push('</Folder>');
  });
  o.push('<Folder><name>Опоры</name>');
  d.poles.forEach(function (p) {
    if (!p.coords || p.coords.lat === null) return;
    var x = p.design || {};
    var desc = [p.mark, p.state, X ? X.title(x.decision) : x.decision, x.h_m ? 'высота подвеса ' + x.h_m + ' м' : '', (x.why || []).join('; ')].filter(Boolean).join('<br/>');
    o.push('<Placemark><name>' + esc((p.lines || []).map(function (l) { return l.num; }).join('/')) + '</name><styleUrl>#' + (x.sleeve ? 'sl' : (STYLE[x.decision] || 'off')) + '</styleUrl><description><![CDATA[' + (p.lines || []).map(function (l) { return esc(l.lineId); }).join('<br/>') + '<br/>' + desc + ']]></description><Point><coordinates>' + p.coords.lon.toFixed(7) + ',' + p.coords.lat.toFixed(7) + ',0</coordinates></Point></Placemark>');
  });
  o.push('</Folder></Document></kml>');
  return o.join('\n');
}
function kmz(d) {
  var z = new JSZip();
  z.file('doc.kml', kml(d));
  return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
global.PDRD_KMZ = { kml: kml, kmz: kmz };
})(typeof window !== 'undefined' ? window : globalThis);
