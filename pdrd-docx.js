/* PD_RD — заполнение шаблонов томов (tpl_*.docx).
   Поля шаблона:
     {{ПОЛЕ}}                 — значение из словаря; пустое → «—» и запись в перечень пробелов;
     {{ТАБЛИЦА:ИМЯ}}          — абзац-маркер заменяется таблицей;
     {{БЛОК:ИМЯ}}             — абзац-маркер заменяется абзацами текста;
     {{ЕСЛИ:УСЛОВИЕ}}…{{КОНЕЦ}} — содержимое остаётся, только если условие истинно.
   Абзацы-подсказки (стиль «PD Подсказка») удаляются.
   Отметка «ШИФР НЕ УТВЕРЖДЁН» удаляется только при утверждённом шифре.
   Требует JSZip (cdnjs, 3.10.1). */
(function (global) {
'use strict';

var W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
var DASH = '—';
var MM = 56.6929;

var TEMPLATES = [
  { file:'tpl_pz.docx',  code:'ПЗ',  num:1,  pd:true,  title:'Раздел 1. Пояснительная записка' },
  { file:'tpl_ppo.docx', code:'ППО', num:2,  pd:true,  title:'Раздел 2. Проект полосы отвода' },
  { file:'tpl_tkr.docx', code:'ТКР', num:3,  pd:true,  title:'Раздел 3. Технологические и конструктивные решения линейного объекта. Искусственные сооружения' },
  { file:'tpl_ilo.docx', code:'ИЛО', num:4,  pd:true,  title:'Раздел 4. Здания, строения и сооружения, входящие в инфраструктуру линейного объекта' },
  { file:'tpl_pos.docx', code:'ПОС', num:5,  pd:true,  title:'Раздел 5. Проект организации строительства' },
  { file:'tpl_oos.docx', code:'ООС', num:6,  pd:true,  title:'Раздел 6. Мероприятия по охране окружающей среды' },
  { file:'tpl_pb.docx',  code:'ПБ',  num:7,  pd:true,  title:'Раздел 7. Мероприятия по обеспечению пожарной безопасности' },
  { file:'tpl_tbe.docx', code:'ТБЭ', num:8,  pd:true,  title:'Раздел 8. Требования к обеспечению безопасной эксплуатации линейного объекта' },
  { file:'tpl_sm.docx',  code:'СМ',  num:9,  pd:true,  title:'Раздел 9. Смета на строительство' },
  { file:'tpl_id.docx',  code:'ИД',  num:10, pd:true,  title:'Раздел 10. Иная документация' },
  { file:'tpl_rd.docx',  code:'ЛКС', num:null, pd:false, title:'Рабочая документация. Общие данные и ведомости' }
];

/* ---------------------------------------------------------------- поля */
var RE_FIELD = /\{\{([^{}]+)\}\}/g;

function listFields(xml) {
  var out = {}, m;
  RE_FIELD.lastIndex = 0;
  while ((m = RE_FIELD.exec(xml))) out[m[1]] = (out[m[1]] || 0) + 1;
  return out;
}

/* Поля, разорванные между run'ами: «{{» без «}}» в одном w:t */
function brokenFields(xml) {
  var bad = [], re = /<w:t[^>]*>([^<]*)<\/w:t>/g, m;
  while ((m = re.exec(xml))) {
    var t = m[1];
    var open = (t.match(/\{\{/g) || []).length, close = (t.match(/\}\}/g) || []).length;
    if (open !== close) bad.push(t);
  }
  return bad;
}

/* ---------------------------------------------------------------- DOM-помощники */
function el(doc, name, attrs, kids) {
  var e = doc.createElementNS(W, 'w:' + name);
  if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttributeNS(W, 'w:' + k, String(attrs[k])); });
  (kids || []).forEach(function (k) { if (k) e.appendChild(k); });
  return e;
}
function textRun(doc, text, opt) {
  opt = opt || {};
  var rpr = [];
  if (opt.b) rpr.push(el(doc, 'b'));
  if (opt.color) rpr.push(el(doc, 'color', { val: opt.color }));
  if (opt.sz) { rpr.push(el(doc, 'sz', { val: opt.sz })); rpr.push(el(doc, 'szCs', { val: opt.sz })); }
  var t = el(doc, 't'); t.setAttribute('xml:space', 'preserve'); t.textContent = text;
  return el(doc, 'r', null, [rpr.length ? el(doc, 'rPr', null, rpr) : null, t]);
}
function paraNode(doc, text, style, opt) {
  opt = opt || {};
  var ppr = [el(doc, 'pStyle', { val: style || 'Body' })];
  if (opt.keep) ppr.push(el(doc, 'keepNext'));
  if (opt.jc) ppr.push(el(doc, 'jc', { val: opt.jc }));
  return el(doc, 'p', null, [el(doc, 'pPr', null, ppr), textRun(doc, text, opt)]);
}
function styleOf(p) {
  var ps = p.getElementsByTagNameNS(W, 'pStyle')[0];
  return ps ? ps.getAttributeNS(W, 'val') || ps.getAttribute('w:val') : '';
}
function textOf(node) {
  var ts = node.getElementsByTagNameNS(W, 't'), s = '';
  for (var i = 0; i < ts.length; i++) s += ts[i].textContent;
  return s;
}

