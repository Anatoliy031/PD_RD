/* PD_RD — демонстрационный проект. Все данные вымышленные и помечены «ДЕМО»;
   используются для проверки всей цепочки без конфиденциальных отчётов. */
(function (global) {
'use strict';
function v25() {
  var poles = [], lat0 = 45.30, lon0 = 39.10, dLat = 0.00036;
  /* ВЛ 0,4 кВ Л-1: 18 опор, анкер в начале и в конце, угол на 9-й, ответвление на 12-й */
  var marks04 = ['КА8-1', 'П8-1', 'П8-1', 'П8-1', 'А8-1', 'П8-1', 'П8-1', 'П8-1', 'УП8-1', 'П8-1', 'П8-1', 'ОА8-1', 'П8-1', 'П8-1', 'П8-1', 'П8-1', 'П8-1', 'КА8-1'];
  marks04.forEach(function (m, i) {
    var lat = lat0 + i * dLat, lon = lon0 + (i >= 8 ? (i - 8) * 0.0004 : 0);
    poles.push({ line: 'ДЕМО ВЛ 0,4 кВ Л-1 от КТП-1', num: String(i + 1), kv: '0,4', mark: m, lat: lat, lon: lon,
      span: i < marks04.length - 1 ? (i === 6 ? '58' : '40') : '', prevRef: i ? String(i) : '', nextRef: i < marks04.length - 1 ? String(i + 2) : '',
      endPole: i === marks04.length - 1 ? 1 : 0, defect: i === 14 ? 'A' : '—', defText: i === 14 ? 'Разрушение защитного слоя бетона с обнажением и коррозией арматуры' : '', photos: i === 14 ? ['f1'] : [] });
  });
  /* отпайка от опоры 12 */
  ['П8-1', 'П8-1', 'КА8-1'].forEach(function (m, i) {
    poles.push({ line: 'ДЕМО ВЛ 0,4 кВ Л-1, отпайка', num: '12-' + (i + 1), kv: '0,4', mark: m, lat: lat0 + 11 * dLat, lon: lon0 + 0.0016 + (i + 1) * 0.0005,
      span: i < 2 ? '39' : '', prevRef: i ? '12-' + i : '', nextRef: i < 2 ? '12-' + (i + 2) : '', endPole: i === 2 ? 1 : 0, defect: '—' });
  });
  /* ВЛ 10 кВ Ф-3: 10 опор, совместная первая опора */
  var marks10 = ['А10-1', 'П10-1', 'П10-1', 'П10-1', 'П10-1', 'УА10-1', 'П10-1', 'П10-1', 'П10-1', 'А10-1'];
  marks10.forEach(function (m, i) {
    poles.push({ line: 'ДЕМО ВЛ 10 кВ Ф-3', num: String(i + 1), kv: '10', mark: m, lat: lat0 - 0.0006 - i * 0.0005, lon: lon0 + i * 0.0002,
      span: i < marks10.length - 1 ? (i === 3 ? '75' : '56') : '', prevRef: i ? String(i) : '', nextRef: i < marks10.length - 1 ? String(i + 2) : '', defect: '—' });
  });
  return { v: '3.5.10', pass: {
    'ОТЧЁТ_НОМЕР': 'ДЕМО-ППО/2026-001', 'ОТЧЁТ_ДАТА': '2026-08-20', 'ЗАПРОС_НОМЕР': 'ДЕМО-1', 'ЗАПРОС_ДАТА': '2026-07-01',
    'ВЛАДЕЛЕЦ_НАИМ': 'ПАО «Россети Юг»', 'ВЛАДЕЛЕЦ_ФИЛИАЛ': 'филиал ПАО «Россети Юг» — «Кубаньэнерго», ДЕМО электрические сети',
    'ПОЛЬЗОВАТЕЛЬ_НАИМ': 'ООО «ДЕМО-Связь» в интересах ПАО «Ростелеком»', 'ОБЪЕКТ_НАИМ': 'ДЕМО: размещение ВОЛС на опорах ВЛ 0,4–10 кВ, пос. Условный',
    'ОБЪЕКТ_МЕСТО': 'Краснодарский край, условный район, пос. Условный', 'РАБОТЫ_НАЧАЛО': '2026-07-20', 'РАБОТЫ_ОКОНЧАНИЕ': '2026-08-10',
    'ВЕТЕР_РАЙОН': 'III', 'ВЕТЕР_ДАВЛЕНИЕ': '650', 'ГОЛОЛЁД_РАЙОН': 'II', 'ГОЛОЛЁД_СТЕНКА': '15', 'МЕСТНОСТЬ_ТИП': 'A', 'СЕЙСМИКА': '7',
    'КЛИМАТ_ИСТОЧНИК': 'ДЕМО — карты районирования ПУЭ-7', 'ИСПОЛНИТЕЛЬ_СОСТАВ': 'Иванов И.И., Петров П.П.'
  }, lines: [], poles: poles, si: [], meas: [], acts: [],
    wires: [{ mark: 'СИП-2 3х50+1х54,6', n: 1, kv: '0,4', h: '7', tens: '2' }, { mark: 'АС 35/6.2', n: 3, kv: '10', h: '8', tens: '1,5' }],
    cables: [{ mark: 'ОКСН-6-2,7', kv: '0,4–10', h: '6', tens: '1', arm: 'спиральная' }] };
}
function build() {
  var I = global.PDRD_IMPORT, P = global.PDRD;
  var r = I.toProject(I.fromV25Object(v25()), P.blank());
  var d = r.project, p = d.passport;
  p.designCustomer = 'ООО «ДЕМО-Связь»'; p.releaseDate = '2026-09-16';
  p.signs.razrab = 'Иванов И.И.'; p.signs.prov = 'Петров П.П.'; p.signs.nkontr = 'Сидоров С.С.';
  d.basis.tz = { number: 'ДЕМО-ТЗ-1', date: '2026-08-25', title: 'на разработку проектной и рабочей документации' };
  d.basis.contract = { number: 'ДЕМО-ПИР-1', date: '2026-08-25' };
  d.basis.tu = { number: 'ДЕМО-ТУ-1', date: '2026-08-22' };
  d.basis.surveys = { done: false, reports: '', reason: 'ДЕМО: кабель размещается на существующих опорах; сведения о трассе и опорах получены по результатам обследования владельцем (отчёт по п. 13).' };
  d.legal.sro = { member: true, name: 'ДЕМО СРО', regNumber: 'ДЕМО-000', extractDate: '2026-09-01' };
  d.legal.permit = { needed: false, ref: 'ДЕМО — указать статью ГрК РФ и пункт ПП РФ № 1816' };
  d.legal.dpt = { needed: false, ref: 'ДЕМО — указать пункт ПП РФ № 1816' };
  d.legal.expertise = { needed: false, kind: '', ref: 'ДЕМО — указать основание' };
  d.legal.land = { text: 'ДЕМО: кабель размещается на существующих опорах в границах охранных зон ВЛ; изъятие земельных участков не требуется.' };
  d.pdSwitches = { ilo: false, smeta: false };
  d.crossingsChecked = true;
  Object.assign(d.climate, { tMax: 40, tMin: -25, tAvg: 10, confirmed: true });
  Object.assign(d.cable, { mark: 'ОКСН-6-2,7', fibers: 8, d_mm: 10.5, mass_kg_km: 90, EA_kn: 1500, alpha_e6: 5, t_mdrn_kn: 2.7, t_allow_kn: 2.7, cert: 'ДЕМО-декларация', serviceLife: 25, maker: 'ДЕМО' });
  d.designDefaults = { cableH: 6 };
  d.wiresByKv = { '0,4': [{ mark: 'СИП-2 3х50+1х54,6', n: 1, d_mm: 30, mass_kg_km: 600, h_m: 7.3, T_kn: 2, f_max_m: 0.9 }],
                  '10': [{ mark: 'АС 35/6.2', n: 3, d_mm: 8.4, mass_kg_km: 148, h_m: 8.5, T_kn: 1.5, f_max_m: 1.3 }] };
  d.stands = { 'СВ95-2': { width_m: 0.16, height_m: 7.3 }, 'СВ105': { width_m: 0.18, height_m: 8.2 } };
  d.poleCapacity = { 'КА8-1': { m_cap_knm: 60 }, 'А8-1': { m_cap_knm: 60 }, 'ОА8-1': { m_cap_knm: 60 }, 'А10-1': { m_cap_knm: 110 }, 'УА10-1': { m_cap_knm: 110 } };
  d.decideParams = { buildLength_m: 2000, reserveT_m: 15, dampersFromSpan_m: 70, sleeveMode: 'manual' };
  d.metrology = global.PDRD_TEXTS.defaultMetrology(d);
  /* ДЕМО: каталог изделий (марки вымышленные) */
  d.specCatalog = {
    clamp_susp: { type: 'ДЕМО-ЗПС-10', maker: 'ДЕМО-Арматура' },
    node_susp: { type: 'ДЕМО-УК-П', maker: 'ДЕМО-Арматура' },
    clamp_tens: { type: 'ДЕМО-ЗНС-10', maker: 'ДЕМО-Арматура' },
    node_tens: { type: 'ДЕМО-УК-Н', maker: 'ДЕМО-Арматура' },
    turnbuckle: { type: 'ДЕМО-ТР-12', maker: 'ДЕМО-Арматура' },
    link: { type: 'ДЕМО-ПР-7', maker: 'ДЕМО-Арматура' },
    band: { type: 'ДЕМО-ЛК-20', maker: 'ДЕМО-Арматура' },
    buckle: { type: 'ДЕМО-СК-20', maker: 'ДЕМО-Арматура' },
    sleeve_holder: { type: 'ДЕМО-КМ-1', maker: 'ДЕМО-Арматура' },
    reserve_holder: { type: 'ДЕМО-КЗ-1', maker: 'ДЕМО-Арматура' },
    tag: { type: 'ДЕМО-БМ', maker: 'ДЕМО-Арматура' },
    strut: { type: 'ДЕМО-ПОДКОС-СВ95', maker: 'по типовому проекту' },
    pole_extra: { type: 'ДЕМО-П8-1', maker: 'по типовому проекту' },
    'sleeve_прямая': { type: 'ДЕМО-МОГ-П', maker: 'ДЕМО-Связь' },
    'sleeve_разветвительная': { type: 'ДЕМО-МОГ-Р', maker: 'ДЕМО-Связь' },
    damper: { type: 'ДЕМО-ГВ-1', maker: 'ДЕМО-Арматура' },
    protector: { type: 'ДЕМО-ПС-1', maker: 'ДЕМО-Арматура' },
    sign: { type: 'ДЕМО-ЗН', maker: 'ДЕМО-Связь' }
  };
  d.demo = true;
  global.PDRD_DESIGN.solve(d);
  /* ДЕМО: муфты назначены «заказчиком» на двух опорах */
  ['12', '10'].forEach(function (numStr) {
    var p2 = d.poles.filter(function (x) { return (x.lines || []).some(function (l) { return l.num === numStr; }); })[0];
    if (p2) try { global.PDRD_DECIDE.setSleeve(d, p2.id, true, { type: numStr === '12' ? 'разветвительная' : 'прямая' }); } catch (e) {}
  });
  global.PDRD_DESIGN.store(d);
  return d;
}
global.PDRD_DEMO = { v25: v25, build: build };
})(typeof window !== 'undefined' ? window : globalThis);
