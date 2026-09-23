/* PD_RD — векторная топооснова ситуационного плана по данным OpenStreetMap.
   Данные запрашиваются через Overpass API (сервер отдаёт заголовок
   Access-Control-Allow-Origin, поэтому данные доступны программе) и выводятся
   как линии, контуры и подписи: улицы и дороги с названиями, здания с номерами
   домов, реки и водоёмы, железные дороги.
   Такая подложка — векторная: она полностью попадает в просмотр, печать, PDF
   и в DXF (каждый вид — на своём слое), в отличие от растровых тайлов.
   © OpenStreetMap contributors, лицензия ODbL. */
(function (global) {
'use strict';
var ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];
var MAX_ELEMENTS = 40000;

var ROADS = {
  motorway: { w: 1.1, big: true }, trunk: { w: 1.0, big: true }, primary: { w: 0.9, big: true },
  secondary: { w: 0.8, big: true }, tertiary: { w: 0.7, big: true }, unclassified: { w: 0.5 },
  residential: { w: 0.5 }, living_street: { w: 0.45 }, service: { w: 0.3 }, track: { w: 0.3, dash: true },
  path: { w: 0.22, dash: true }, footway: { w: 0.22, dash: true }, cycleway: { w: 0.22, dash: true }
};

function query(bbox) {
  var b = [bbox.s, bbox.w, bbox.n, bbox.e].map(function (v) { return v.toFixed(6); }).join(',');
  return '[out:json][timeout:120];(' +
    'way["highway"](' + b + ');' +
    'way["railway"~"rail|light_rail|narrow_gauge|tram"](' + b + ');' +
    'way["waterway"~"river|stream|canal|ditch"](' + b + ');' +
    'way["natural"="water"](' + b + ');' +
    'way["building"](' + b + ');' +
    'way["landuse"~"forest|cemetery|industrial"](' + b + ');' +
    ');out geom tags;';
}

function classify(tags) {
  tags = tags || {};
  if (tags.building) return { kind: 'building', label: tags['addr:housenumber'] || '', w: 0.25 };
  if (tags.waterway) return { kind: 'water', label: tags.name || '', w: tags.waterway === 'river' ? 0.6 : 0.35 };
  if (tags.natural === 'water') return { kind: 'waterarea', label: tags.name || '', w: 0.35 };
  if (tags.railway) return { kind: 'rail', label: tags.name || '', w: 0.6 };
  if (tags.landuse) return { kind: 'landuse', label: tags.name || '', w: 0.2, landuse: tags.landuse };
  if (tags.highway) {
    var r = ROADS[tags.highway] || { w: 0.35 };
    return { kind: 'road', label: tags.name || tags.ref || '', w: r.w, dash: !!r.dash, big: !!r.big, road: tags.highway };
  }
  return null;
}

function parse(json) {
  var out = [];
  (json.elements || []).forEach(function (el) {
    if (!el.geometry || el.geometry.length < 2) return;
    var c = classify(el.tags);
    if (!c) return;
    var closed = el.geometry.length > 3 &&
      Math.abs(el.geometry[0].lat - el.geometry[el.geometry.length - 1].lat) < 1e-9 &&
      Math.abs(el.geometry[0].lon - el.geometry[el.geometry.length - 1].lon) < 1e-9;
    out.push({
      kind: c.kind, label: c.label, w: c.w, dash: c.dash, big: c.big, road: c.road, landuse: c.landuse,
      closed: closed || c.kind === 'building' || c.kind === 'waterarea' || c.kind === 'landuse',
      pts: el.geometry.map(function (p) { return [p.lat, p.lon]; })
    });
  });
  return out;
}

function fetchData(bbox, opt) {
  opt = opt || {};
  var body = 'data=' + encodeURIComponent(query(bbox));
  var urls = opt.endpoint ? [opt.endpoint] : ENDPOINTS;
  var i = 0;
  function next(err) {
    if (i >= urls.length) return Promise.reject(err || new Error('сервер OSM недоступен'));
    var u = urls[i++];
    return fetch(u, { method: 'POST', body: body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
      .then(function (r) { if (!r.ok) throw new Error('ответ сервера ' + r.status); return r.json(); })
      .catch(function (e) { return next(e); });
  }
  return next().then(function (json) {
    var feats = parse(json);
    if (feats.length > MAX_ELEMENTS) feats = feats.slice(0, MAX_ELEMENTS);
    var counts = { road: 0, building: 0, water: 0, waterarea: 0, rail: 0, landuse: 0, named: 0, houses: 0 };
    feats.forEach(function (f) {
      counts[f.kind] = (counts[f.kind] || 0) + 1;
      if (f.label) { counts.named++; if (f.kind === 'building') counts.houses++; }
    });
    return { at: new Date().toISOString(), bbox: bbox, features: feats, counts: counts,
             attr: '© OpenStreetMap contributors (ODbL)' };
  });
}

global.PDRD_OSM = { ENDPOINTS: ENDPOINTS, query: query, classify: classify, parse: parse, fetchData: fetchData, ROADS: ROADS };
})(typeof window !== 'undefined' ? window : globalThis);
