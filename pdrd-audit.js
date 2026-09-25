/* PD_RD — аудит комплекта и шлюз выпуска.
   Несоответствие (lv = 'stop') блокирует выпуск. Обход — только решением с
   обоснованием не короче 40 символов и Ф.И.О.; решение печатается в листе
   внутреннего контроля. */
(function (global) {
'use strict';
var MIN_REASON = 40;
function num(v) { var n = typeof v === 'number' ? v : parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }
function key(group, text) {
  var s = group + '|' + text.replace(/\d+([,.]\d+)?/g, '#'), h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return 'a' + (h >>> 0).toString(36);
}

function run(d, opt) {
  opt = opt || {};
  var out = [], P = global.PDRD, N = global.PDRD_NORMS, X = global.PDRD_DECIDE, S = global.PDRD_SPEC, PR = global.PDRD_PROFILES;
  function add(group, lv, text, ref) { out.push({ key: key(group, text), group: group, lv: lv, text: text, ref: ref || '' }); }

  /* 1. Входной контроль */
  var vk = d.intake || [];
  if (!vk.length) add('Входной контроль', 'stop', 'Исходные данные не загружены или входной контроль не выполнен');
  vk.filter(function (x) { return x.lv === 'stop'; }).forEach(function (x) { add('Входной контроль', 'stop', x.title + ': ' + x.text, 'лист входного контроля, п. ' + x.n); });
  var vw = vk.filter(function (x) { return x.lv === 'warn'; }).length;
  if (vw) add('Входной контроль', 'warn', 'Предупреждений входного контроля: ' + vw + ' — учтены в проектных решениях');

  /* 2–3. Комплектность ПД и СПДС */
  P.passportGaps(d).forEach(function (g) { add(/СРО|ДПТ|разрешение|экспертиз|изыскани/.test(g) ? 'Комплектность ПД' : 'Комплектность СПДС', 'stop', g); });
  var sm = (d.pdSwitches || {}).smeta, prof = PR ? PR.get(d.profile && d.profile.operator) : { req: [], params: {} };
  if (sm === null && prof.smeta !== 'не разрабатывать') add('Комплектность ПД', 'stop', 'Не решено, разрабатывается ли раздел 9 «Смета»');
  if (sm === true && !d.smetaText) add('Комплектность ПД', 'stop', 'Раздел 9 «Смета» отмечен как разрабатываемый, но не заполнен');
  if (d.legal.dpt.needed === true) add('Комплектность ПД', 'stop', 'Раздел 2 «Проект полосы отвода» разрабатывается по ДПТ — данные полосы отвода в программе не формируются, раздел нужно приложить', 'ПП РФ № 87, п. 32 «б»');
  (opt.templates || []).forEach(function (t) {
    t.missing.forEach(function (m) { add('Комплектность СПДС', 'stop', t.code + ': не заполнено «' + m + '»'); });
  });

  /* 4. Нормы ТТ № 282р */
  if (X) {
    var ch = X.check(d);
    ch.forEach(function (x) { add('Нормы ТТ № 282р и решения', x.lv, x.where + ': ' + x.text, x.ref); });
    if (!d.poles.some(function (p) { return p.design && p.design.decision; })) add('Нормы ТТ № 282р и решения', 'stop', 'Решения по опорам не приняты');
  }
  var cr = d.calcResult;
  if (cr) {
    var bk = {};
    d.poles.forEach(function (p) { (p.lines || []).forEach(function (l) { bk[l.lineId + '|' + l.num] = p; }); });
    (cr.spans || []).filter(function (s) { return s.status === 'exceed'; }).forEach(function (s) {
      var ends = [bk[s.line + '|' + s.from], bk[s.line + '|' + s.to]];
      var fixed = ends.some(function (p) { return p && p.design && ['extra', 'bypass', 'exclude'].indexOf(p.design.decision) >= 0; });
      if (fixed) { add('Нормы ТТ № 282р и решения', 'warn', 'Пролёт ' + s.from + ' — ' + s.to + ' (' + s.line + '): нормы обеспечиваются мероприятием (дополнительная опора / обход)'); return; }
      add('Нормы ТТ № 282р и решения', 'stop', 'Пролёт ' + s.from + ' — ' + s.to + ' (' + s.line + '): ' + (s.reasons || []).join('; '), 'ТТ № 282р, пп. 3.2.2, 3.2.4');
    });
  }

  if (global.PDRD_TEXTS) global.PDRD_TEXTS.crossings(d).forEach(function (c) {
    var req = num(c.h_req_m);
    if (req === null || !c.ref) add('Нормы ТТ № 282р и решения', 'stop', 'Пересечение «' + c.object + '»: не указан требуемый габарит или основание');
    else if (c.h_calc_m === null) add('Нормы ТТ № 282р и решения', 'stop', 'Пересечение «' + c.object + '» (' + c.from + ' — ' + c.to + '): пролёт не рассчитан');
    else if (c.h_calc_m < req) add('Нормы ТТ № 282р и решения', 'stop', 'Пересечение «' + c.object + '»: габарит ' + String(Math.round(c.h_calc_m * 100) / 100).replace('.', ',') + ' м меньше требуемого ' + String(req).replace('.', ',') + ' м', c.ref);
  });
  if (!(d.crossings || []).length && !d.crossingsChecked) add('Нормы ТТ № 282р и решения', 'stop', 'Пересечения не внесены и отсутствие пересечений не подтверждено');

  /* 5. Связь с отчётом п. 13 */
  if (!d.basis.report13.sha256) add('Связь с отчётом п. 13', 'warn', 'Контрольная сумма входного файла не записана (данные взяты из браузера)');
  var orphan = d.poles.filter(function (p) { return !(p.fromReport || []).length; });
  if (orphan.length) add('Связь с отчётом п. 13', 'stop', 'Опоры, отсутствующие в отчёте: ' + orphan.length);

  /* 6. Расчёты */
  if (!cr) add('Расчёты', 'stop', 'Расчёт не выполнен');
  else {
    if (cr.summary.blocked) add('Расчёты', 'stop', 'Расчёт не завершён для ' + cr.summary.blocked + ' опор: нет исходных данных (' + Object.keys(cr.missing || {}).slice(0, 4).join('; ') + ')', 'ТТ № 282р, п. 6');
    var exPlaced = (cr.poles || []).filter(function (x) {
      if (x.status !== 'exceed') return false;
      var p = d.poles.filter(function (q) { return q.id === x.id; })[0];
      return p && p.design && p.design.decision === 'place';
    });
    if (exPlaced.length) add('Расчёты', 'stop', 'Решение «размещать» на ' + exPlaced.length + ' опорах с невыполненной проверкой несущей способности');
    if (!(d.climate || {}).confirmed) add('Расчёты', 'stop', 'Климатические условия не подтверждены проектировщиком');
    if (cr.app && cr.app !== P.VERSION) add('Расчёты', 'warn', 'Расчёт выполнен версией ' + cr.app + ', текущая — ' + P.VERSION + '; рекомендуется пересчитать');
  }
  var inp = global.PDRD_DESIGN ? global.PDRD_DESIGN.inputs(d) : null;
  if (inp) inp.miss.forEach(function (m) { add('Расчёты', 'stop', 'Нет исходных данных: ' + m.text); });

  /* 7. Метрология */
  var met = (d.metrology && d.metrology.length) ? d.metrology : (global.PDRD_TEXTS ? global.PDRD_TEXTS.defaultMetrology(d) : []);
  met.forEach(function (m) {
    ['param', 'value', 'tol', 'nd', 'method', 'period', 'si'].forEach(function (k) { if (!String(m[k] || '').trim()) add('Метрология (ПТ-029-4)', 'stop', '«' + (m.param || '?') + '»: не заполнено поле ' + k, 'ПТ-029-4, п. 14'); });
    if (/техполитик/i.test(m.value + m.tol)) add('Метрология (ПТ-029-4)', 'warn', '«' + m.param + '»: значение по технической политике оператора — уточнить числом', 'ПТ-029-4, п. 14');
  });
  if (!(d.metrology && d.metrology.length)) add('Метрология (ПТ-029-4)', 'warn', 'Применён типовой перечень контролируемых параметров — подтвердить на странице «Проект»');

  /* 8. Спецификация */
  if (S && d.poles.some(function (p) { return p.design && p.design.decision; })) {
    var sp = S.build(d);
    if (sp.lengths.total_m < sp.lengths.route_m) add('Спецификация', 'stop', 'Длина кабеля меньше протяжённости трассы');
    if (sp.lengths.short_m) add('Спецификация', 'stop', 'Протяжённость трассы по расчёту (' + (sp.lengths.route_m / 1000).toFixed(3).replace('.', ',') + ' км) меньше заявленной в исходных данных на ' + Math.round(sp.lengths.short_m) + ' м — проверьте пролёты, решения по опорам и перечень линий');
    if (!d.cable.cert) add('Спецификация', 'stop', 'Нет реквизитов документа соответствия на кабель', 'ТТ № 282р, п. 3.3; приказ Мининформсвязи № 47');
    if (sp.needType) add('Спецификация', 'stop', 'Не указаны тип и марка для ' + sp.needType + ' позиций спецификации (страница «Спецификация»)', 'ГОСТ 21.110-2013');
    if (sp.reinforced) add('Спецификация', 'warn', 'Усиление подкосом предусмотрено на ' + sp.reinforced + ' одностоечных опорах с муфтой — согласовать с владельцем инфраструктуры (мероприятие Е.1)');
    if (!sp.lengths.params.sagFactorSet) add('Спецификация', 'warn', 'Коэффициент на провис и отходы принят по умолчанию (' + String(sp.lengths.params.sagFactor).replace('.', ',') + ') — подтвердить');
    var t = sp.totals, nodesAll = Object.keys(t.nodes).reduce(function (a, k) { return a + t.nodes[k]; }, 0);
    var tags = (sp.items.filter(function (x) { return x.key === 'tag'; })[0] || {}).qty || 0;
    if (tags !== nodesAll) add('Спецификация', 'stop', 'Число бирок (' + tags + ') не совпадает с числом узлов (' + nodesAll + ')');
  }

  /* 9. Е.1 / Е.2 */
  (d.measuresE1 || []).forEach(function (m) { if (!/пользовател/i.test(m.performer || '')) add('Разделение Е.1 / Е.2', 'stop', 'Мероприятие Е.1 «' + m.text + '» — исполнитель не пользователь', 'ч. 1 ст. 10 135-ФЗ'); });
  var e1corr = (d.measuresE1 || []).filter(function (m) { return m.corrected; }).length;
  if (e1corr) add('Разделение Е.1 / Е.2', 'warn', 'Исполнитель ' + e1corr + ' мероприятий Е.1 исправлен при импорте на «пользователь инфраструктуры»');

  /* 10. Нормы */
  N.check().forEach(function (x) { if (x.lv === 'stop') add('Реестр норм', 'stop', x.txt); });
  var unchecked = N.DOCS.filter(function (x) { return !x.checked && x.status !== 'заменён' && !x.notApplicable; }).length;
  if (unchecked) add('Реестр норм', 'warn', 'Документов, не сверенных с первоисточником: ' + unchecked);
  var unconf = N.check().filter(function (x) { return x.lv === 'warn'; }).length;
  if (unconf) add('Реестр норм', 'warn', 'Значений с пометкой «сверить номер пункта / требует подтверждения»: ' + unconf);

  /* 11. Профиль оператора */
  (prof.req || []).forEach(function (r) { if (r.need) add('Профиль оператора', 'warn', r.text + ' — ' + r.need, 'ТЗ, ' + r.ref); });
  if (d.profile && d.profile.operator === 'beeline') {
    if (!d.routeAct) add('Профиль оператора', 'stop', 'Акт выбора трассы (не менее двух вариантов) не приложен', 'ТЗ ВымпелКом, п. 16');
    if (d.legal.expertise.needed !== true) add('Профиль оператора', 'stop', 'ТЗ требует экспертизы проектной документации', 'ТЗ ВымпелКом, п. 19');
  }
  if (d.profile && d.profile.operator === 'mts' && !(num((d.decideParams || {}).emergencyShare) || (prof.params || {}).emergencyShare)) add('Профиль оператора', 'stop', 'Не предусмотрен аварийный запас 5 %', 'ТЗ МТС, п. 9.5.8');

  /* 12. Сроки */
  var b = d.basis, rel = d.passport.releaseDate;
  if (b.report13.date && rel && rel < b.report13.date) add('Сроки', 'stop', 'Дата выпуска раньше даты отчёта по п. 13');
  if (b.tz.date && rel && rel < b.tz.date) add('Сроки', 'stop', 'Дата выпуска раньше даты технического задания');
  if (b.contract.date && rel && rel < b.contract.date) add('Сроки', 'stop', 'Дата выпуска раньше даты договора');

  /* обходы */
  var ov = {}; ((d.audit || {}).overrides || []).forEach(function (o) { ov[o.key] = o; });
  out.forEach(function (x) { if (ov[x.key]) x.override = ov[x.key]; });
  return out;
}

function gate(items) {
  var open = items.filter(function (x) { return x.lv === 'stop' && !x.override; });
  return { ok: !open.length, open: open, stops: items.filter(function (x) { return x.lv === 'stop'; }).length, warns: items.filter(function (x) { return x.lv === 'warn'; }).length };
}

function override(d, item, reason, who) {
  reason = String(reason || '').trim(); who = String(who || '').trim();
  if (reason.length < MIN_REASON) throw new Error('Обоснование должно быть не короче ' + MIN_REASON + ' символов');
  if (!/^[А-ЯЁA-Z][а-яёa-z\-]+\s+[А-ЯЁA-Z]\.\s?[А-ЯЁA-Z]\.?$|^[А-ЯЁA-Z]\.\s?[А-ЯЁA-Z]\.\s?[А-ЯЁA-Z][а-яёa-z\-]+$/.test(who)) throw new Error('Укажите Ф.И.О. принявшего решение (например, «Куличкин Е.В.»)');
  d.audit = d.audit || { items: [], overrides: [] };
  d.audit.overrides = (d.audit.overrides || []).filter(function (o) { return o.key !== item.key; });
  d.audit.overrides.push({ key: item.key, group: item.group, text: item.text, reason: reason, who: who, at: new Date().toISOString() });
}

/* Проверка поступившего проекта (режим «Проверка»): лист замечаний */
function remarks(items) {
  return items.filter(function (x) { return x.lv !== 'info'; }).map(function (x, i) {
    return { n: i + 1, group: x.group, text: x.text, ref: x.ref || '', level: x.lv === 'stop' ? 'обязательно к устранению' : 'рекомендуется учесть' };
  });
}

global.PDRD_AUDIT = { MIN_REASON: MIN_REASON, run: run, gate: gate, override: override, remarks: remarks, key: key };
})(typeof window !== 'undefined' ? window : globalThis);