/* Таблица: spec = { caption, cols:[{t, w}] (w — мм), rows:[[…]] } */
function tableNodes(doc, spec) {
  var total = 175, cols = spec.cols || [];
  var sum = cols.reduce(function (a, c) { return a + (c.w || 0); }, 0) || cols.length;
  var widths = cols.map(function (c) { return Math.round(((c.w || 1) / sum) * total * MM); });
  var border = function (n) { return el(doc, n, { val: 'single', sz: 4, space: 0, color: '000000' }); };
  var tblPr = el(doc, 'tblPr', null, [
    el(doc, 'tblW', { w: widths.reduce(function (a, b) { return a + b; }, 0), type: 'dxa' }),
    el(doc, 'tblBorders', null, ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border)),
    el(doc, 'tblLayout', { type: 'fixed' }),
    el(doc, 'tblCellMar', null, [el(doc, 'left', { w: 57, type: 'dxa' }), el(doc, 'right', { w: 57, type: 'dxa' })])
  ]);
  var grid = el(doc, 'tblGrid', null, widths.map(function (w) { return el(doc, 'gridCol', { w: w }); }));
  function rowNode(vals, head) {
    var trPr = el(doc, 'trPr', null, [el(doc, 'cantSplit'), head ? el(doc, 'tblHeader') : null]);
    var cells = vals.map(function (v, i) {
      var p = el(doc, 'p', null, [
        el(doc, 'pPr', null, [el(doc, 'spacing', { before: 0, after: 0 }), el(doc, 'jc', { val: head ? 'center' : (cols[i] && cols[i].al) || 'left' })]),
        textRun(doc, (v === null || v === undefined || v === '') ? DASH : String(v), { sz: 20, b: head })
      ]);
      return el(doc, 'tc', null, [el(doc, 'tcPr', null, [el(doc, 'tcW', { w: widths[i], type: 'dxa' }),
        head ? el(doc, 'shd', { val: 'clear', color: 'auto', fill: 'EEF2F6' }) : null,
        el(doc, 'vAlign', { val: head ? 'center' : 'top' })]), p]);
    });
    return el(doc, 'tr', null, [trPr].concat(cells));
  }
  var tbl = el(doc, 'tbl', null, [tblPr, grid, rowNode(cols.map(function (c) { return c.t; }), true)]
    .concat((spec.rows || []).map(function (r) { return rowNode(r, false); })));
  var out = [];
  if (spec.caption) out.push(paraNode(doc, spec.caption, 'Body', { keep: true }));
  out.push(tbl);
  out.push(el(doc, 'p', null, [el(doc, 'pPr', null, [el(doc, 'spacing', { before: 0, after: 60 })])]));
  return out;
}

