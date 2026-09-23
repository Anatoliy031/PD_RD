/* PD_RD — хранение растровых подложек в IndexedDB (база pdrd_media).
   В файл проекта .pdrd подложка не включается (размер); при переносе проекта
   подложку загружают заново на странице «Чертежи». */
(function (global) {
'use strict';
var DB = 'pdrd_media', STORE = 'files';
function open() {
  return new Promise(function (res, rej) {
    if (!global.indexedDB) return rej(new Error('IndexedDB недоступна'));
    var r = global.indexedDB.open(DB, 1);
    r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = function () { res(r.result); };
    r.onerror = function () { rej(r.error || new Error('не удалось открыть хранилище')); };
  });
}
function put(key, value) {
  return open().then(function (db) {
    return new Promise(function (res, rej) {
      var tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = function () { res(key); };
      tx.onerror = function () { rej(tx.error); };
    });
  });
}
function get(key) {
  return open().then(function (db) {
    return new Promise(function (res, rej) {
      var tx = db.transaction(STORE, 'readonly'), q = tx.objectStore(STORE).get(key);
      q.onsuccess = function () { res(q.result || null); };
      q.onerror = function () { rej(q.error); };
    });
  });
}
function del(key) {
  return open().then(function (db) {
    return new Promise(function (res, rej) {
      var tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = function () { res(true); };
      tx.onerror = function () { rej(tx.error); };
    });
  });
}
function fileToDataUrl(file) {
  return new Promise(function (res, rej) {
    var r = new FileReader();
    r.onload = function () { res(r.result); };
    r.onerror = function () { rej(r.error || new Error('файл не прочитан')); };
    r.readAsDataURL(file);
  });
}
/* Подложка проекта: мета — в проекте, изображение — в IndexedDB */
function saveUnderlay(d, file, nw, se) {
  return fileToDataUrl(file).then(function (url) {
    var key = 'underlay_' + Date.now().toString(36);
    return put(key, url).then(function () {
      d.mapUnderlayMeta = { key: key, name: file.name, size: file.size, nw: nw, se: se, at: new Date().toISOString() };
      d.mapUnderlay = { mode: 'image', dataUrl: url, name: file.name, nw: nw, se: se };
      return d.mapUnderlayMeta;
    });
  });
}
/* Сохранение подложки, уже полученной как data:URL (например, карта из тайлов) */
function saveUnderlayData(d, dataUrl, name, nw, se, extra) {
  extra = extra || {};
  var mode = extra.mode || 'image';
  var meta = { name: name, nw: nw, se: se, at: new Date().toISOString(), mode: mode,
               attr: extra.attr || '', source: extra.source || '', zoom: extra.zoom || null,
               tiles: mode === 'tiles' ? extra.tiles || [] : null, size: dataUrl ? Math.round(dataUrl.length * 0.75) : 0 };
  if (mode === 'tiles') {
    d.mapUnderlayMeta = meta;
    d.mapUnderlay = { mode: mode, tiles: meta.tiles, name: name, nw: nw, se: se, attr: meta.attr };
    return Promise.resolve(meta);
  }
  var key = 'underlay_' + Date.now().toString(36);
  meta.key = key;
  return put(key, dataUrl).then(function () {
    d.mapUnderlayMeta = meta;
    d.mapUnderlay = { mode: 'image', dataUrl: dataUrl, name: name, nw: nw, se: se, attr: meta.attr };
    return meta;
  });
}

function loadUnderlay(d) {
  var m = d.mapUnderlayMeta;
  if (!m) { d.mapUnderlay = null; return Promise.resolve(null); }
  if (m.mode === 'tiles') {
    d.mapUnderlay = { mode: 'tiles', tiles: m.tiles || [], name: m.name, nw: m.nw, se: m.se, attr: m.attr || '' };
    return Promise.resolve(d.mapUnderlay);
  }
  if (!m.key) { d.mapUnderlay = null; return Promise.resolve(null); }
  return get(m.key).then(function (url) {
    d.mapUnderlay = url ? { mode: 'image', dataUrl: url, name: m.name, nw: m.nw, se: m.se, attr: m.attr || '' } : null;
    return d.mapUnderlay;
  }).catch(function () { d.mapUnderlay = null; return null; });
}
function removeUnderlay(d) {
  var m = d.mapUnderlayMeta;
  d.mapUnderlayMeta = null; d.mapUnderlay = null;
  return m && m.key ? del(m.key).catch(function () { return true; }) : Promise.resolve(true);
}
/* Векторная топооснова OSM: данные — в IndexedDB, сведения — в проекте */
function saveVector(d, data) {
  var key = 'osmvec_' + Date.now().toString(36);
  return put(key, JSON.stringify(data.features)).then(function () {
    d.mapVectorMeta = { key: key, at: data.at, bbox: data.bbox, counts: data.counts, attr: data.attr, count: data.features.length };
    d.mapVector = { features: data.features, counts: data.counts, attr: data.attr };
    return d.mapVectorMeta;
  });
}
function loadVector(d) {
  var m = d.mapVectorMeta;
  if (!m || !m.key) { d.mapVector = null; return Promise.resolve(null); }
  return get(m.key).then(function (s) {
    d.mapVector = s ? { features: JSON.parse(s), counts: m.counts, attr: m.attr } : null;
    return d.mapVector;
  }).catch(function () { d.mapVector = null; return null; });
}
function removeVector(d) {
  var m = d.mapVectorMeta;
  d.mapVectorMeta = null; d.mapVector = null;
  return m && m.key ? del(m.key).catch(function () { return true; }) : Promise.resolve(true);
}

global.PDRD_MEDIA = { saveVector: saveVector, loadVector: loadVector, removeVector: removeVector, saveUnderlayData: saveUnderlayData, put: put, get: get, del: del, fileToDataUrl: fileToDataUrl, saveUnderlay: saveUnderlay, loadUnderlay: loadUnderlay, removeUnderlay: removeUnderlay };
})(typeof window !== 'undefined' ? window : globalThis);
