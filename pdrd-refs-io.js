/* PD_RD — импорт справочника филиала из таблицы (ODS, XLSX, XLS, CSV).
   Таблица может содержать несколько блоков на одном листе (как «Справочник.ods»):
   блок находится по заголовку, колонки — по названиям в строке заголовка.
   Блоки: опоры, стойки, несущая способность анкерных опор, кабели ВОЛС, провода. */
(function (global) {
'use strict';
function s(v) { return String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim(); }
function num(v) { var n = typeof v === 'number' ? v : parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.')); return isFinite(n) ? Math.round(n * 10000) / 10000 : null; }
function kvText(v) {
  if (typeof v === 'number') return String(Math.round(v * 100) / 100).replace('.', ',');
  return s(v).replace('0.40000000000000002', '0,4');
}

/* Описание блоков: признак заголовка и поля по началу названия колонки */
var BLOCKS = [
  { id: 'capacity', anchor: /^Марка опоры$/i, need: /Несущая способность|момент конструкции|горизонтальное тяжение/i,
    fields: [['mark', /^Марка опоры/i], ['m_cap_knm', /Несущая способность|момент конструкции/i],
             ['T_top_kn', /^(?!.*подпор).*горизонтальное тяжение/i, 'num'], ['T_top_strut_kn', /подпор/i, 'num'],
             ['proj', /Типовой проект/i], ['note', /Примечание/i]] },
  { id: 'poles', anchor: /^Марка опоры$/i, need: /Стойка/i,
    fields: [['kv', /^Класс напряжения/i, 'kv', -1], ['mark', /^Марка опоры/i], ['mat', /^Материал/i], ['type', /^Тип по назначению/i],
             ['proj', /^Типовой проект/i], ['st', /^Стойка/i], ['sch', /^Схема/i], ['m_adm', /изгибающий момент/i, 'num'],
             ['h', /^Высота подвеса/i, 'num'], ['lgab', /^Габаритный пролёт/i, 'num']] },
  { id: 'stands', anchor: /^Стойка$/i, need: /Ширина|Заглубление|Длина/i,
    fields: [['st', /^Стойка/i], ['width_m', /^Ширина/i, 'num'], ['length_m', /^Длина/i, 'num'], ['embed_m', /^Заглубление/i, 'num'],
             ['height_m', /^Высота над землёй/i, 'num'], ['cx', /аэродинамическ/i, 'num'], ['note', /Примечание/i]] },
  { id: 'cables', anchor: /^Марка$/i, need: /Тип элемента/i,
    fields: [['mark', /^Марка/i], ['type', /^Тип элемента/i], ['d', /^Наружный диаметр/i, 'num'], ['m', /^Погонная масса/i, 'num'],
             ['t', /^Допустимое тяжение/i, 'num'], ['EA_kn', /жёсткость|EA/i, 'num'], ['alpha_e6', /ТКЛР|коэффициент линейного/i, 'num'],
             ['kv', /^Область применения/i, 'kv'], ['note', /^Примечание/i]] },
  { id: 'wires', anchor: /^Марка провода/i, need: /диаметр/i,
    fields: [['mark', /^Марка провода/i], ['d', /^Наружный диаметр/i, 'num'], ['m', /^Погонная масса/i, 'num'], ['kind', /^Вид/i]] }
];

function parse(aoa) {
  var out = { poles: [], cables: [], wires: [], stands: [], capacity: [] };
  for (var r = 0; r < aoa.length; r++) {
    var row = aoa[r] || [];
    for (var c = 0; c < row.length; c++) {
      var h = s(row[c]);
      if (!h) continue;
      BLOCKS.forEach(function (b) {
        if (!b.anchor.test(h)) return;
        /* колонки блока: подряд идущие непустые заголовки, начиная с одной левее якоря */
        var cols = {}, c0 = Math.max(0, c - 1), c1 = c;
        while (c1 + 1 < row.length && s(row[c1 + 1])) c1++;
        var headerText = [];
        for (var k = c0; k <= c1; k++) headerText.push(s(row[k]));
        if (!b.need.test(headerText.join(' | '))) return;
        if (b.id === 'poles' && /Несущая способность|момент конструкции|горизонтальное тяжение/i.test(headerText.join(' '))) return;
        b.fields.forEach(function (f) {
          for (var k2 = c0; k2 <= c1; k2++) if (f[1].test(s(row[k2]))) { if (cols[f[0]] === undefined) cols[f[0]] = k2; }
        });
        var keyField = b.fields[b.id === 'poles' ? 1 : 0][0];
        if (cols[keyField] === undefined) return;
        for (var rr = r + 1; rr < aoa.length; rr++) {
          var rw = aoa[rr] || [];
          var key = s(rw[cols[keyField]]);
          if (!key) break;
          var item = {};
          b.fields.forEach(function (f) {
            if (cols[f[0]] === undefined) return;
            var v = rw[cols[f[0]]];
            item[f[0]] = f[2] === 'num' ? num(v) : (f[2] === 'kv' ? kvText(v) : s(v));
          });
          if (b.id === 'poles') {
            item.proj_full = item.st ? item.proj + ' (' + item.st + ')' : item.proj; item.approx = 0;
            item.sch = (item.sch || '').toLowerCase();
          }
          if (b.id === 'capacity') { item.m_cap_knm = num(item.m_cap_knm); item.T_top_kn = num(item.T_top_kn); item.T_top_strut_kn = num(item.T_top_strut_kn); }
          out[b.id].push(item);
        }
      });
    }
  }
  return out;
}

/* Шаблон справочника с новыми блоками (стойки, несущая способность) */
function template(R) {
  var X = global.XLSX, wb = X.utils.book_new();
  var poles = [['Класс напряжения, кВ', 'Марка опоры', 'Материал', 'Тип по назначению', 'Типовой проект / серия', 'Стойка', 'Схема (учёт тяжения)', 'Доп. изгибающий момент стойки, кН·м', 'Высота подвеса, м', 'Габаритный пролёт, м']]
    .concat((R.POLES || []).map(function (p) { return [p.kv, p.mark, p.mat, p.type, p.proj, p.st, p.sch, p.m_adm, p.h, p.lgab]; }));
  var stands = [['Стойка', 'Ширина по фасаду, м', 'Длина стойки, м', 'Заглубление, м', 'Высота над землёй, м', 'Аэродинамический коэффициент', 'Примечание']]
    .concat((R.STANDS || []).map(function (x) { return [x.st, x.width_m, x.length_m, x.embed_m, x.height_m, x.cx, x.note]; }));
  var stSet = {}; (R.POLES || []).forEach(function (p) { if (p.st) stSet[p.st] = 1; });
  Object.keys(stSet).forEach(function (st) { if (!(R.STANDS || []).some(function (x) { return x.st === st; })) stands.push([st, '', '', '', '', '', 'заполнить по типовому проекту']); });
  var cap = [['Марка опоры', 'Несущая способность конструкции (с подкосом), кН·м',
              'Максимально допустимое горизонтальное тяжение, кН, приложенное к вершине',
              'Максимально допустимое горизонтальное тяжение опоры с подпором, кН, приложенное к вершине',
              'Типовой проект / серия', 'Примечание']]
    .concat((R.CAPACITY || []).map(function (x) { return [x.mark, x.m_cap_knm, x.T_top_kn, x.T_top_strut_kn, x.proj, x.note]; }));
  (R.POLES || []).forEach(function (p) {
    if ((R.CAPACITY || []).some(function (x) { return x.mark === p.mark; })) return;
    if (/анкер|концев|ответвит/.test(p.sch || '')) cap.push([p.mark, '', '', '', p.proj, 'опора с подкосом: заполнить по типовому проекту']);
    else if (/промежуточ|углов/.test(p.sch || '') && /бетон/i.test(p.mat || '')) cap.push([p.mark, '', '', '', p.proj, 'одностоечная: для опоры с подпором (муфта)']);
  });
  var cables = [['Марка', 'Тип элемента', 'Наружный диаметр, мм', 'Погонная масса, кг/км', 'Допустимое тяжение, кН', 'Жёсткость EA, кН', 'ТКЛР, ×10⁻⁶ 1/°C', 'Область применения (кВ)', 'Примечание']]
    .concat((R.CABLES || []).map(function (x) { return [x.mark, x.type, x.d, x.m, x.t, x.EA_kn, x.alpha_e6, x.kv, x.note]; }));
  var wires = [['Марка провода / троса', 'Наружный диаметр, мм', 'Погонная масса, кг/км', 'Вид']]
    .concat((R.WIRES || []).map(function (x) { return [x.mark, x.d, x.m, x.kind]; }));
  [['Опоры', poles], ['Стойки', stands], ['Несущая способность', cap], ['Кабели ВОЛС', cables], ['Провода', wires]].forEach(function (sh) {
    var ws = X.utils.aoa_to_sheet(sh[1]);
    ws['!cols'] = sh[1][0].map(function (h) { return { wch: Math.max(12, Math.min(42, String(h).length + 2)) }; });
    X.utils.book_append_sheet(wb, ws, sh[0]);
  });
  return wb;
}

global.PDRD_REFS_IO = { parse: parse, template: template, BLOCKS: BLOCKS };
})(typeof window !== 'undefined' ? window : globalThis);
