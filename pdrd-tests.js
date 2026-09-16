/* PD_RD — автотесты. Каждая правка расчётов и аудита добавляет сюда тест. */
(function(){
'use strict';
var P = window.PDRD, mem = window.__mem, res = [];
function t(name, fn){
  try { var d = fn(); res.push({ name:name, ok:true, d:d || '' }); }
  catch(e){ res.push({ name:name, ok:false, d:e.message }); }
}
function eq(a, b, what){ if (a !== b) throw new Error((what||'значение') + ': ожидалось ' + JSON.stringify(b) + ', получено ' + JSON.stringify(a)); }
function clear(){ Object.keys(mem).forEach(function(k){ delete mem[k]; }); P.refresh(); }

if (window.__fakeFailed) res.push({ name:'Изоляция хранилища', ok:false, d:'браузер не дал подменить localStorage — тесты не запускались' });
else {
t('Пустой проект: схема и ГИП', function(){
  clear(); var d = P.load();
  eq(d.schema, 'pdrd-project/1', 'схема'); eq(d.passport.signs.gip, 'Е.В. Куличкин', 'ГИП');
  eq(d.passport.stage, 'ПД+РД', 'стадия'); eq(d.legal.sro.member, true, 'членство в СРО');
  return 'pdrd-project/1, ГИП Е.В. Куличкин';
});
t('Сохранение и чтение', function(){
  clear(); var d = P.load(); d.passport.object = 'Пилот'; P.save(); P.refresh();
  eq(P.load().passport.object, 'Пилот'); eq(!!mem['pdrd_project_v1_stamp'], true, 'отметка записи');
  return 'объект и отметка записи сохранены';
});
t('Запрет записи в ключи АРМ ППО', function(){
  var ok = false; try { P.safeSet('ppo_vols_object_v2', 'x'); } catch(e){ ok = true; }
  eq(ok, true, 'запись заблокирована'); eq(mem['ppo_vols_object_v2'], undefined, 'ключ V25');
  return 'запись отклонена';
});
t('Чтение АРМ ППО не меняет данные', function(){
  clear(); var src = JSON.stringify({ v:'3.5.10', pass:{ 'ОБЪЕКТ_НАИМ':'ВЛ 10 кВ', 'ОТЧЁТ_НОМЕР':'ДРНУ-ППО/1' }, poles:[{},{},{}], lines:[{}] });
  mem['ppo_vols_object_v2'] = src; var r = P.readV25();
  eq(r.poles, 3, 'опор'); eq(r.report, 'ДРНУ-ППО/1', 'отчёт'); eq(mem['ppo_vols_object_v2'], src, 'данные V25');
  eq(Object.keys(mem).filter(function(k){ return k.indexOf('pdrd_') !== 0 && k !== 'ppo_vols_object_v2'; }).length, 0, 'посторонние ключи');
  return '3 опоры, данные не изменены';
});
t('Отсутствие АРМ ППО', function(){ clear(); eq(P.readV25(), null); return 'null'; });
t('Миграция достраивает пропущенные разделы', function(){
  var o = P.blank(); delete o.legal; delete o.passport.signs.nkontr; o.poles = [{ id:'a' }];
  var m = P.migrate(o);
  eq(m.legal.sro.member, true, 'СРО'); eq(m.passport.signs.nkontr, '', 'Н. контроль'); eq(m.poles.length, 1, 'опоры сохранены');
  return 'разделы восстановлены, данные сохранены';
});
t('Чужая схема отклоняется', function(){
  var ok = false; try { P.parseProject(JSON.stringify({ schema:'другое/9' })); } catch(e){ ok = true; }
  eq(ok, true); return 'файл другой схемы не принят';
});
t('Файл АРМ ППО не принимается как проект', function(){
  var ok = false; try { P.parseProject(JSON.stringify({ pass:{}, poles:[] })); } catch(e){ ok = /не файл проекта/.test(e.message); }
  eq(ok, true); return 'понятное сообщение';
});
t('Пустой проект не выпускается', function(){
  clear(); var g = P.passportGaps();
  eq(g.indexOf('Шифр не утверждён') >= 0, true, 'шифр'); eq(g.indexOf('Не заполнены реквизиты СРО') >= 0, true, 'СРО');
  return g.length + ' блокирующих пробелов';
});
t('Сброс удаляет только свои ключи', function(){
  clear(); mem['ppo_vols_object_v2'] = '{}'; P.save(); P.reset();
  eq(mem['pdrd_project_v1'], undefined, 'проект'); eq(mem['ppo_vols_object_v2'], '{}', 'V25');
  return 'данные V25 на месте';
});
t('Роли сторон: подрядчик в интересах оператора', function(){
  var r = P.splitParties('ООО "СвязьстройТелеКом" в интересах ПАО "Ростелеком"');
  eq(r.contractor, 'ООО "СвязьстройТелеКом"', 'подрядчик'); eq(r.operator, 'ПАО "Ростелеком"', 'оператор');
  eq(P.splitParties('ПАО «МТС»').operator, 'ПАО «МТС»', 'без подрядчика');
  return 'оператор — Ростелеком, подрядчик — СвязьстройТелеКом';
});
}

/* ---------------------------------------------------------- реестр норм */
var N = window.PDRD_NORMS;
if (N) {
t('Реестр норм: нет ошибок', function(){
  var s = N.check().filter(function(x){ return x.lv === 'stop'; });
  eq(s.length, 0, 'ошибок'); return N.DOCS.length + ' документов, ' + N.VALUES.length + ' значений';
});
t('ОКСН — СИП 0,4 кВ: 0,4 м', function(){
  var r = N.wireDistance(0.4, 'СИП-2 3×50+1×54,6'); eq(r.value, 0.4); eq(r.ref, 'ТТ № 282р, п. 3.2.2', 'ссылка'); return r.ref;
});
t('ОКСН — голый провод 0,4 кВ: пробел, без подстановки', function(){
  var r = N.wireDistance(0.4, 'А 50'); eq(r.gap, true, 'пробел'); eq(r.value, null, 'значение'); return 'значение не подставлено';
});
t('ОКСН — провод по классам 10 / 35 / 110 кВ', function(){
  eq(N.wireDistance(10).value, 0.6, '10 кВ'); eq(N.wireDistance(35).value, 0.6, '35 кВ'); eq(N.wireDistance(110).value, 1.0, '110 кВ');
  return '0,6 / 0,6 / 1,0 м';
});
t('Класс вне ТТ (500 кВ) не подставляется', function(){ eq(N.wireDistance(500).gap, true); return 'пробел'; });
t('Нормы ТТ: 0,20 / 5,0 / 0,3 / 0,3 м', function(){
  eq(N.val('tt.dist.element').value, 0.2); eq(N.val('tt.dist.ground').value, 5.0);
  eq(N.val('tt.dist.fixH').value, 0.3); eq(N.val('tt.dist.fixV').value, 0.3);
  return 'пп. 3.2.3–3.2.6';
});
t('Незарегистрированный норматив — ошибка', function(){
  var ok = false; try { N.val('нет.такого'); } catch(e){ ok = true; } eq(ok, true); return 'расчёт остановлен';
});
t('Заменённый ГОСТ 13276-79 обнаруживается в тексте', function(){
  var h = N.findReplaced('Арматура по ГОСТ 13276-79 и прил. В');
  eq(h.length, 1); eq(h[0].use, 'ГОСТ Р 51177-2017', 'замена'); return 'заменить на ' + h[0].use;
});
t('ГОСТ Р 21.618-2023 помечен как неприменимый к трассе', function(){ eq(N.doc('gost21618').notApplicable, true); return 'п. 1.3 стандарта'; });
t('ПП № 87 — срок действия до 01.09.2028', function(){ eq(N.docStatusText(N.doc('pp87')), 'действует до 01.09.2028'); return 'ред. от 21.10.2025'; });
}
var M = window.PDRD_MARKS;
if (M) t('Состав ПД — 10 разделов по п. 32', function(){
  eq(M.PD.length, 10); eq(M.PD[2].code, 'ТКР', 'раздел 3'); eq(M.APPROVED, false, 'марки не утверждены'); return 'ПЗ … ИД';
});
var PR = window.PDRD_PROFILES;
if (PR) t('Профиль пилота — Ростелеком', function(){
  var p = PR.LIST.filter(function(x){ return x.pilot; });
  eq(p.length, 1); eq(p[0].id, 'rostelecom-b2c-gpon'); eq(PR.get('beeline').smeta, 'не разрабатывать', 'смета ВымпелКом');
  return p[0].title;
});

var ok = res.filter(function(r){ return r.ok; }).length;
var rows = document.getElementById('rows');
res.forEach(function(r){
  var tr = document.createElement('tr');
  [r.name, r.ok ? 'пройдена' : 'ошибка', r.d].forEach(function(v, i){
    var td = document.createElement('td'); td.textContent = v;
    if (i === 1) td.className = 'r ' + (r.ok ? 'ok' : 'bad');
    tr.appendChild(td);
  });
  rows.appendChild(tr);
});
var s = document.getElementById('sum');
s.className = 'msg ' + (ok === res.length ? 'ok' : 'bad');
s.textContent = 'Пройдено ' + ok + ' из ' + res.length + ' · ядро ' + P.VERSION;
window.__results = res;
})();
