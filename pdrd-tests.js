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
}

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
