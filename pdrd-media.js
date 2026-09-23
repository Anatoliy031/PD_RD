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
      d.mapUnderlay = { dataUrl: url, name: file.name, nw: nw, se: se };
      return d.mapUnderlayMeta;
    });
  });
}
/* Сохранение подложки, уже полученной как data:URL (например, карта из тайлов) */
function saveUnderlayData(d, dataUrl, name, nw, se, extra) {
  extra = extra || {};
  var key = 'underlay_' + Date.now().toString(36);
  return put(key, dataUrl).then(function () {
    d.mapUnderlayMeta = { key: key, name: name, size: Math.round(dataUrl.length * 0.75), nw: nw, se: se, at: new Date().toISOString(),
                          attr: extra.attr || '', source: extra.source || '', zoom: extra.zoom || null };
    d.mapUnderlay = { dataUrl: dataUrl, name: name, nw: nw, se: se, attr: extra.attr || '' };
    return d.mapUnderlayMeta;
  });
}

function loadUnderlay(d) {
  var m = d.mapUnderlayMeta;
  if (!m || !m.key) { d.mapUnderlay = null; return Promise.resolve(null); }
  return get(m.key).then(function (url) {
    d.mapUnderlay = url ? { dataUrl: url, name: m.name, nw: m.nw, se: m.se, attr: m.attr || '' } : null;
    return d.mapUnderlay;
  }).catch(function () { d.mapUnderlay = null; return null; });
}
function removeUnderlay(d) {
  var m = d.mapUnderlayMeta;
  d.mapUnderlayMeta = null; d.mapUnderlay = null;
  return m && m.key ? del(m.key).catch(function () { return true; }) : Promise.resolve(true);
}
global.PDRD_MEDIA = { saveUnderlayData: saveUnderlayData, put: put, get: get, del: del, fileToDataUrl: fileToDataUrl, saveUnderlay: saveUnderlay, loadUnderlay: loadUnderlay, removeUnderlay: removeUnderlay };
})(typeof window !== 'undefined' ? window : globalThis);
