/* PD_RD — ядро: модель проекта pdrd-project/1, хранилище, резервная копия.
   Филиал ПАО «Россети Юг» — «Кубаньэнерго», ДРНУ.
   Правило общего origin: писать только в ключи с префиксом pdrd_.
   Данные АРМ ППО (V25) — только чтение и только по явной команде. */
(function (global) {
'use strict';

var VERSION = '1.0.1';
var SCHEMA  = 'pdrd-project/1';
var PREFIX  = 'pdrd_';
var KEY     = 'pdrd_project_v1';
var STAMP   = 'pdrd_project_v1_stamp';
var DB_NAME = 'pdrd_media';
/* Ключи V25. Запись в них запрещена (раздел 1.4 инструкции). */
var V25 = { object: 'ppo_vols_object_v2', photos: 'ppo_vols_photos' };

var GIP = {
  fio: 'Е.В. Куличкин',
  fioFull: 'Куличкин Евгений Владимирович',
  post: 'начальник отдела организации и развития дополнительных услуг'
};

/* ------------------------------------------------------------ запись */
function safeSet(key, value) {
  if (String(key).indexOf(PREFIX) !== 0)
    throw new Error('Запись в ключ «' + key + '» запрещена: PD_RD пишет только в ключи ' + PREFIX + '*');
  global.localStorage.setItem(key, value);
}
function safeRemove(key) {
  if (String(key).indexOf(PREFIX) !== 0)
    throw new Error('Удаление ключа «' + key + '» запрещено');
  global.localStorage.removeItem(key);
}

/* ------------------------------------------------------------ модель */
function blank() {
  var now = new Date().toISOString();
  return {
    schema: SCHEMA,
    app: VERSION,
    created: now,
    saved: null,
    passport: {
      shifr: '', shifrApproved: false,
      marks: { pd: [], rd: [] }, marksApproved: false,
      stage: 'ПД+РД',
      object: '', place: '',
      /* Роли сторон. Оператор связи — пользователь инфраструктуры и заказчик сети;
         подрядчик строит сеть в его интересах и может выступать заявителем. */
      operator: '',      // ПАО «Ростелеком»
      contractor: '',    // ООО «СвязьстройТелеКом»
      designCustomer: '',// заказчик ПД (с кем договор на ПИР)
      owner: 'ПАО «Россети Юг»',
      branch: 'филиал ПАО «Россети Юг» — «Кубаньэнерго»',
      signs: { gip: GIP.fio, gipPost: GIP.post, razrab: '', prov: '', nkontr: '' },
      releaseDate: ''
    },
    profile: { operator: 'rostelecom-b2c-gpon', switches: {} },
    basis: {
      tz: { number: '', date: '', title: '' },
      tu: { number: '', date: '' },
      contract: { number: '', date: '' },
      report13: { number: '', date: '', sha256: '', source: '' },
      surveys: { done: false, reports: '', reason: '' }
    },
    legal: {
      dpt:        { needed: null, ref: '' },
      permit:     { needed: null, ref: '' },
      expertise:  { needed: null, kind: '', ref: '' },
      land:       { text: '' },
      sro: { member: true, name: '', regNumber: '', extractDate: '' }
    },
    pdSwitches: { ilo: false, smeta: null },
    crossings: [],      // {line, from, to, object, kind, h_req_m, ref, note}
    metrology: [],      // {param, value, tol, nd, method, period, stage, si}
    designDefaults: {},
    decideParams: {},
    wiresByKv: {},
    stands: {},
    poleCapacity: {},
    releases: [],
    climate: { windRegion: '', windPa: null, iceRegion: '', iceMm: null,
               terrain: '', seismic: null, source: '', confirmed: false },
    cable: { mark: '', fibers: null, d_mm: null, mass_kg_km: null,
             t_allow_kn: null, t_break_kn: null, approved: false, cert: '' },
    lines: [],       // {id, name, kv, wires:[{mark,n,tension_kn,h_m}], existing:[]}
    poles: [],       // {id, coords:{lat,lon}, lines:[{lineId,num}], mark, state, fromReport:{}, design:{}}
    spans: [],
    crossings: [],
    sleeves: [],
    measuresE1: [],
    metrology: [],
    intake: [],      // результаты входного контроля
    spec: [], bor: [],
    audit: { at: null, items: [], overrides: [] },
    meta: { history: [] }
  };
}

/* Приведение к текущей схеме без потери данных */
function migrate(o) {
  var b = blank();
  if (!o || typeof o !== 'object') return b;
  if (o.schema && o.schema !== SCHEMA)
    throw new Error('Неизвестная схема файла проекта: ' + o.schema);
  (function fill(dst, src) {
    Object.keys(src).forEach(function (k) {
      var s = src[k], v = dst[k];
      if (v === undefined) { dst[k] = s; return; }
      if (s && typeof s === 'object' && !Array.isArray(s) &&
          v && typeof v === 'object' && !Array.isArray(v)) fill(v, s);
    });
  })(o, b);
  o.schema = SCHEMA;
  o.app = VERSION;
  if (!o.passport.signs.gip) o.passport.signs.gip = GIP.fio;
  return o;
}

/* ------------------------------------------------------------ хранилище */
var _data = null, _stamp = '';
function newStamp() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function load() {
  if (_data) return _data;
  var raw = null;
  try { raw = global.localStorage.getItem(KEY); } catch (e) {}
  if (!raw) { _data = blank(); return _data; }
  try { _data = migrate(JSON.parse(raw)); }
  catch (e) {
    console.error('PD_RD: проект в хранилище повреждён', e);
    _data = blank();
    _data.meta.loadError = String(e.message || e);
  }
  return _data;
}
function save() {
  var d = load();
  d.saved = new Date().toISOString();
  _stamp = newStamp();
  safeSet(KEY, JSON.stringify(d));
  safeSet(STAMP, _stamp);
  return d;
}
function refresh() { _data = null; return load(); }
function hasProject() {
  try { return !!global.localStorage.getItem(KEY); } catch (e) { return false; }
}
function reset() {
  safeRemove(KEY); safeRemove(STAMP);
  _data = null;
  return load();
}
function replaceAll(o) {
  _data = migrate(o);
  return save();
}

/* ------------------------------------------------------------ резервная копия */
function fileName(d) {
  var n = String(d.passport.shifr || d.passport.object || 'проект')
    .replace(/[^\wА-Яа-яЁё\-]+/g, '_').slice(0, 60);
  return 'PD_RD_' + n + '.pdrd';
}
function exportJson() {
  var d = load();
  var blob = new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' });
  return download(blob, fileName(d));
}
function parseProject(text) {
  var o = JSON.parse(text);
  if (!o || o.schema !== SCHEMA)
    throw new Error('Это не файл проекта PD_RD (ожидается схема ' + SCHEMA + ')');
  return migrate(o);
}
function importJson(file) {
  return file.text().then(function (t) { return replaceAll(parseProject(t)); });
}

/* ------------------------------------------------------------ АРМ ППО (V25) */
/* Только чтение. Возвращает сводку или null. Ничего не записывает. */
function readV25() {
  var raw = null;
  try { raw = global.localStorage.getItem(V25.object); } catch (e) { return null; }
  if (!raw) return null;
  var o;
  try { o = JSON.parse(raw); } catch (e) { return { error: 'данные АРМ ППО не читаются' }; }
  var pass = o.pass || {};
  return {
    version: o.v || '',
    object: pass['ОБЪЕКТ_НАИМ'] || '',
    report: pass['ОТЧЁТ_НОМЕР'] || '',
    reportDate: pass['ОТЧЁТ_ДАТА'] || '',
    poles: (o.poles || []).length,
    lines: (o.lines || []).length,
    raw: o
  };
}

/* Имена файлов — латиницей: одинаково открываются в Windows, macOS, iPad */
var TR = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya' };
function fileSafe(s) {
  return String(s || '').split('').map(function (c) {
    var l = c.toLowerCase(), r = TR[l];
    if (r === undefined) return c;
    return c === l ? r : (r.charAt(0).toUpperCase() + r.slice(1));
  }).join('').replace(/[^\w\-.]+/g, '_');
}
/* Сохранение файла. Ссылка на данные живёт 10 минут: на iPad Safari сначала
   спрашивает подтверждение, и ранний отзыв ссылки даёт пустой файл. */
function download(data, name, type) {
  var blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = fileSafe(name); a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 600000);
  return a.download;
}

/* Разбор формулировки V25 «ООО "…" в интересах ПАО "…"» на подрядчика и оператора */
function splitParties(s) {
  s = String(s || '').trim();
  var m = /^(.*?)\s+в\s+интересах\s+(.*)$/i.exec(s);
  if (!m) return { operator: s, contractor: '' };
  return { contractor: m[1].trim(), operator: m[2].trim() };
}

/* ------------------------------------------------------------ готовность к выпуску */
/* Предварительный перечень блокирующих пробелов паспорта (полный аудит — этап 7). */
function passportGaps(d) {
  d = d || load();
  var p = d.passport, s = p.signs, g = [];
  if (!p.shifr || !p.shifrApproved) g.push('Шифр не утверждён');
  if (!p.marksApproved) g.push('Марки комплектов не утверждены');
  if (!p.object) g.push('Не указано наименование объекта');
  if (!p.operator) g.push('Не указан оператор связи (пользователь инфраструктуры)');
  if (!s.razrab) g.push('Не указан «Разработал»');
  if (!s.prov) g.push('Не указан «Проверил»');
  if (!s.nkontr) g.push('Не указан «Н. контроль»');
  if (!s.gip) g.push('Не указан ГИП');
  var sro = d.legal.sro;
  if (!sro.name || !sro.regNumber || !sro.extractDate) g.push('Не заполнены реквизиты СРО');
  if (!d.basis.report13.number) g.push('Не указан отчёт по п. 13 Правил');
  if (!d.cable.approved) g.push('Кабель не выбран из утверждённого каталога');
  if (!p.releaseDate) g.push('Не указана дата выпуска');
  if (!p.designCustomer) g.push('Не указан заказчик проектной документации');
  if (!d.basis.tz.number) g.push('Не указано техническое задание');
  ['dpt', 'permit', 'expertise'].forEach(function (k) {
    var x = d.legal[k];
    if (x.needed === null || x.needed === undefined) g.push('Не решён вопрос: ' + { dpt: 'документация по планировке территории', permit: 'разрешение на строительство', expertise: 'экспертиза проектной документации' }[k]);
    else if (x.needed === false && !String(x.ref || '').trim()) g.push('Нет ссылки на норму: ' + { dpt: 'почему ДПТ не требуется', permit: 'почему разрешение не требуется', expertise: 'почему экспертиза не требуется' }[k]);
  });
  if (!d.basis.surveys.done && !String(d.basis.surveys.reason || '').trim()) g.push('Нет обоснования отсутствия инженерных изысканий');
  return g;
}

global.PDRD = {
  VERSION: VERSION, SCHEMA: SCHEMA, KEY: KEY, STAMP: STAMP, PREFIX: PREFIX,
  DB_NAME: DB_NAME, V25: V25, GIP: GIP,
  blank: blank, migrate: migrate, load: load, save: save, refresh: refresh,
  reset: reset, replaceAll: replaceAll, hasProject: hasProject,
  exportJson: exportJson, importJson: importJson, parseProject: parseProject,
  readV25: readV25, passportGaps: passportGaps, splitParties: splitParties, fileSafe: fileSafe, download: download,
  safeSet: safeSet
};
})(typeof window !== 'undefined' ? window : globalThis);
