/* PD_RD — ведомости и спецификация в XLSX (SheetJS 0.18.5 с cdnjs).
   Таблицы берутся из тех же данных, что и тома, — расхождение исключено. */
(function (global) {
'use strict';
var SHEETS = [
  ['ОПОРЫ', 'Опоры'], ['ПРОЛЁТЫ', 'Пролёты'], ['НАГРУЗКИ', 'Нагрузки на опоры'], ['УЗЛЫ', 'Узлы'], ['МУФТЫ', 'Муфты и запасы'],
  ['СПЕЦИФИКАЦИЯ', 'Спецификация'], ['ВОР', 'ВОР'], ['КООРДИНАТЫ', 'Координаты'], ['МЕТРОЛОГИЯ', 'Метрология'],
  ['ПЕРЕСЕЧЕНИЯ', 'Пересечения'], ['Е1', 'Мероприятия Е.1'], ['НОРМЫ', 'Нормы'], ['АУДИТ', 'Аудит']
];
function workbook(d) {
  var D = global.PDRD_DOCX, tpl = D.TEMPLATES.filter(function (t) { return t.code === 'ЛКС'; })[0];
  var data = D.dataFromProject(d, tpl);
  var tkr = D.dataFromProject(d, D.TEMPLATES.filter(function (t) { return t.code === 'ТКР'; })[0]);
  var pz = D.dataFromProject(d, D.TEMPLATES.filter(function (t) { return t.code === 'ПЗ'; })[0]);
  Object.keys(tkr.tables).forEach(function (k) { if (!data.tables[k]) data.tables[k] = tkr.tables[k]; });
  Object.keys(pz.tables).forEach(function (k) { if (!data.tables[k]) data.tables[k] = pz.tables[k]; });
  var wb = XLSX.utils.book_new();
  var head = [['Объект', d.passport.object], ['Обозначение', (d.passport.shifr || 'ШИФР НЕ УТВЕРЖДЁН') + '-ЛКС'], ['Отчёт п. 13', d.basis.report13.number], ['Сформировано', 'PD_RD ' + global.PDRD.VERSION + ', ' + new Date().toLocaleString('ru-RU')]];
  var ws0 = XLSX.utils.aoa_to_sheet(head.concat([[], ['Лист', 'Содержание']]).concat(SHEETS.filter(function (s) { return data.tables[s[0]]; }).map(function (s) { return [s[1], data.tables[s[0]].caption || s[1]]; })));
  ws0['!cols'] = [{ wch: 18 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, ws0, 'Сведения');
  var n = 0;
  SHEETS.forEach(function (s) {
    var tb = data.tables[s[0]]; if (!tb) return;
    var aoa = [tb.cols.map(function (c) { return c.t; })].concat(tb.rows.map(function (r) {
      return r.map(function (v) { var x = String(v === null || v === undefined ? '' : v); return /^-?\d+(,\d+)?$/.test(x) ? parseFloat(x.replace(',', '.')) : x; });
    }));
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = tb.cols.map(function (c) { return { wch: Math.max(6, Math.round((c.w || 20) * 0.9)) }; });
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: tb.cols.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, s[1].slice(0, 31));
    n++;
  });
  return { wb: wb, sheets: n };
}
function toArray(d) { var r = workbook(d); return { data: XLSX.write(r.wb, { bookType: 'xlsx', type: 'array' }), sheets: r.sheets }; }
global.PDRD_XLSX = { workbook: workbook, toArray: toArray, SHEETS: SHEETS };
})(typeof window !== 'undefined' ? window : globalThis);
