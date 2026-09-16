/* PD_RD — импорт исходных данных из АРМ ППО (V25) и входной контроль.
   Источники:
     1) резервная копия осмотра АРМ ППО (.json, объект ppo_vols_object_v2 + photoStore);
     2) готовый отчёт по п. 13 (.docx), выпущенный АРМ ППО, — разбор таблиц по заголовкам;
     3) осмотр АРМ ППО в этом браузере — только чтение, по кнопке.
   Все источники приводятся к обменной схеме vols-exchange/1, затем:
     — записи опор разных линий с совпадающими координатами (≤ 1,5 м) объединяются
       в физическую опору;
     — выполняется входной контроль (раздел 5.2 инструкции);
     — формируется проект pdrd-project/1. Данные отчёта в проекте только для чтения. */
(function (global) {
'use strict';

var SCHEMA = 'vols-exchange/1';
var MERGE_TOL_M = 1.5;
var W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/* ---------------------------------------------------------------- разбор значений */
function num(v) {
  if (v === null || v === undefined) return null;
  var s = String(v).replace(/\s+/g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
  if (s === '' || s === '-' || s === '.') return null;
  var n = parseFloat(s);
  return isFinite(n) ? n : null;
}
function str(v) {
  var s = String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim();
  return (s === '—' || s === '-' || s === '–') ? '' : s;
}
function kvOf(v) {
  var s = str(v).replace(/кВ/i, '').trim();
  if (!s || /все/i.test(s)) return null;
  return num(s);
}
function ruDate(s) {
  var m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(String(s || ''));
  return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
}
function haversine(a, b) {
  var R = 6371008.8, r = Math.PI / 180;
  var dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
function refs() { return global.PDRD_REFS_V25 || null; }

function sha256(buffer) {
  if (!global.crypto || !global.crypto.subtle) return Promise.resolve('');
  return global.crypto.subtle.digest('SHA-256', buffer).then(function (h) {
    return Array.prototype.map.call(new Uint8Array(h), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  });
}

function blankExchange(app) {
  return {
    schema: SCHEMA,
    source: { app: app, version: '', exported: new Date().toISOString(), sha256: '', kind: '' },
    report: { number: '', date: '', request: { number: '', date: '' }, tz: '', program: '',
              period: { from: '', to: '', raw: '' }, executors: [], figuresB: 0 },
    owner: { name: '', branch: '', address: '' },
    user: { raw: '', operator: '', contractor: '', address: '' },
    object: { name: '', place: '', length_km: null, u_classes: [], poles_declared: null },
    lines: [], poles: [],
    cable_declared: null, wires: [], measurements: 0, instruments: [],
    loads_annex_j: [], measures_E1: [], measures_E2: [],
    climate: { wind_region: '', wind_pa: null, ice_region: '', ice_mm: null, terrain_type: '',
               seismic: null, source: '', icewind_pa: null },
    passport_raw: {}, placeholders: [], annexG2: null, defectsB: []
  };
}

function splitUser(ex) {
  var p = global.PDRD ? global.PDRD.splitParties(ex.user.raw) : { operator: ex.user.raw, contractor: '' };
  ex.user.operator = p.operator.replace(/"([^"]*)"/g, '«$1»');
  ex.user.contractor = p.contractor.replace(/"([^"]*)"/g, '«$1»');
}

/* ---------------------------------------------------------------- 1. резервная копия АРМ ППО */
function fromV25Object(o) {
  if (!o || typeof o !== 'object' || !o.pass || !Array.isArray(o.poles))
    throw new Error('Файл не похож на резервную копию АРМ ППО: нет паспорта или перечня опор');
  var ex = blankExchange('VOLS_ARM'), R = refs(), pass = o.pass;
  ex.source.version = o.v || '';
  ex.source.kind = 'v25-json';
  ex.passport_raw = pass;
  ex.report.number = str(pass['ОТЧЁТ_НОМЕР']);
  ex.report.date = pass['ОТЧЁТ_ДАТА'] || '';
  ex.report.request = { number: str(pass['ЗАПРОС_НОМЕР']), date: pass['ЗАПРОС_ДАТА'] || '' };
  ex.report.period = { from: pass['РАБОТЫ_НАЧАЛО'] || '', to: pass['РАБОТЫ_ОКОНЧАНИЕ'] || '', raw: '' };
  ex.report.tz = [str(pass['ТЗ_НОМЕР']), str(pass['ТЗ_ДАТА'])].filter(Boolean).join(' от ');
  ex.report.program = [str(pass['ПРОГРАММА_НОМЕР']), str(pass['ПРОГРАММА_ДАТА'])].filter(Boolean).join(' от ');
  ex.report.executors = str(pass['ИСПОЛНИТЕЛЬ_СОСТАВ']).split(/[;,]\s*(?=[А-ЯЁ])/).map(str).filter(Boolean);
  ex.owner = { name: str(pass['ВЛАДЕЛЕЦ_НАИМ']), branch: str(pass['ВЛАДЕЛЕЦ_ФИЛИАЛ']), address: str(pass['ВЛАДЕЛЕЦ_АДРЕС']) };
  ex.user.raw = str(pass['ПОЛЬЗОВАТЕЛЬ_НАИМ']); ex.user.address = str(pass['ПОЛЬЗОВАТЕЛЬ_АДРЕС']);
  splitUser(ex);
  ex.object.name = str(pass['ОБЪЕКТ_НАИМ']);
  ex.object.place = str(pass['ОБЪЕКТ_МЕСТО']);
  ex.object.length_km = num(pass['ОБЪЕКТ_ДЛИНА']);
  ex.climate.wind_region = str(pass['ВЕТЕР_РАЙОН']);
  ex.climate.ice_region = str(pass['ГОЛОЛЁД_РАЙОН'] || pass['ГОЛОЛЕД_РАЙОН']);
  ex.climate.wind_pa = num(pass['ВЕТЕР_ДАВЛЕНИЕ']);
  ex.climate.ice_mm = num(pass['ГОЛОЛЁД_СТЕНКА']);
  ex.climate.terrain_type = str(pass['МЕСТНОСТЬ_ТИП']).charAt(0).replace('А', 'A').replace('В', 'B').replace('С', 'C');
  ex.climate.seismic = num(pass['СЕЙСМИКА']);
  ex.climate.source = str(pass['КЛИМАТ_ИСТОЧНИК']);
  Object.keys(pass).forEach(function (k) {
    if (/_{3,}|__\.__/.test(String(pass[k])) || /согласно\s+СУПА/i.test(String(pass[k]))) ex.placeholders.push(k);
  });
  var lines = {};
  (o.lines || []).forEach(function (l) {
    var name = str(l.line || l.disp); if (!name) return;
    lines[name] = { id: name, name: name, u_kv: kvOf(l.kv), wires: [], existing_cables: [], inv: str(l.inv), right: str(l.right) };
  });
  o.poles.forEach(function (p, i) {
    var ref = R ? R.poleByMark(p.mark) : null;
    var df = R ? R.defectByCat(p.defect) : { state: '', tv: '' };
    var name = str(p.line);
    if (name && !lines[name]) lines[name] = { id: name, name: name, u_kv: kvOf(p.kv), wires: [], existing_cables: [], fromPoles: true };
    ex.poles.push({
      row: i + 1, line_id: name, num: str(p.num), kv: kvOf(p.kv), mark: str(p.mark),
      material: ref ? ref.mat : '', role: ref ? ref.type : str(p.poleType), scheme: ref ? ref.sch : '',
      prev: str(p.prevRef), span_prev_m: null, next: str(p.nextRef), span_next_m: num(p.span),
      span_design_m: num(p.span), span_gabarit_m: ref ? ref.lgab : null,
      terrain: str(p.mest), clearance_norm_m: null, existing: str(p.prevOwner), existing_h: num(p.prevH),
      lat: num(p.lat), lon: num(p.lon), angle: num(p.angle), end_pole: !!p.endPole,
      defect: str(p.defText) || (df.cat !== '—' ? df.txt : ''), defect_cat: str(p.defect) === '—' ? '' : str(p.defect),
      state_gost: df.state, tech_possibility: df.tv === 'отсутствует' ? 'нет' : (df.tv === 'есть при условии' ? 'с мероприятиями' : 'есть'),
      measure: df.act || '', photos: (p.photos || []).length
    });
  });
  ex.lines = Object.keys(lines).map(function (k) { return lines[k]; });
  (o.wires || []).forEach(function (w) {
    ex.wires.push({ mark: str(w.mark), n: num(w.n), kv: kvOf(w.kv), kv_raw: str(w.kv), h_m: num(w.h), tension_kn: num(w.tens), belong: str(w.belong) });
  });
  var c = (o.cables || [])[0];
  if (c) {
    var cr = R ? R.cableByMark(c.mark) : null;
    ex.cable_declared = { mark: str(c.mark), type: cr ? cr.type : '', d_mm: cr ? cr.d : null, mass_kg_km: cr ? cr.m : null,
      t_allow_kn: cr ? cr.t : null, t_mount_kn: num(c.tens), h_m: num(c.h), kv_raw: str(c.kv), fittings: str(c.arm) };
  }
  ex.measurements = (o.meas || []).length;
  ex.instruments = (o.si || []).map(function (s) { return { name: str(s.name), mark: str(s.mark), sn: str(s.sn), fgis: str(s.fgis), from: s.d1 || '', to: s.d2 || '' }; });
  (o.acts || []).forEach(function (a) {
    if (!a.manual) return;
    var rec = { line: str(a.line), num: str(a.num), text: str(a.act || a.actText), basis: str(a.base), performer: str(a.performer), group: str(a.grp) };
    (/Е\.?2/.test(rec.group) ? ex.measures_E2 : ex.measures_E1).push(rec);
  });
  return ex;
}

/* ---------------------------------------------------------------- 2. отчёт .docx */
function docxTables(xml) {
  var doc = new DOMParser().parseFromString(xml, 'application/xml');
  var body = doc.getElementsByTagNameNS(W, 'body')[0];
  var paras = [], tables = [], last = '';
  function text(n) {
    var ts = n.getElementsByTagNameNS(W, 't'), s = '';
    for (var i = 0; i < ts.length; i++) s += ts[i].textContent;
    return s.replace(/\s+/g, ' ').trim();
  }
  Array.prototype.forEach.call(body.childNodes, function (n) {
    if (n.nodeType !== 1) return;
    if (n.localName === 'p') { var t = text(n); if (t) { paras.push(t); last = t; } }
    else if (n.localName === 'tbl') {
      var rows = [];
      Array.prototype.forEach.call(n.childNodes, function (tr) {
        if (tr.nodeType !== 1 || tr.localName !== 'tr') return;
        var cells = [];
        Array.prototype.forEach.call(tr.childNodes, function (tc) {
          if (tc.nodeType === 1 && tc.localName === 'tc') cells.push(text(tc));
        });
        rows.push(cells);
      });
      tables.push({ after: last, head: rows[0] || [], rows: rows.slice(1) });
    }
  });
  return { paras: paras, tables: tables };
}

function colIndex(head) {
  var m = {};
  head.forEach(function (h, i) { m[h] = i; });
  return function (name) {
    if (m[name] !== undefined) return m[name];
    for (var k in m) if (k.indexOf(name) === 0) return m[k];
    return -1;
  };
}
function has(head, names) { var j = head.join('|'); return names.every(function (n) { return j.indexOf(n) >= 0; }); }

function fromReportDocxXml(xml) {
  var parsed = docxTables(xml), ex = blankExchange('VOLS_ARM');
  ex.source.kind = 'report-docx';
  var P = parsed.paras;
  P.forEach(function (t) {
    var m;
    if ((m = /Регистрационный номер\s+(\S+)\s+от\s+(\d{2}\.\d{2}\.\d{4})/.exec(t))) { ex.report.number = m[1]; ex.report.date = ruDate(m[2]); }
    if ((m = /^Объект инфраструктуры:\s*(.+)$/.exec(t))) ex.object.name = m[1];
    if ((m = /^Пользователь инфраструктуры:\s*(.+)$/.exec(t))) ex.user.raw = m[1];
    if ((m = /^Запрос\s+(?:No|№)\s*(.+?)\s+от\s+(\d{2}\.\d{2}\.\d{4})/.exec(t))) ex.report.request = { number: m[1].replace(/\s+/g, ' '), date: ruDate(m[2]) };
    if (/^Рисунок В\.\d+/.test(t)) ex.report.figuresB++;
    if (/_{4,}|__\.__\.____/.test(t) && !/Подпись|УТВЕРЖДАЮ|«____»/.test(t) && !/^_+\s+[А-ЯЁ]\.\s?[А-ЯЁ]\./.test(t) && t.replace(/[_\s.]/g, '').length > 3)
      ex.placeholders.push(t.length > 90 ? t.slice(0, 90) + '…' : t);
    if (/Приложение Г\.2/.test(t)) ex.annexG2 = ex.annexG2 || 'есть раздел';
    if (/Г\.2.*не выполн|не выполнялся.*Г\.2|свободн\w+ интервал\w* не определ/i.test(t)) ex.annexG2 = 'не выполнено';
  });
  var kv = {};
  parsed.tables.forEach(function (T) {
    var h = T.head, c = colIndex(h);
    if (h[0] === 'Сведения' && h[1] === 'Значение') {
      T.rows.forEach(function (r) {
        var k = r[0] || '';
        if (kv[k] !== undefined) k = k + ' (' + (T.after || '').slice(0, 30) + ')';
        kv[k] = r[1] || '';
      });
      return;
    }
    if (has(h, ['Линия (фидер)', '№ опоры', 'Широта'])) {
      T.rows.forEach(function (r) {
        var g = function (n) { var i = c(n); return i < 0 ? '' : r[i]; };
        ex.poles.push({
          row: num(g('№')), line_id: str(g('Линия (фидер)')), num: str(g('№ опоры')), kv: kvOf(g('Класс, кВ')),
          mark: str(g('Марка')), material: str(g('Материал')), role: str(g('Тип по назначению')), scheme: '',
          prev: str(g('Смежная опора (пред.)')), span_prev_m: num(g('Пролёт до пред.')),
          next: str(g('Смежная опора (след.)')), span_next_m: num(g('Пролёт до след.')),
          span_design_m: num(g('Расч. пролёт')), span_gabarit_m: num(g('Габарит. пролёт')),
          terrain: str(g('Местность')), clearance_norm_m: num(g('Габарит норм.')), existing: str(g('Ранее размещ. ОК')),
          defect: str(g('Дефект')), defect_cat: str(g('Кат.')), state_gost: str(g('Состояние')),
          tech_possibility: str(g('Технол. возможность')), measure: str(g('Мероприятие')),
          lat: num(g('Широта')), lon: num(g('Долгота')), photos: 0
        });
      });
      return;
    }
    if (has(h, ['Тип элемента сети электросвязи'])) {
      var r0 = T.rows[0] || [], g0 = function (n) { var i = c(n); return i < 0 ? '' : r0[i]; };
      ex.cable_declared = { mark: str(g0('Марка')), type: str(g0('Тип элемента')), d_mm: num(g0('Диаметр')),
        mass_kg_km: num(g0('Масса')), t_allow_kn: num(g0('Допустимое тяжение')), t_mount_kn: num(g0('Монтажное тяжение')),
        h_m: num(g0('Высота подвеса')), kv_raw: str(g0('Класс напряжения')), fittings: str(g0('Линейная арматура')) };
      return;
    }
    if (has(h, ['Марка провода / кабеля'])) {
      T.rows.forEach(function (r) {
        var g = function (n) { var i = c(n); return i < 0 ? '' : r[i]; };
        ex.wires.push({ mark: str(g('Марка провода')), n: num(g('Кол-во')), d_mm: num(g('Диаметр')), mass_kg_km: num(g('Масса')),
          h_m: num(g('Высота подвеса')), tension_kn: num(g('Тяжение')), kv: kvOf(g('Класс, кВ')), kv_raw: str(g('Класс, кВ')), belong: str(g('Принадлежность')) });
      });
      return;
    }
    if (has(h, ['Описание дефекта'])) {
      T.rows.forEach(function (r) {
        var g = function (n) { var i = c(n); return i < 0 ? '' : r[i]; };
        ex.defectsB.push({ line: str(g('Линия (фидер)')), num: str(g('№ опоры')), mark: str(g('Марка')),
          text: str(g('Описание дефекта')), cat: str(g('Категория дефекта')), state: str(g('Состояние')), note: str(g('Примечание')) });
      });
      return;
    }
    if (has(h, ['Вид измерения'])) { ex.measurements = T.rows.length; return; }
    if (has(h, ['Наименование средства измерения'])) {
      T.rows.forEach(function (r) {
        var g = function (n) { var i = c(n); return i < 0 ? '' : r[i]; };
        ex.instruments.push({ name: str(g('Наименование')), mark: str(g('Тип / марка')), sn: str(g('Заводской')),
          fgis: str(g('№ записи о поверке')), from: ruDate(g('Дата поверки')), to: ruDate(g('Действительна до')) });
      });
      return;
    }
    if (has(h, ['Мероприятие', 'Основание'])) {
      var e1 = has(h, ['Исполнитель']);
      T.rows.forEach(function (r) {
        var g = function (n) { var i = c(n); return i < 0 ? '' : r[i]; };
        var rec = { line: str(g('Линия (фидер)')), num: str(g('№ опоры')), text: str(g('Мероприятие')),
                    basis: str(g('Основание')), performer: e1 ? str(g('Исполнитель')) : '', term: str(g('Срок')) };
        (e1 ? ex.measures_E1 : ex.measures_E2).push(rec);
      });
      return;
    }
    if (has(h, ['Mдоп'])) {
      T.rows.forEach(function (r) {
        var g = function (n) { var i = c(n); return i < 0 ? '' : r[i]; };
        ex.loads_annex_j.push({ mark: str(g('Марка опоры')), scheme: str(g('Схема')), span_m: num(g('Расч. пролёт')),
          m_adm: num(g('Mдоп')), m_exist: num(g('M от существующей')), m_cable: num(g('M от размещаемого')),
          m_tension: str(g('M от тяжения')), m_sum: num(g('M суммарный')), reserve_pct: num(g('Запас')) });
      });
    }
  });
  /* Описание дефекта берётся из ведомости дефектов (прил. В): в перечне опор
     АРМ ППО печатает типовой текст категории. Расхождение — предмет контроля. */
  ex.defectsB.forEach(function (dfc) {
    ex.poles.forEach(function (p) {
      if (p.line_id === dfc.line && p.num === dfc.num) {
        p.defect_list = p.defect;
        if (dfc.text) p.defect = dfc.text.replace(/;\s*$/, '');
      }
    });
  });
  var K = function (prefix) { for (var k in kv) if (k.indexOf(prefix) === 0) return kv[k]; return ''; };
  ex.passport_raw = kv;
  ex.owner = { name: K('Владелец инфраструктуры'), branch: K('Филиал / предприятие'), address: K('Адрес') };
  if (!ex.user.raw) ex.user.raw = K('Пользователь инфраструктуры');
  splitUser(ex);
  if (!ex.object.name) ex.object.name = K('Наименование объекта');
  ex.object.place = K('Место расположения');
  ex.object.length_km = num(K('Протяжённость участка'));
  ex.object.poles_declared = num(K('Количество опор'));
  ex.object.u_classes = (K('Класс(ы) напряжения').split('(')[0].match(/\d+(?:,\d+)?/g) || []).map(num);
  var pr = K('Период выполнения работ');
  var pm = /с\s+(\d{2}\.\d{2}\.\d{4})\s+по\s+(\d{2}\.\d{2}\.\d{4})/.exec(pr);
  ex.report.period = { from: pm ? ruDate(pm[1]) : '', to: pm ? ruDate(pm[2]) : '', raw: pr };
  ex.report.tz = K('Техническое задание'); ex.report.program = K('Программа работ');
  ex.report.executors = K('Состав исполнителей').split(/[;,]\s*(?=[А-ЯЁ])/).map(str).filter(Boolean);
  var wnd = K('Район по ветровому давлению'), ice = K('Район по гололёду');
  ex.climate.wind_region = (/^([IVX]+)/.exec(wnd) || [])[1] || '';
  ex.climate.wind_pa = num((/(\d+)\s*Па/.exec(wnd) || [])[1]);
  ex.climate.ice_region = (/^([IVX]+|особый)/i.exec(ice) || [])[1] || '';
  ex.climate.ice_mm = num((/(\d+)\s*мм/.exec(ice) || [])[1]);
  ex.climate.terrain_type = ((/^([ABCАВС])\b/.exec(K('Тип местности')) || [])[1] || '').replace('А', 'A').replace('В', 'B').replace('С', 'C');
  ex.climate.seismic = num(K('Сейсмичность'));
  ex.climate.source = K('Источник климатических данных');
  ex.climate.icewind_pa = num((/^(\d+)\s*Па/.exec(K('Ветровое давление при гололёде')) || [])[1]);
  Object.keys(kv).forEach(function (k) { if (/_{3,}/.test(kv[k]) || /согласно\s+СУПА/i.test(kv[k])) ex.placeholders.push(k + ': ' + kv[k].slice(0, 60)); });
  var lines = {};
  ex.poles.forEach(function (p) {
    if (!p.line_id) return;
    if (!lines[p.line_id]) lines[p.line_id] = { id: p.line_id, name: p.line_id, u_kv: p.kv, wires: [], existing_cables: [], fromPoles: true, kvSet: {} };
    if (p.kv !== null) lines[p.line_id].kvSet[p.kv] = 1;
  });
  ex.lines = Object.keys(lines).map(function (k) {
    var l = lines[k], ks = Object.keys(l.kvSet).map(Number);
    l.u_kv = ks.length === 1 ? ks[0] : (ks.length ? Math.max.apply(null, ks) : null);
    l.kvConflict = ks.length > 1; delete l.kvSet; return l;
  });
  ex.linesSheetEmpty = parsed.paras.some(function (t) { return /Лист «Линии».*не заполнен/.test(t); });
  return ex;
}

function fromReportDocx(buffer) {
  return JSZip.loadAsync(buffer).then(function (zip) {
    var f = zip.file('word/document.xml');
    if (!f) throw new Error('Файл не является документом Word');
    return f.async('string');
  }).then(function (xml) {
    var ex = fromReportDocxXml(xml);
    if (!ex.poles.length) throw new Error('В документе нет таблицы «Перечень задействованных опор» — это не отчёт АРМ ППО');
    return ex;
  });
}

/* ---------------------------------------------------------------- объединение опор */
function mergePoles(records, tol) {
  tol = tol || MERGE_TOL_M;
  var phys = [], cell = 1e-4, grid = {};
  function key(la, lo) { return Math.floor(la / cell) + ':' + Math.floor(lo / cell); }
  records.forEach(function (r) {
    var target = null;
    if (r.lat !== null && r.lon !== null) {
      var gi = Math.floor(r.lat / cell), gj = Math.floor(r.lon / cell);
      for (var di = -1; di <= 1 && !target; di++) for (var dj = -1; dj <= 1 && !target; dj++) {
        (grid[(gi + di) + ':' + (gj + dj)] || []).some(function (p) {
          if (haversine(p.coords, r) <= tol && p.records.every(function (x) { return x.line_id !== r.line_id; })) { target = p; return true; }
          return false;
        });
      }
    }
    if (!target) {
      target = { id: 'op' + (phys.length + 1), coords: { lat: r.lat, lon: r.lon }, records: [] };
      phys.push(target);
      if (r.lat !== null && r.lon !== null) (grid[key(r.lat, r.lon)] = grid[key(r.lat, r.lon)] || []).push(target);
    }
    target.records.push(r);
  });
  return phys;
}

/* ---------------------------------------------------------------- входной контроль */
var RULES = {
  dates:      { n: 1,  title: 'Даты исходных данных' },
  passport:   { n: 2,  title: 'Незаполненные разделы отчёта' },
  wires:      { n: 3,  title: 'Существующая подвеска по классам и линиям' },
  cable:      { n: 4,  title: 'Заявленные характеристики кабеля' },
  e1:         { n: 5,  title: 'Исполнитель мероприятий Е.1' },
  e2:         { n: 6,  title: 'Мероприятия Е.2 в проектной документации' },
  photos:     { n: 7,  title: 'Фотофиксация аварийных опор' },
  material:   { n: 8,  title: 'Дефект и материал опоры' },
  mark:       { n: 9,  title: 'Марка и класс напряжения опоры' },
  terrain:    { n: 10, title: 'Тип опоры и характер местности' },
  g2:         { n: 11, title: 'Свободные интервалы на опорах (прил. Г.2)' },
  si:         { n: 12, title: 'Сведения о средствах измерений' },
  merge:      { n: 13, title: 'Совместные опоры разных линий' },
  count:      { n: 14, title: 'Полнота перечня опор' },
  decisions:  { n: 15, title: 'Проектные развилки' },
  reference:  { n: 16, title: 'Справочные данные опор' }
};

function intake(ex, phys) {
  var out = [];
  function add(rule, lv, text, opt) {
    opt = opt || {};
    out.push({ rule: rule, n: RULES[rule].n, title: RULES[rule].title, lv: lv, text: text,
               where: opt.where || '', ask: opt.ask || '', fix: opt.fix || '', count: opt.count || 0 });
  }
  var R = refs();

  /* 1. Даты */
  var pr = ex.report.period;
  if (pr.from && pr.to && pr.from > pr.to)
    add('dates', 'stop', 'Период работ указан с ' + ru(pr.from) + ' по ' + ru(pr.to) + ': дата окончания раньше даты начала.', { ask: 'владельцу', where: 'раздел 4.1 отчёта' });
  if (!ex.report.number || !ex.report.date) add('dates', 'stop', 'Не определены номер или дата отчёта по п. 13.', { ask: 'владельцу' });
  if (ex.report.request.date && ex.report.date && ex.report.request.date > ex.report.date)
    add('dates', 'stop', 'Дата запроса (' + ru(ex.report.request.date) + ') позже даты отчёта (' + ru(ex.report.date) + ').', { ask: 'владельцу' });
  if (pr.to && ex.report.date && pr.to > ex.report.date)
    add('dates', 'warn', 'Окончание работ (' + ru(pr.to) + ') позже даты отчёта (' + ru(ex.report.date) + ').', { ask: 'владельцу' });

  /* 2. Незаполненные разделы */
  if (ex.placeholders.length)
    add('passport', 'warn', 'В отчёте остались незаполненные сведения (' + ex.placeholders.length + '): ' + ex.placeholders.slice(0, 4).map(function (s) { return '«' + s + '»'; }).join(', ') + (ex.placeholders.length > 4 ? '…' : '') + '. Для пояснительной записки ПД нужны паспорта ВЛ и сведения о ранее размещённых сетях.', { ask: 'владельцу', count: ex.placeholders.length });
  if (ex.linesSheetEmpty || ex.lines.every(function (l) { return l.fromPoles; }))
    add('passport', 'warn', 'Сведения о линиях (инвентарный номер, год ввода, основание владения) в отчёте не приведены; перечень линий восстановлен по опорам (' + ex.lines.length + ').', { ask: 'владельцу', count: ex.lines.length });

  /* 3. Существующая подвеска */
  var classes = {};
  ex.poles.forEach(function (p) { if (p.kv !== null) classes[p.kv] = 1; });
  var kvList = Object.keys(classes).map(Number).sort(function (a, b) { return a - b; });
  if (!ex.wires.length) add('wires', 'stop', 'Существующая подвеска (провода ВЛ) не указана — нагрузки на опоры не могут быть рассчитаны.', { ask: 'владельцу' });
  ex.wires.forEach(function (w) {
    var tag = (w.mark || 'провод') + (w.n ? ' ×' + w.n : '');
    if (w.kv === null && kvList.length > 1)
      add('wires', 'stop', tag + ' указан для класса «' + (w.kv_raw || 'не указан') + '», тогда как на объекте классы ' + kvList.map(fmtKv).join(' и ') + ' кВ. Провода задаются отдельно по каждой линии и классу напряжения; расчёт нагрузок по отчёту для опор 0,4 кВ не переносится и выполняется заново.', { ask: 'владельцу', fix: 'задать провода по классам в разделе «Линии»' });
    if (w.tension_kn === null) add('wires', 'stop', tag + ': тяжение не указано — анкерные, угловые, концевые и ответвительные опоры не считаются.', { ask: 'владельцу' });
    if (w.h_m === null) add('wires', 'warn', tag + ': высота подвеса не указана — принимается по типовому проекту опоры с отметкой.', { ask: 'владельцу' });
    if (/^А[СC]?\s/.test(w.mark) && (w.kv === null || w.kv <= 1) && kvList.indexOf(0.4) >= 0)
      add('wires', 'warn', tag + ' отнесён к ВЛ 0,4 кВ. Расстояние ОКСН — провод ВЛ до 1 кВ — 0,4 м (ТТ № 282р, п. 3.2.2 — для СИП; ПУЭ-7, п. 2.4.89 — для любых проводов). Марку, сечение и тяжение проводов ВЛ 0,4 кВ подтвердить.', { ask: 'владельцу' });
  });

  /* 4. Кабель */
  var cb = ex.cable_declared;
  if (!cb || !cb.mark) add('cable', 'stop', 'Размещаемый кабель в отчёте не указан.', { ask: 'пользователю' });
  else {
    if (cb.t_allow_kn === null) add('cable', 'stop', 'Кабель ' + cb.mark + ': допустимое тяжение не указано.', { ask: 'пользователю' });
    if (cb.t_mount_kn === null) add('cable', 'stop', 'Кабель ' + cb.mark + ': монтажное тяжение не указано — берётся из паспорта или расчёта PD_RD.', { ask: 'пользователю' });
    else if (cb.t_allow_kn !== null && cb.t_mount_kn >= cb.t_allow_kn)
      add('cable', 'warn', 'Кабель ' + cb.mark + ': монтажное тяжение (' + fmt(cb.t_mount_kn) + ' кН) равно допустимому или больше него. В проекте монтажное тяжение определяется расчётом по монтажным таблицам; значение из отчёта не используется.', { ask: 'пользователю' });
    if (!cb.type) add('cable', 'warn', 'Кабель ' + cb.mark + ': тип элемента сети не указан (ОКСН, ОКНН и т. д.) — определить по паспорту.', { ask: 'пользователю' });
    if (cb.d_mm === null || cb.mass_kg_km === null) add('cable', 'stop', 'Кабель ' + cb.mark + ': не указаны диаметр или масса.', { ask: 'пользователю' });
    add('cable', 'info', 'Характеристики кабеля ' + cb.mark + ' приняты по отчёту (d = ' + fmt(cb.d_mm) + ' мм, ' + fmt(cb.mass_kg_km) + ' кг/км, допустимое тяжение ' + fmt(cb.t_allow_kn) + ' кН) и подлежат подтверждению паспортом изготовителя и декларацией соответствия.', { ask: 'пользователю' });
  }

  /* 5. Е.1 */
  var badE1 = ex.measures_E1.filter(function (m) { return m.performer && !/пользовател/i.test(m.performer); });
  if (badE1.length)
    add('e1', 'stop', 'В группе Е.1 ' + badE1.length + ' мероприят' + (badE1.length === 1 ? 'ие' : 'ий') + ' с исполнителем «' + badE1[0].performer + '». Мероприятия, обусловленные размещением, выполняет пользователь инфраструктуры (ч. 1 ст. 10 135-ФЗ — недопустимость переложения). При импорте исполнитель исправлен с отметкой.', { fix: 'исполнитель — пользователь инфраструктуры', count: badE1.length, where: badE1.slice(0, 3).map(function (m) { return m.text.slice(0, 70); }).join('; ') });

  /* 6. Е.2 */
  var e2pd = ex.measures_E2.filter(function (m) { return /в проектную документацию/i.test(m.text); });
  if (e2pd.length)
    add('e2', 'warn', 'Мероприятия Е.2 (' + e2pd.length + ') содержат формулировку «в проектную документацию». В ПД они не включаются как работы пользователя: соответствующие опоры исключаются из размещения или размещение предусматривается после их восстановления владельцем.', { count: e2pd.length });

  /* 7. Фото аварийных */
  var avar = ex.poles.filter(function (p) { return /аварийн/i.test(p.state_gost); });
  if (ex.source.kind === 'report-docx' && avar.length && ex.report.figuresB < avar.length)
    add('photos', 'warn', 'Аварийных опор — ' + avar.length + ', фотографий в приложении В — ' + ex.report.figuresB + '. Для недостающих опор запросить фотоматериалы.', { ask: 'владельцу', count: avar.length - ex.report.figuresB });
  if (ex.source.kind === 'v25-json') {
    var nophoto = avar.filter(function (p) { return !p.photos; });
    if (nophoto.length) add('photos', 'warn', 'Аварийных опор без фотографий — ' + nophoto.length + '.', { ask: 'владельцу', count: nophoto.length });
  }

  /* 8. Дефект и материал */
  var mism = ex.poles.filter(function (p) { return p.defect_list && p.defect_list !== p.defect; });
  if (mism.length)
    add('material', 'warn', 'Описание дефекта в перечне опор (прил. Б) и в ведомости дефектов (прил. В) различается у ' + mism.length + ' опор: принято описание из ведомости дефектов.', { ask: 'владельцу', count: mism.length, where: mism.slice(0, 5).map(function (p) { return '№ ' + p.num + ' (' + p.mark + ')'; }).join(', ') });
  ex.poles.forEach(function (p) {
    if (/древесин|дерев/i.test(p.defect) && /бетон/i.test(p.material))
      add('material', 'stop', 'Опора № ' + p.num + ' (' + p.mark + ', ' + p.material.toLowerCase() + '): дефект «' + p.defect + '» характерен для деревянных опор. Материал или дефект уточнить.', { ask: 'владельцу', where: p.line_id });
    if (/бетон|арматур/i.test(p.defect) && /дерев/i.test(p.material) && !/приставк/i.test(p.material))
      add('material', 'stop', 'Опора № ' + p.num + ': дефект «' + p.defect + '» при материале «' + p.material + '». Уточнить.', { ask: 'владельцу', where: p.line_id });
  });

  /* 9. Марка и класс */
  var noMark = ex.poles.filter(function (p) { return !p.mark || p.kv === null; });
  if (noMark.length)
    add('mark', 'stop', 'Записи без марки или класса напряжения (' + noMark.length + '): ' + noMark.slice(0, 6).map(function (p) { return '№ ' + p.row + ' (опора ' + (p.num || '?') + ')'; }).join(', ') + '. Без марки расчёт нагрузок невозможен.', { ask: 'владельцу', count: noMark.length });
  var noCoord = ex.poles.filter(function (p) { return p.lat === null || p.lon === null; });
  if (noCoord.length) add('mark', 'stop', 'Записи без координат (' + noCoord.length + ').', { ask: 'владельцу', count: noCoord.length });

  /* 10. Тип опоры и местность */
  var tm = {};
  ex.poles.forEach(function (p) {
    var ref = R ? R.poleByMark(p.mark) : null;
    var t = (p.role || '') + ' ' + (ref ? ref.type : '');
    var nen = /ненасел/i.test(t), nas = /\(насел/i.test(t);
    var here = /ненасел|труднодост/i.test(p.terrain) ? 'ненаселённая' : (p.terrain ? 'населённая' : '');
    if ((nen && here === 'населённая') || (nas && here === 'ненаселённая')) { tm[p.mark] = (tm[p.mark] || 0) + 1; }
  });
  Object.keys(tm).forEach(function (m) {
    add('terrain', 'warn', 'Опоры ' + m + ' (' + tm[m] + ' шт.): тип по назначению не соответствует фактическому характеру местности. Габариты принимаются по фактической местности.', { count: tm[m] });
  });

  /* 11. Г.2 */
  add('g2', 'info', ex.annexG2 === 'не выполнено'
    ? 'Свободные интервалы на опорах в отчёте не определены (прил. Г.2 не выполнено). PD_RD рассчитывает компоновку на каждой опоре самостоятельно.'
    : 'Свободные интервалы и компоновка элементов на опорах определяются расчётом PD_RD по каждой опоре.');

  /* 12. СИ */
  ex.instruments.forEach(function (s) {
    if (s.fgis && !/^(№\s*)?С-[А-ЯA-Z]{2,4}\/\d{2}-\d{2}-\d{4}\/\d+/.test(s.fgis))
      add('si', 'info', s.name + ' ' + s.mark + ': вместо номера записи о поверке во ФГИС «Аршин» указано «' + s.fgis + '». Для сведения — зона ответственности АРМ ППО.');
    if (s.to && ex.report.period.to && s.to < ex.report.period.to)
      add('si', 'warn', s.name + ' ' + s.mark + ': поверка действительна до ' + ru(s.to) + ', работы завершены ' + ru(ex.report.period.to) + '.', { ask: 'владельцу' });
  });
  if (ex.report.executors.length === 1)
    add('si', 'info', 'Работы выполнены одним исполнителем (' + ex.report.executors[0] + '). Для сведения — зона ответственности АРМ ППО.');

  /* 13. Совместные опоры */
  var groups = phys.filter(function (p) { return p.records.length > 1; });
  if (groups.length)
    add('merge', 'info', 'Записей опор — ' + ex.poles.length + ', физических опор — ' + phys.length + ': ' + groups.length + ' групп(ы) записей разных линий совпадают по координатам (допуск ' + fmt(MERGE_TOL_M) + ' м) и объединены. Нагрузки, муфты и длины считаются по физической опоре.', { count: groups.length });
  groups.forEach(function (g) {
    var marks = {}; g.records.forEach(function (r) { marks[r.mark] = 1; });
    if (Object.keys(marks).length > 1)
      add('merge', 'warn', 'Совместная опора ' + g.records.map(function (r) { return '№ ' + r.num; }).join(' / ') + ': в разных записях указаны разные марки (' + Object.keys(marks).join(', ') + '). Марку уточнить.', { ask: 'владельцу', where: g.records.map(function (r) { return r.line_id; }).join(' / ') });
  });

  /* 14. Полнота */
  if (ex.object.poles_declared !== null && ex.object.poles_declared !== ex.poles.length)
    add('count', 'stop', 'В паспорте отчёта заявлено опор: ' + ex.object.poles_declared + ', в перечне: ' + ex.poles.length + '.', { ask: 'владельцу' });
  if (ex.object.length_km !== null) {
    var sum = 0; ex.poles.forEach(function (p) { if (p.span_next_m) sum += p.span_next_m; });
    var diff = Math.abs(sum / 1000 - ex.object.length_km);
    if (sum && diff > Math.max(0.05 * ex.object.length_km, 0.2))
      add('count', 'warn', 'Сумма пролётов «до следующей опоры» по перечню (' + fmt(sum / 1000, 2) + ' км) расходится с протяжённостью в паспорте отчёта (' + fmt(ex.object.length_km, 1) + ' км) более чем на 5 %. Протяжённость трассы в ПД определяется по схеме размещения кабеля.');
  }

  /* 15. Развилки */
  var over = ex.poles.filter(function (p) { return p.span_next_m !== null && p.span_gabarit_m !== null && p.span_next_m > p.span_gabarit_m; });
  if (over.length) {
    var mx = over.reduce(function (a, p) { return p.span_next_m > a.span_next_m ? p : a; });
    add('decisions', 'info', 'На ' + over.length + ' опорах фактический пролёт больше габаритного (наибольший — ' + fmt(mx.span_next_m) + ' м у опоры ' + mx.mark + ' при габаритном ' + fmt(mx.span_gabarit_m) + ' м). Для каждой опоры будут показаны варианты: полный поверочный расчёт, установка промежуточной опоры (Е.1, по согласованию с владельцем), обход участка.', { count: over.length });
  }
  var no = ex.poles.filter(function (p) { return /нет|отсутств/i.test(p.tech_possibility); });
  if (no.length) add('decisions', 'info', 'Опор без технологической возможности — ' + no.length + '. Решение «размещать» для них заблокировано; трасса проектируется с их исключением либо с условием «после восстановления владельцем».', { count: no.length });
  var low = ex.loads_annex_j.filter(function (l) { return l.reserve_pct !== null && l.reserve_pct < 10; });
  if (low.length) add('decisions', 'info', 'По оценке приложения Ж запас по моменту ниже 10 % у марок: ' + low.map(function (l) { return l.mark + ' (' + fmt(l.reserve_pct) + ' %, пролёт ' + fmt(l.span_m) + ' м)'; }).join(', ') + '. Оценка приложения Ж — нижняя планка; в ПД выполняется полный расчёт.');

  /* 16. Справочник */
  if (R) {
    var unk = {};
    ex.poles.forEach(function (p) { if (p.mark && !R.poleByMark(p.mark)) unk[p.mark] = (unk[p.mark] || 0) + 1; });
    Object.keys(unk).forEach(function (m) {
      add('reference', 'stop', 'Марка опоры «' + m + '» (' + unk[m] + ' шт.) отсутствует в справочнике: нужны типовой проект, стойка и допустимый момент.', { count: unk[m] });
    });
    add('reference', 'info', 'Допустимые моменты и габаритные пролёты опор приняты по справочнику АРМ ППО ' + R.version + ' (типовые значения) и подлежат сверке с альбомами типовых проектов до выпуска.');
  }
  out.sort(function (a, b) { return a.n - b.n || lvOrder(a.lv) - lvOrder(b.lv); });
  return out;
}
function lvOrder(l) { return { stop: 0, warn: 1, info: 2 }[l] || 3; }
function fmt(v, d) { if (v === null || v === undefined) return '—'; return (d === undefined ? String(v) : Number(v).toFixed(d)).replace('.', ','); }
function fmtKv(v) { return String(v).replace('.', ','); }
function ru(iso) { return iso ? iso.slice(0, 10).split('-').reverse().join('.') : ''; }

/* ---------------------------------------------------------------- в проект */
function toProject(ex, base) {
  var P = global.PDRD, d = base || P.blank();
  var phys = mergePoles(ex.poles);
  var findings = intake(ex, phys);
  var p = d.passport;
  p.object = ex.object.name;
  p.place = ex.object.place;
  p.operator = ex.user.operator;
  p.contractor = ex.user.contractor;
  p.owner = ex.owner.name || p.owner;
  if (ex.owner.branch) p.branch = ex.owner.branch;
  if (/ростелеком/i.test(p.operator)) d.profile.operator = 'rostelecom-b2c-gpon';
  else if (/мтс|мобильные телесистемы/i.test(p.operator)) d.profile.operator = 'mts';
  else if (/вымпел|билайн/i.test(p.operator)) d.profile.operator = 'beeline';
  d.basis.report13 = { number: ex.report.number, date: ex.report.date, sha256: ex.source.sha256,
                       source: (ex.source.kind === 'report-docx' ? 'отчёт .docx' : 'резервная копия АРМ ППО') + (ex.source.version ? ' ' + ex.source.version : ''),
                       request: ex.report.request, period: ex.report.period, imported: new Date().toISOString() };
  var c = ex.climate;
  d.climate = { windRegion: c.wind_region, windPa: c.wind_pa, iceRegion: c.ice_region, iceMm: c.ice_mm,
                terrain: c.terrain_type, seismic: c.seismic, source: c.source, icewindPa: c.icewind_pa, confirmed: false };
  if (ex.cable_declared) {
    var cb = ex.cable_declared;
    d.cable = { mark: cb.mark, fibers: num((/-(\d+)-/.exec(cb.mark) || [])[1]), d_mm: cb.d_mm, mass_kg_km: cb.mass_kg_km,
                t_allow_kn: cb.t_allow_kn, t_mount_report_kn: cb.t_mount_kn, h_m: cb.h_m, fittings: cb.fittings,
                type: cb.type, approved: false, cert: '', source: 'отчёт по п. 13' };
  }
  d.lines = ex.lines.map(function (l) {
    return { id: l.id, name: l.name, kv: l.u_kv, kvConflict: !!l.kvConflict,
             wireType: '', wires: [], existing: [], fromReport: { inv: l.inv || '', right: l.right || '' } };
  });
  d.wiresReport = ex.wires;
  d.lengthKm = ex.object.length_km;
  d.poles = phys.map(function (g) {
    var r0 = g.records[0];
    return {
      id: g.id, coords: g.coords,
      lines: g.records.map(function (r) { return { lineId: r.line_id, num: r.num, row: r.row }; }),
      mark: r0.mark, kv: Math.max.apply(null, g.records.map(function (r) { return r.kv === null ? -1 : r.kv; })),
      state: r0.state_gost,
      fromReport: g.records.map(function (r) { var x = {}; for (var k in r) x[k] = r[k]; return x; }),
      design: { decision: '', h_m: null, side: '', node: '', clamp: '', sleeve: '', reserve_m: null, dampers: '', tag: false }
    };
  });
  d.measuresE1 = ex.measures_E1.map(function (m) {
    var fixed = m.performer && !/пользовател/i.test(m.performer);
    return { line: m.line, num: m.num, text: m.text, basis: m.basis,
             performer: 'пользователь инфраструктуры', performerReport: m.performer, corrected: fixed };
  });
  d.restrictionsE2 = ex.measures_E2.map(function (m) { return { line: m.line, num: m.num, text: m.text, basis: m.basis }; });
  d.loadsAnnexJ = ex.loads_annex_j;
  d.instrumentsReport = ex.instruments;
  d.intake = findings;
  d.meta.history.push({ at: new Date().toISOString(), what: 'импорт: ' + d.basis.report13.source + ', записей ' + ex.poles.length + ', опор ' + phys.length });
  return { project: d, findings: findings, stats: {
    records: ex.poles.length, physical: phys.length, groups: phys.filter(function (g) { return g.records.length > 1; }).length,
    lines: ex.lines.length, classes: kvSet(ex.poles),
    stop: findings.filter(function (f) { return f.lv === 'stop'; }).length,
    warn: findings.filter(function (f) { return f.lv === 'warn'; }).length,
    info: findings.filter(function (f) { return f.lv === 'info'; }).length
  } };
}
function kvSet(poles) {
  var s = {}; poles.forEach(function (p) { if (p.kv !== null) s[p.kv] = 1; });
  return Object.keys(s).map(Number).sort(function (a, b) { return a - b; });
}

/* ---------------------------------------------------------------- файл → обмен */
function readFile(file) {
  return file.arrayBuffer().then(function (buf) {
    return sha256(buf).then(function (h) {
      var head = new Uint8Array(buf.slice(0, 2));
      var p = (head[0] === 0x50 && head[1] === 0x4B) ? fromReportDocx(buf)
        : Promise.resolve().then(function () {
            var o = JSON.parse(new TextDecoder('utf-8').decode(buf));
            if (o && o.schema === SCHEMA) return o;
            return fromV25Object(o);
          });
      return p.then(function (ex) { ex.source.sha256 = h; ex.source.file = file.name; return ex; });
    });
  });
}
function fromLocalV25() {
  var r = global.PDRD && global.PDRD.readV25();
  if (!r) throw new Error('Осмотра АРМ ППО в этом браузере нет');
  if (r.error) throw new Error(r.error);
  var ex = fromV25Object(r.raw);
  ex.source.kind = 'v25-local';
  return ex;
}

global.PDRD_IMPORT = {
  SCHEMA: SCHEMA, MERGE_TOL_M: MERGE_TOL_M, RULES: RULES,
  num: num, kvOf: kvOf, ruDate: ruDate, haversine: haversine, sha256: sha256,
  fromV25Object: fromV25Object, fromReportDocx: fromReportDocx, fromReportDocxXml: fromReportDocxXml,
  mergePoles: mergePoles, intake: intake, toProject: toProject, readFile: readFile, fromLocalV25: fromLocalV25
};
})(typeof window !== 'undefined' ? window : globalThis);