/* ---------------------------------------------------------------- заполнение части */
function fillPart(xml, data, report, partName) {
  var doc = new DOMParser().parseFromString(xml, 'application/xml');
  var body = doc.getElementsByTagNameNS(W, 'body')[0] || doc.documentElement;

  /* 1. Условия и маркеры — только прямые абзацы тела */
  var kids = Array.prototype.slice.call(body.childNodes);
  var stack = [], tocAt = null;
  kids.forEach(function (n) {
    if (n.nodeType !== 1) return;
    var isP = n.localName === 'p';
    var st = isP ? styleOf(n) : '';
    var txt = isP ? textOf(n).trim() : '';
    var m = st === 'Marker' ? /^\{\{(ЕСЛИ|КОНЕЦ|ТАБЛИЦА|БЛОК)(?::([^}]+))?\}\}$/.exec(txt) : null;
    var hidden = stack.some(function (v) { return !v; });
    if (m && m[1] === 'ЕСЛИ') {
      var v = !!(data.cond && data.cond[m[2]]);
      if (!(data.cond && m[2] in data.cond)) report.missing.push({ part: partName, key: 'ЕСЛИ:' + m[2] });
      stack.push(v); body.removeChild(n); return;
    }
    if (m && m[1] === 'КОНЕЦ') { stack.pop(); body.removeChild(n); return; }
    if (hidden) { if (n.localName !== 'sectPr' && !n.getElementsByTagNameNS(W, 'sectPr').length) body.removeChild(n); return; }
    if (isP && st === 'Hint') { body.removeChild(n); return; }
    if (m && m[1] === 'ТАБЛИЦА' && m[2] === 'СОДЕРЖАНИЕ_ТОМА' && !(data.tables && data.tables[m[2]])) {
      tocAt = n; return;
    }
    if (m && m[1] === 'ТАБЛИЦА') {
      var spec = data.tables && data.tables[m[2]];
      var nodes = spec ? tableNodes(doc, spec)
        : [paraNode(doc, DASH + ' (таблица «' + m[2] + '» не сформирована)', 'Body', { color: 'A32B2B' })];
      if (!spec) report.missing.push({ part: partName, key: 'ТАБЛИЦА:' + m[2] });
      nodes.forEach(function (x) { body.insertBefore(x, n); });
      body.removeChild(n); return;
    }
    if (m && m[1] === 'БЛОК') {
      var blk = data.blocks && data.blocks[m[2]];
      if (!blk || !blk.length) {
        report.missing.push({ part: partName, key: 'БЛОК:' + m[2] });
        blk = [DASH + ' (текст «' + m[2] + '» не сформирован)'];
        body.insertBefore(paraNode(doc, blk[0], 'Body', { color: 'A32B2B' }), n);
      } else {
        blk.forEach(function (t) { body.insertBefore(paraNode(doc, t, 'Body'), n); });
      }
      body.removeChild(n); return;
    }
  });
  if (stack.length) report.errors.push(partName + ': не закрыт блок {{ЕСЛИ}}');

  /* Содержание тома — поле TOC; номера листов проставляет Word при открытии
     (в документе включено обновление полей) */
  if (tocAt) {
    var heads = [];
    Array.prototype.forEach.call(body.childNodes, function (n) {
      if (n.nodeType === 1 && n.localName === 'p') {
        var s = styleOf(n);
        if (s === 'Heading1' || s === 'Heading2') heads.push({ lvl: s === 'Heading1' ? 1 : 2, text: textOf(n) });
      }
    });
    var fc = function (type) { return el(doc, 'r', null, [el(doc, 'fldChar', { fldCharType: type })]); };
    var instr = el(doc, 'instrText'); instr.setAttribute('xml:space', 'preserve'); instr.textContent = ' TOC \\o "1-2" \\h \\z \\u ';
    var ps = heads.map(function (h) {
      var tab = el(doc, 'r', null, [el(doc, 'tab')]);
      return el(doc, 'p', null, [el(doc, 'pPr', null, [el(doc, 'pStyle', { val: 'TOC' + h.lvl })]), textRun(doc, h.text), tab]);
    });
    if (!ps.length) ps = [paraNode(doc, DASH, 'Body')];
    ps[0].insertBefore(fc('separate'), ps[0].childNodes[1]);
    ps[0].insertBefore(el(doc, 'r', null, [instr]), ps[0].childNodes[1]);
    ps[0].insertBefore(fc('begin'), ps[0].childNodes[1]);
    ps[ps.length - 1].appendChild(fc('end'));
    ps.forEach(function (x) { body.insertBefore(x, tocAt); });
    body.removeChild(tocAt);
  }

  /* 2. Отметка неутверждённого шифра */
  if (data.approved) {
    var props = doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'docPr');
    Array.prototype.slice.call(props).forEach(function (dp) {
      if (dp.getAttribute('name') !== 'PDRD_WATERMARK') return;
      var r = dp; while (r && r.localName !== 'r') r = r.parentNode;
      if (r && r.parentNode) r.parentNode.removeChild(r);
    });
  }

  /* 3. Простые поля */
  var ts = doc.getElementsByTagNameNS(W, 't');
  for (var i = 0; i < ts.length; i++) {
    var t = ts[i], s = t.textContent;
    if (s.indexOf('{{') < 0) continue;
    t.textContent = s.replace(RE_FIELD, function (all, key) {
      var v = data.fields ? data.fields[key] : undefined;
      if (v === undefined || v === null || String(v).trim() === '') {
        report.missing.push({ part: partName, key: key });
        return DASH;
      }
      report.filled++;
      return String(v);
    });
  }
  return new XMLSerializer().serializeToString(doc);
}

/* ---------------------------------------------------------------- том целиком */
function fillDocx(buffer, data) {
  var report = { missing: [], errors: [], filled: 0 };
  return JSZip.loadAsync(buffer).then(function (zip) {
    var parts = Object.keys(zip.files).filter(function (n) {
      return /^word\/(document|header\d+|footer\d+)\.xml$/.test(n);
    });
    return Promise.all(parts.map(function (n) {
      return zip.file(n).async('string').then(function (xml) {
        zip.file(n, fillPart(xml, data, report, n.replace('word/', '')));
      });
    })).then(function () {
      var seen = {};
      report.missing = report.missing.filter(function (x) { var k = x.key; if (seen[k]) return false; seen[k] = 1; return true; });
      return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
        .then(function (blob) { return { blob: blob, report: report }; });
    });
  });
}

/* Перечень полей шаблона и проверка целостности */
function inspectDocx(buffer) {
  return JSZip.loadAsync(buffer).then(function (zip) {
    var parts = Object.keys(zip.files).filter(function (n) { return /^word\/(document|header\d+|footer\d+)\.xml$/.test(n); });
    return Promise.all(parts.map(function (n) { return zip.file(n).async('string'); })).then(function (xs) {
      var f = {}, broken = [];
      xs.forEach(function (x) {
        var l = listFields(x); Object.keys(l).forEach(function (k) { f[k] = (f[k] || 0) + l[k]; });
        broken = broken.concat(brokenFields(x));
      });
      return { fields: f, broken: broken, watermark: xs.some(function (x) { return x.indexOf('PDRD_WATERMARK') >= 0; }) };
    });
  });
}

/* ---------------------------------------------------------------- данные из проекта */
function kr(iso) { if (!iso) return ''; var p = iso.slice(0, 10).split('-'); return p[1] + '.' + p[0].slice(2); }
function ru(iso) { if (!iso) return ''; return iso.slice(0, 10).split('-').reverse().join('.'); }

function dataFromProject(d, tpl) {
  var p = d.passport, s = p.signs, b = d.basis, l = d.legal, c = d.climate, cb = d.cable;
  var approved = !!(p.shifr && p.shifrApproved && p.marksApproved);
  var code = (p.shifr || 'ШИФР НЕ УТВЕРЖДЁН') + '-' + tpl.code;
  var profile = d.profile && d.profile.operator || '';
  var kv = {};
  d.lines.forEach(function (x) { if (x.kv !== undefined && x.kv !== '') kv[x.kv] = 1; });
  var kvs = Object.keys(kv).map(Number).sort(function (a, b) { return a - b; });
  var fields = {
    'ОБОЗНАЧЕНИЕ': code,
    'ТОМ_НОМЕР': tpl.num ? String(tpl.num) : '',
    'ТОМ_НАИМ': tpl.title,
    'СТАДИЯ': tpl.pd ? 'П' : 'Р',
    'ОБЪЕКТ_НАИМ': p.object, 'ОБЪЕКТ_МЕСТО': p.place,
    'ВЛАДЕЛЕЦ_НАИМ': p.owner, 'ВЛАДЕЛЕЦ_ФИЛИАЛ': p.branch,
    'ОРГАНИЗАЦИЯ': p.branch,
    'ОПЕРАТОР_НАИМ': p.operator, 'ПОДРЯДЧИК_НАИМ': p.contractor,
    'ЗАКАЗЧИК_НАИМ': p.designCustomer,
    'ГИП_ФИО': s.gip, 'РАЗРАБ_ФИО': s.razrab, 'ПРОВ_ФИО': s.prov, 'НКОНТР_ФИО': s.nkontr,
    'ДАТА_ВЫПУСКА_КР': kr(p.releaseDate), 'ГОД_ВЫПУСКА': p.releaseDate ? p.releaseDate.slice(0, 4) : '',
    'СРО_НАИМ': l.sro.name, 'СРО_РЕГ_НОМЕР': l.sro.regNumber, 'СРО_ВЫПИСКА_ДАТА': ru(l.sro.extractDate),
    'ТЗ_НОМЕР': b.tz.number, 'ТЗ_ДАТА': ru(b.tz.date), 'ТЗ_НАИМ': b.tz.title || '',
    'ТУ_НОМЕР': b.tu.number, 'ТУ_ДАТА': ru(b.tu.date),
    'ОТЧЁТ_П13_НОМЕР': b.report13.number, 'ОТЧЁТ_П13_ДАТА': ru(b.report13.date), 'ОТЧЁТ_П13_ХЭШ': b.report13.sha256,
    'ДОГОВОР_ПИР_НОМЕР': b.contract ? b.contract.number : '', 'ДОГОВОР_ПИР_ДАТА': b.contract ? ru(b.contract.date) : '',
    'ПРОГРАММА_РАСЧЁТА': 'PD_RD ' + (global.PDRD ? global.PDRD.VERSION : ''),
    'КЛАССЫ_КВ': kvs.map(function (x) { return String(x).replace('.', ','); }).join(' и '),
    'ОПОР_ВСЕГО': d.poles.length ? String(d.poles.length) : '',
    'ПРОТЯЖЁННОСТЬ_КМ': d.lengthKm ? String(d.lengthKm).replace('.', ',') : '',
    'РАЙОН_ВЕТЕР': c.windRegion, 'ДАВЛЕНИЕ_ВЕТРА_ПА': c.windPa, 'РАЙОН_ГОЛОЛЁД': c.iceRegion,
    'СТЕНКА_ГОЛОЛЁДА_ММ': c.iceMm, 'ТИП_МЕСТНОСТИ': c.terrain, 'СЕЙСМИЧНОСТЬ': c.seismic, 'КЛИМАТ_ИСТОЧНИК': c.source,
    'КАБЕЛЬ_МАРКА': cb.mark, 'КАБЕЛЬ_ОВ': cb.fibers,
    'ОБОЗНАЧЕНИЕ_ПД': p.shifr || 'ШИФР НЕ УТВЕРЖДЁН'
  };
  var tables = {}, blocks = {};
  var N = global.PDRD_NORMS;
  if (N) {
    /* Нормируемые расстояния ТТ № 282р — по классам напряжения проекта */
    var rows = [];
    kvs.forEach(function (k) {
      var wireType = k <= 1 ? ((d.lines.filter(function (x) { return +x.kv === k; }).map(function (x) { return x.wireType || ''; }).join(' ') || '') + ' ' + ((d.wiresByKv || {})[String(k).replace('.', ',')] || []).map(function (w) { return w.mark; }).join(' ')) : '';
      var r = N.wireDistance(k, wireType);
      rows.push(['ОКСН — провод ВЛ ' + String(k).replace('.', ',') + ' кВ' + (k <= 1 ? (/сип/i.test(wireType) ? ' с СИП' : ' (неизолированный провод)') : '') + ', на опоре и в пролёте',
                 r.value === null ? 'не установлено' : 'не менее ' + String(r.value).replace('.', ',') + ' м', r.ref]);
    });
    ['tt.dist.element', 'tt.dist.ground', 'tt.dist.fixH', 'tt.dist.fixV', 'tt.tag.dist'].forEach(function (id) {
      var v = N.val(id);
      rows.push([v.what, (id === 'tt.tag.dist' ? 'не более ' : 'не менее ') + String(v.value).replace('.', ',') + ' ' + v.unit, v.ref]);
    });
    tables['РАССТОЯНИЯ_НОРМЫ'] = { caption: 'Таблица — Нормируемые расстояния',
      cols: [{ t: 'Наименование', w: 95 }, { t: 'Значение', w: 35 }, { t: 'Документ, пункт', w: 45 }], rows: rows };
  }
  var cr = d.calcResult;
  if (cr) {
    var STN = { ok: 'обосновано', exceed: 'не выполнено', blocked: 'нет данных', excluded: 'исключена' };
    var f2 = function (v, k) { return v === null || v === undefined ? '—' : String(Math.round(v * Math.pow(10, k)) / Math.pow(10, k)).replace('.', ','); };
    tables['ПРОЛЁТЫ'] = { caption: 'Таблица — Результаты расчёта пролётов (габарит до земли — не менее 5,0 м, ТТ № 282р, п. 3.2.4)',
      cols: [{ t: 'Участок', w: 16 }, { t: 'Пролёт', w: 30 }, { t: 'L, м', w: 14 }, { t: 'Стрела наиб., м', w: 20 }, { t: 'До земли, м', w: 18 }, { t: 'До провода, м', w: 18 }, { t: 'Результат', w: 22 }, { t: 'Примечание', w: 37 }],
      rows: cr.spans.map(function (s) { return [s.section, s.from + ' — ' + s.to, f2(s.L, 1), f2(s.fmax, 2), f2(s.clearance, 2), f2(s.wireDist, 2), STN[s.status], (s.reasons || []).join('; ')]; }) };
    tables['НАГРУЗКИ'] = { caption: 'Таблица — Проверка несущей способности опор',
      cols: [{ t: '№ опоры', w: 22 }, { t: 'Марка', w: 18 }, { t: 'M, кН·м', w: 18 }, { t: 'Mдоп, кН·м', w: 18 }, { t: 'Результат', w: 22 }, { t: 'Примечание', w: 77 }],
      rows: cr.poles.map(function (p2) {
        var pole = d.poles.filter(function (x) { return x.id === p2.id; })[0] || {};
        return [(pole.lines || []).map(function (l) { return l.num; }).join(' / '), pole.mark || '', f2(p2.M / 1000, 2), f2(p2.Madm / 1000, 2), STN[p2.status], (p2.reasons || []).join('; ')];
      }) };
    var sm = cr.summary;
    blocks['ВЫВОД_ПО_ОПОРАМ'] = ['По результатам расчёта (программа PD_RD ' + (cr.app || '') + ', ' + ru(cr.at) + '): размещение обосновано на ' + sm.ok + ' опорах; нормы не выполняются на ' + sm.exceed + ' опорах; для ' + sm.blocked + ' опор расчёт не завершён из-за отсутствия исходных данных; ' + sm.excluded + ' опор исключены из размещения по результатам обследования.' +
      (sm.exceed || sm.blocked ? ' Выпуск проектной документации допускается после устранения несоответствий и получения недостающих данных.' : '')];
  }
  var X = global.PDRD_DECIDE;
  if (X && d.poles.some(function (p) { return p.design && p.design.decision; })) {
    var g2 = function (v) { return v === null || v === undefined ? '—' : String(v).replace('.', ','); };
    var placed = d.poles.filter(function (p) { return p.design && p.design.decision; });
    /* Ведомость опор — колонки совместимы с листом осмотра ТТ № 282р */
    tables['ОПОРЫ'] = { caption: 'Таблица — Ведомость опор',
      cols: [{ t: '№', w: 9 }, { t: 'Линия', w: 44 }, { t: 'Опора', w: 14 }, { t: 'Марка', w: 15 }, { t: 'кВ', w: 9 }, { t: 'Состояние', w: 22 },
             { t: 'Решение', w: 26 }, { t: 'h, м', w: 11 }, { t: 'Узел', w: 10 }, { t: 'Муфта, запас', w: 15 }],
      rows: placed.map(function (p, i) {
        var x = p.design;
        return [String(i + 1), (p.lines || []).map(function (l) { return l.lineId; }).join('; '), (p.lines || []).map(function (l) { return l.num; }).join(' / '),
                p.mark, g2(p.kv), p.state || '', X.title(x.decision, true), g2(x.h_m), x.node || '', x.sleeve ? (x.sleeveType || 'муфта') + ', ' + g2(x.reserve_m) + ' м' : '—'];
      }) };
    tables['ОПОРЫ_СВОДКА'] = (function () {
      var by = {};
      d.poles.forEach(function (p) { var k = p.mark || '—'; by[k] = by[k] || { n: 0, place: 0 }; by[k].n++; if (p.design && ['place', 'recheck'].indexOf(p.design.decision) >= 0) by[k].place++; });
      var RF = global.PDRD_REFS_V25;
      return { caption: 'Таблица — Опоры воздушных линий', cols: [{ t: 'Марка', w: 25 }, { t: 'Назначение', w: 50 }, { t: 'Стойка / типовой проект', w: 55 }, { t: 'Всего', w: 20 }, { t: 'С размещением кабеля', w: 25 }],
        rows: Object.keys(by).sort().map(function (k) { var ref = RF ? RF.poleByMark(k) : null; return [k, ref ? ref.type : '—', ref ? ref.proj_full : '—', String(by[k].n), String(by[k].place)]; }) };
    })();
    var sl = placed.filter(function (p) { return p.design.sleeve; });
    tables['МУФТЫ'] = { caption: 'Таблица — Муфты, шкафы и запасы кабеля',
      cols: [{ t: '№', w: 10 }, { t: 'Опора', w: 30 }, { t: 'Линия', w: 60 }, { t: 'Тип', w: 30 }, { t: 'Запас, м', w: 20 }, { t: 'Основание', w: 25 }],
      rows: sl.length ? sl.map(function (p, i) { return [String(i + 1), (p.lines || []).map(function (l) { return l.num; }).join(' / ') + ' (' + p.mark + ')', ((p.lines || [])[0] || {}).lineId || '', p.design.sleeveType || 'муфта', g2(p.design.reserve_m), (p.design.why || []).slice(-1)[0] || '']; }) : [['—', 'Муфты не предусмотрены', '', '', '', '']] };
    var tt = X.totals(d);
    tables['УЗЛЫ'] = { caption: 'Таблица — Узлы крепления кабеля',
      cols: [{ t: 'Обозначение', w: 25 }, { t: 'Наименование', w: 110 }, { t: 'Количество, шт.', w: 40 }],
      rows: Object.keys(X.NODES).filter(function (k) { return tt.nodes[k]; }).map(function (k) { return [k, X.NODES[k], String(tt.nodes[k])]; }) };
    var e1 = (d.measuresE1 || []).map(function (m) { return [m.num || '—', m.text, m.basis, 'пользователь инфраструктуры']; });
    d.poles.forEach(function (p) {
      if (!p.design) return;
      var nums = (p.lines || []).map(function (l) { return l.num; }).join(' / ') + ' (' + p.mark + ')';
      if (p.design.decision === 'extra') e1.push([nums, 'Установка дополнительной промежуточной опоры (по согласованию с владельцем инфраструктуры)', (p.design.why || []).join('; '), 'пользователь инфраструктуры']);
      if (p.design.decision === 'recheck') e1.push([nums, 'Поверочный расчёт несущей способности по типовому проекту', (p.design.why || []).join('; '), 'пользователь инфраструктуры']);
    });
    tables['Е1'] = { caption: 'Таблица — Мероприятия, обусловленные размещением (Е.1)',
      cols: [{ t: 'Опора', w: 30 }, { t: 'Мероприятие', w: 65 }, { t: 'Основание', w: 50 }, { t: 'Исполнитель', w: 30 }],
      rows: e1.length ? e1 : [['—', 'Не требуются', '', '']] };
  }
  if (cb.mark) {
    tables['КАБЕЛЬ'] = { caption: 'Таблица — Характеристики кабеля',
      cols: [{ t: 'Параметр', w: 110 }, { t: 'Значение', w: 65 }],
      rows: [['Марка', cb.mark], ['Число оптических волокон', cb.fibers], ['Наружный диаметр, мм', cb.d_mm],
             ['Масса, кг/км', cb.mass_kg_km], ['Допустимая растягивающая нагрузка, кН', cb.t_allow_kn],
             ['Статус данных', cb.approved ? 'из утверждённого каталога' : 'по отчёту п. 13 — подтвердить паспортом изготовителя']] };
  }
  return {
    approved: approved,
    fields: fields,
    cond: {
      'ПОДРЯДЧИК': !!p.contractor,
      'КЛАСС_35_110': kvs.some(function (x) { return x >= 35; }),
      'ПРОФИЛЬ_GPON': profile === 'rostelecom-b2c-gpon',
      'ПРОФИЛЬ_ВЫМПЕЛКОМ': profile === 'beeline'
    },
    tables: tables, blocks: blocks
  };
}

/* Лист входного контроля */
var INTAKE_TPL = { file:'tpl_vk.docx', code:'ВК', num:null, pd:false, title:'Лист входного контроля исходных данных' };
function dataForIntake(d) {
  var base = dataFromProject(d, INTAKE_TPL);
  base.fields['СТАДИЯ'] = 'П';
  var r = d.basis.report13 || {}, f = d.intake || [];
  var lv = { stop: 'блокирует выпуск', warn: 'учесть в проекте', info: 'для сведения' };
  var recs = 0; d.poles.forEach(function (p) { recs += (p.lines || []).length; });
  base.tables['ВК_ИСТОЧНИК'] = { cols: [{ t: 'Сведения', w: 70 }, { t: 'Значение', w: 105 }], rows: [
    ['Отчёт по п. 13 Правил', (r.number || '') + (r.date ? ' от ' + ru(r.date) : '')],
    ['Запрос пользователя инфраструктуры', r.request ? (r.request.number || '') + (r.request.date ? ' от ' + ru(r.request.date) : '') : ''],
    ['Источник и способ получения', r.source || ''],
    ['Контрольная сумма SHA-256 входного файла', r.sha256 || ''],
    ['Дата импорта', r.imported ? ru(r.imported) : ''],
    ['Объект', d.passport.object],
    ['Оператор связи (пользователь инфраструктуры)', d.passport.operator],
    ['Подрядчик оператора', d.passport.contractor || 'не указан'],
    ['Записей опор в отчёте', String(recs)],
    ['Физических опор после объединения совместных', String(d.poles.length)],
    ['Линий', String(d.lines.length)]
  ] };
  var cnt = { stop: 0, warn: 0, info: 0 };
  f.forEach(function (x) { cnt[x.lv]++; });
  base.tables['ВК_ИТОГ'] = { caption: 'Таблица — Сводка', cols: [{ t: 'Уровень', w: 100 }, { t: 'Количество', w: 75 }],
    rows: [['Блокирующие замечания', cnt.stop], ['Предупреждения', cnt.warn], ['Сведения', cnt.info]].map(function (x) { return [x[0], String(x[1])]; }) };
  base.tables['ВК_ЗАМЕЧАНИЯ'] = { caption: 'Таблица — Замечания', cols: [
      { t: '№', w: 8 }, { t: 'Проверка', w: 32 }, { t: 'Содержание', w: 95 }, { t: 'Уровень', w: 22 }, { t: 'Кому запрос', w: 18 }],
    rows: f.map(function (x, i) { return [String(i + 1), x.n + '. ' + x.title, x.text + (x.fix ? ' Действие: ' + x.fix + '.' : ''), lv[x.lv], x.ask || '—']; }) };
  function asks(who) {
    var rows = f.filter(function (x) { return x.ask === who && x.lv !== 'info'; })
      .map(function (x, i) { return [String(i + 1), x.text, x.where || '—']; });
    return { cols: [{ t: '№', w: 8 }, { t: 'Что требуется представить или уточнить', w: 122 }, { t: 'Где', w: 45 }],
             rows: rows.length ? rows : [['—', 'Запросов нет', '—']] };
  }
  base.tables['ВК_ЗАПРОС_ВЛАДЕЛЬЦУ'] = asks('владельцу');
  base.tables['ВК_ЗАПРОС_ПОЛЬЗОВАТЕЛЮ'] = asks('пользователю');
  base.blocks['ВК_ЗАКЛЮЧЕНИЕ'] = [cnt.stop
    ? 'Исходные данные содержат ' + cnt.stop + ' блокирующих замечаний. Разработка проектных решений по затронутым опорам и расчёты, для которых данные не представлены, выполняются после получения ответов на запросы. Выпуск проектной документации до устранения блокирующих замечаний не допускается.'
    : 'Блокирующих замечаний нет. Исходные данные достаточны для разработки проектной документации с учётом предупреждений.'];
  return base;
}

global.PDRD_DOCX = {
  TEMPLATES: TEMPLATES, INTAKE_TPL: INTAKE_TPL, dataForIntake: dataForIntake, fillDocx: fillDocx, inspectDocx: inspectDocx,
  listFields: listFields, brokenFields: brokenFields, fillPart: fillPart,
  dataFromProject: dataFromProject
};
})(typeof window !== 'undefined' ? window : globalThis);
