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
t('ОКСН — голый провод 0,4 кВ: 0,4 м по ПУЭ-7 п. 2.4.89', function(){
  var r = N.wireDistance(0.4, 'А 50'); eq(r.value, 0.4, 'значение'); eq(r.ref, 'ПУЭ-7, п. 2.4.89', 'ссылка'); return r.ref;
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

/* ---------------------------------------------------------- заполнение шаблонов */
var DX = window.PDRD_DOCX;
if (DX) {
  var WNS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
  function P_(txt, st){ return '<w:p><w:pPr><w:pStyle w:val="' + (st||'Body') + '"/></w:pPr><w:r><w:t xml:space="preserve">' + txt + '</w:t></w:r></w:p>'; }
  function docX(inner){ return '<w:document ' + WNS + '><w:body>' + inner + '<w:sectPr/></w:body></w:document>'; }
  function fill(inner, data){ var rep = { missing:[], errors:[], filled:0 }; var x = DX.fillPart(docX(inner), data, rep, 'document.xml'); return { x:x, r:rep }; }
  t('Шаблон: поле подставляется, пустое → «—» и пробел', function(){
    var o = fill(P_('Объект {{ОБЪЕКТ_НАИМ}}, ГИП {{ГИП_ФИО}}'), { fields:{ 'ГИП_ФИО':'Е.В. Куличкин', 'ОБЪЕКТ_НАИМ':'' } });
    eq(o.x.indexOf('<?xml') === 0, true, 'объявление XML');
    eq(o.x.indexOf('Объект —, ГИП Е.В. Куличкин') >= 0, true, 'текст'); eq(o.r.missing.length, 1, 'пробелов'); eq(o.r.missing[0].key, 'ОБЪЕКТ_НАИМ');
    return 'подставлено 1, пробел 1';
  });
  t('Шаблон: условие ЕСЛИ убирает блок', function(){
    var inner = P_('{{ЕСЛИ:ПОДРЯДЧИК}}', 'Marker') + P_('Подрядчик {{ПОДРЯДЧИК_НАИМ}}') + P_('{{КОНЕЦ}}', 'Marker') + P_('Хвост');
    var no = fill(inner, { cond:{ 'ПОДРЯДЧИК':false }, fields:{} });
    eq(no.x.indexOf('Подрядчик') < 0, true, 'блок удалён'); eq(no.x.indexOf('Хвост') >= 0, true, 'текст после блока'); eq(no.r.missing.length, 0, 'поля скрытого блока не считаются');
    var yes = fill(inner, { cond:{ 'ПОДРЯДЧИК':true }, fields:{ 'ПОДРЯДЧИК_НАИМ':'ООО «СвязьстройТелеКом»' } });
    eq(yes.x.indexOf('Подрядчик ООО «СвязьстройТелеКом»') >= 0, true, 'блок оставлен'); eq(yes.x.indexOf('ЕСЛИ') < 0, true, 'маркеры убраны');
    return 'оба варианта';
  });
  t('Шаблон: подсказки проектировщику удаляются', function(){
    var o = fill(P_('Подсказка для проектировщика', 'Hint') + P_('Текст'), { fields:{} });
    eq(o.x.indexOf('Подсказка') < 0, true); return 'удалена';
  });
  t('Шаблон: таблица вставляется, отсутствующая — пробел', function(){
    var o = fill(P_('{{ТАБЛИЦА:КАБЕЛЬ}}', 'Marker') + P_('{{ТАБЛИЦА:ОПОРЫ}}', 'Marker'),
      { tables:{ 'КАБЕЛЬ':{ cols:[{ t:'Параметр', w:1 }, { t:'Значение', w:1 }], rows:[['Марка', 'ОС-М5-8-7,0'], ['Диаметр', '']] } } });
    eq(o.x.indexOf('<w:tbl>') >= 0 || o.x.indexOf('<w:tbl ') >= 0, true, 'таблица');
    eq(o.x.indexOf('ОС-М5-8-7,0') >= 0, true, 'данные');
    eq(o.r.missing.length, 1, 'пробелов'); eq(o.r.missing[0].key, 'ТАБЛИЦА:ОПОРЫ');
    return 'КАБЕЛЬ вставлена, ОПОРЫ — пробел';
  });
  t('Шаблон: отметка «ШИФР НЕ УТВЕРЖДЁН» снимается только при утверждённом шифре', function(){
    var shape = '<w:p><w:r><w:pict xmlns:v="urn:schemas-microsoft-com:vml"><v:shape id="PDRD_WATERMARK"/></w:pict></w:r></w:p>';
    eq(fill(shape, { approved:false }).x.indexOf('PDRD_WATERMARK') >= 0, true, 'не утверждён — отметка есть');
    eq(fill(shape, { approved:true }).x.indexOf('PDRD_WATERMARK') < 0, true, 'утверждён — отметки нет');
    return 'работает';
  });
  t('Шаблон: разорванное поле обнаруживается', function(){
    eq(DX.brokenFields('<w:t>{{ОБЪЕКТ_</w:t><w:t>НАИМ}}</w:t>').length, 2); eq(DX.brokenFields('<w:t>{{ОБЪЕКТ_НАИМ}}</w:t>').length, 0);
    return 'проверка целостности';
  });
  t('Данные проекта: неутверждённый шифр в обозначении', function(){
    var d = P.blank(); var r = DX.dataFromProject(d, DX.TEMPLATES[2]);
    eq(r.approved, false); eq(r.fields['ОБОЗНАЧЕНИЕ'], 'ШИФР НЕ УТВЕРЖДЁН-ТКР'); eq(r.fields['СТАДИЯ'], 'П'); eq(r.fields['ГИП_ФИО'], 'Е.В. Куличкин');
    return r.fields['ОБОЗНАЧЕНИЕ'];
  });
  t('Данные проекта: нормы расстояний для СИП 0,4 и 10 кВ', function(){
    var d = P.blank(); d.lines = [{ kv:0.4, wireType:'СИП' }, { kv:10 }];
    var tb = DX.dataFromProject(d, DX.TEMPLATES[2]).tables['РАССТОЯНИЯ_НОРМЫ'];
    eq(tb.rows[0][1], 'не менее 0,4 м', '0,4 кВ СИП'); eq(tb.rows[1][1], 'не менее 0,6 м', '10 кВ');
    return tb.rows.length + ' строк';
  });
  t('Шаблонов — 10 разделов ПД и том РД', function(){ eq(DX.TEMPLATES.length, 11); eq(DX.TEMPLATES.filter(function(x){ return x.pd; }).length, 10); return '11'; });
}

/* ---------------------------------------------------------- импорт и входной контроль */
var IM = window.PDRD_IMPORT;
if (IM) {
  function v25(extra){
    var o = { v:'3.5.10', pass:{ 'ОТЧЁТ_НОМЕР':'ДРНУ-ППО/Т-1', 'ОТЧЁТ_ДАТА':'2026-09-08', 'ЗАПРОС_ДАТА':'2026-07-08',
      'ПОЛЬЗОВАТЕЛЬ_НАИМ':'ООО "Подряд" в интересах ПАО "Ростелеком"', 'ОБЪЕКТ_НАИМ':'Тестовый объект',
      'РАБОТЫ_НАЧАЛО':'2026-08-14', 'РАБОТЫ_ОКОНЧАНИЕ':'2026-08-20', 'ВЕТЕР_РАЙОН':'III', 'ВЕТЕР_ДАВЛЕНИЕ':'650',
      'ГОЛОЛЁД_РАЙОН':'II', 'ГОЛОЛЁД_СТЕНКА':'15', 'МЕСТНОСТЬ_ТИП':'A — открытая', 'СЕЙСМИКА':'7' },
      lines:[], si:[], meas:[], acts:[],
      poles:[
        { line:'ВЛ 0,4 Л-1', num:'1', kv:'0,4', mark:'П8-1', lat:45.1, lon:38.1, span:'35', defect:'—' },
        { line:'ВЛ 0,4 Л-2', num:'1', kv:'0,4', mark:'П8-1', lat:45.100005, lon:38.100005, span:'30', defect:'—' },
        { line:'ВЛ 0,4 Л-1', num:'2', kv:'0,4', mark:'П8-1', lat:45.1003, lon:38.1, span:'55', defect:'A' },
        { line:'ВЛ 10 Ф-1', num:'5', kv:'10', mark:'П10-1', lat:45.2, lon:38.2, span:'50', defect:'—' },
        { line:'ВЛ 10 Ф-1', num:'6', kv:'10', mark:'', lat:45.201, lon:38.2, span:'', defect:'—' }
      ],
      wires:[{ mark:'СИП-2 3х70+1х95', n:1, kv:'0,4', h:'7', tens:'2,5' }, { mark:'АС 35/6.2', n:3, kv:'10', h:'', tens:'' }],
      cables:[{ mark:'ОКСН-6-2,7', kv:'0,4–10', h:'5', tens:'1,2', arm:'спиральная' }] };
    if (extra) extra(o);
    return o;
  }
  t('Импорт V25: оператор и подрядчик разделены', function(){
    var ex = IM.fromV25Object(v25());
    eq(ex.user.operator, 'ПАО «Ростелеком»'); eq(ex.user.contractor, 'ООО «Подряд»'); eq(ex.climate.terrain_type, 'A', 'тип местности');
    return ex.user.operator + ' / ' + ex.user.contractor;
  });
  t('Совместные опоры разных линий (≤ 1,5 м) объединяются', function(){
    var ex = IM.fromV25Object(v25()), ph = IM.mergePoles(ex.poles);
    eq(ex.poles.length, 5, 'записей'); eq(ph.length, 4, 'физических');
    eq(ph[0].records.length, 2, 'в группе');
    return '5 записей → 4 опоры';
  });
  t('Опоры одной линии рядом не объединяются', function(){
    var recs = [{ line_id:'А', lat:45, lon:38 }, { line_id:'А', lat:45.000001, lon:38 }];
    eq(IM.mergePoles(recs).length, 2); return 'разные номера одной линии остаются разными';
  });
  t('Допуск объединения 1,5 м соблюдается', function(){
    var d1 = IM.haversine({ lat:45, lon:38 }, { lat:45.00001, lon:38 });
    eq(d1 > 1.0 && d1 < 1.2, true, 'расстояние ~1,11 м');
    eq(IM.mergePoles([{ line_id:'А', lat:45, lon:38 }, { line_id:'Б', lat:45.00001, lon:38 }]).length, 1, '1,1 м — объединены');
    eq(IM.mergePoles([{ line_id:'А', lat:45, lon:38 }, { line_id:'Б', lat:45.00002, lon:38 }]).length, 2, '2,2 м — нет');
    return 'haversine ' + d1.toFixed(2) + ' м';
  });
  window.__v25 = v25;
  function rulesOf(o){ var ex = IM.fromV25Object(o); return IM.intake(ex, IM.mergePoles(ex.poles)); }
  function hasRule(list, rule, lv){ return list.some(function(x){ return x.rule === rule && (!lv || x.lv === lv); }); }
  t('Контроль: конец работ раньше начала — блок', function(){
    var f = rulesOf(v25(function(o){ o.pass['РАБОТЫ_ОКОНЧАНИЕ'] = '2026-08-04'; }));
    eq(hasRule(f, 'dates', 'stop'), true); return 'правило 1';
  });
  t('Контроль: провода «все классы» при двух классах — блок', function(){
    var f = rulesOf(v25(function(o){ o.wires = [{ mark:'АС 35/6.2', n:3, kv:'все классы', h:'', tens:'' }]; }));
    eq(f.filter(function(x){ return x.rule === 'wires' && x.lv === 'stop'; }).length >= 2, true, 'класс и тяжение');
    return 'правило 3';
  });
  t('Контроль: провода по классам с тяжением — без блока по классу', function(){
    var f = rulesOf(v25());
    eq(f.some(function(x){ return x.rule === 'wires' && /все классы|указан для класса/.test(x.text); }), false, 'класс');
    eq(f.some(function(x){ return x.rule === 'wires' && /АС 35.*тяжение не указано/.test(x.text); }), true, 'тяжение АС 35');
    return 'СИП 0,4 и АС 35 10 кВ разнесены';
  });
  t('Контроль: исполнитель Е.1 «владелец» исправляется', function(){
    var o = v25(function(o){ o.acts = [{ manual:1, grp:'Е.1 — размещение', act:'Поверочный расчёт', performer:'Владелец инфраструктуры' }]; });
    var ex = IM.fromV25Object(o), r = IM.toProject(ex, P.blank());
    eq(hasRule(r.findings, 'e1', 'stop'), true, 'замечание');
    eq(r.project.measuresE1[0].performer, 'пользователь инфраструктуры', 'исправлено'); eq(r.project.measuresE1[0].corrected, true, 'отметка');
    return 'правило 5';
  });
  t('Контроль: опора без марки — блок', function(){ eq(hasRule(rulesOf(v25()), 'mark', 'stop'), true); return 'правило 9'; });
  t('Контроль: «загнивание древесины» на ж/б опоре — блок', function(){
    var ex = IM.fromV25Object(v25(function(o){ o.poles[2].defText = 'Загнивание древесины'; }));
    eq(hasRule(IM.intake(ex, IM.mergePoles(ex.poles)), 'material', 'stop'), true); return 'правило 8';
  });
  t('Контроль: монтажное тяжение ≥ допустимого — предупреждение', function(){
    var f = rulesOf(v25(function(o){ o.cables[0].tens = '2,7'; }));
    eq(f.some(function(x){ return x.rule === 'cable' && x.lv === 'warn' && /монтажное тяжение/.test(x.text); }), true); return 'правило 4';
  });
  t('Контроль: марки нет в справочнике — блок', function(){
    var f = rulesOf(v25(function(o){ o.poles[0].mark = 'X-999'; }));
    eq(hasRule(f, 'reference', 'stop'), true); return 'правило 16';
  });
  t('Проект из импорта: физические опоры, аварийная — без возможности', function(){
    var r = IM.toProject(IM.fromV25Object(v25()), P.blank());
    eq(r.project.poles.length, 4, 'опор'); eq(r.stats.groups, 1, 'групп');
    var av = r.project.poles.filter(function(p){ return /Аварийн/.test(p.state); });
    eq(av.length, 1, 'аварийных'); eq(av[0].fromReport[0].tech_possibility, 'нет', 'возможность');
    eq(r.project.profile.operator, 'rostelecom-b2c-gpon', 'профиль');
    return '4 опоры, профиль Ростелеком';
  });
  t('Импорт не трогает паспорт проекта (подписи, СРО)', function(){
    var base = P.blank(); base.passport.signs.razrab = 'Иванов И.И.'; base.legal.sro.name = 'СРО «Тест»';
    var r = IM.toProject(IM.fromV25Object(v25()), base);
    eq(r.project.passport.signs.razrab, 'Иванов И.И.'); eq(r.project.legal.sro.name, 'СРО «Тест»'); return 'сохранены';
  });
  t('Разбор отчёта .docx: таблицы по заголовкам', function(){
    function tbl(head, rows){ var r = function(cs){ return '<w:tr>' + cs.map(function(c){ return '<w:tc><w:p><w:r><w:t>' + c + '</w:t></w:r></w:p></w:tc>'; }).join('') + '</w:tr>'; };
      return '<w:tbl>' + r(head) + rows.map(r).join('') + '</w:tbl>'; }
    function p_(t){ return '<w:p><w:r><w:t>' + t + '</w:t></w:r></w:p>'; }
    var H = ['№','Линия (фидер)','№ опоры','Класс, кВ','Марка','Материал','Тип по назначению','Смежная опора (пред.)','Пролёт до пред., м','Смежная опора (след.)','Пролёт до след., м','Расч. пролёт, м','Габарит. пролёт, м','Местность','Габарит норм., м','Ранее размещ. ОК','Дефект','Кат.','Состояние (ГОСТ 31937-2024)','Технол. возможность','Мероприятие','Широта','Долгота'];
    var xml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      p_('Регистрационный номер ДРНУ-ППО/2026-1 от 08.09.2026') + p_('Пользователь инфраструктуры: ООО "А" в интересах ПАО "Ростелеком"') +
      tbl(['Сведения','Значение'], [['Период выполнения работ','с 14.08.2026 по 04.08.2026'],['Количество опор в границах запроса','2 шт.']]) +
      tbl(H, [['1','Л-1','1','0,4','П8-1','Железобетонная','Промежуточная','—','—','2','76','76','40','населённая','6','—','—','—','Работоспособное','есть','—','45,1','38,1'],
              ['2','Л-1','2','0,4','П8-1','Железобетонная','Промежуточная','1','76','—','—','76','40','населённая','6','—','—','—','Работоспособное','есть','—','45,1007','38,1']]) +
      '</w:body></w:document>';
    var ex = IM.fromReportDocxXml(xml);
    eq(ex.report.number, 'ДРНУ-ППО/2026-1'); eq(ex.report.date, '2026-09-08', 'дата');
    eq(ex.poles.length, 2, 'опор'); eq(ex.poles[0].lat, 45.1, 'широта'); eq(ex.poles[0].span_next_m, 76, 'пролёт');
    eq(ex.report.period.to, '2026-08-04', 'период'); eq(ex.user.operator, 'ПАО «Ростелеком»', 'оператор');
    var f = IM.intake(ex, IM.mergePoles(ex.poles));
    eq(hasRule(f, 'dates', 'stop'), true, 'даты'); eq(hasRule(f, 'decisions'), true, 'пролёт > габаритного');
    return '2 опоры, период и пролёты разобраны';
  });
  t('Лист входного контроля: таблицы и заключение', function(){
    var r = IM.toProject(IM.fromV25Object(v25()), P.blank());
    var dd = window.PDRD_DOCX.dataForIntake(r.project);
    eq(dd.tables['ВК_ЗАМЕЧАНИЯ'].rows.length, r.findings.length, 'замечаний');
    eq(/блокирующих/.test(dd.blocks['ВК_ЗАКЛЮЧЕНИЕ'][0]), true, 'заключение');
    return r.findings.length + ' замечаний';
  });
}

/* ---------------------------------------------------------- расчётное ядро (ПУЭ-7) */
var CL = window.PDRD_CALC;
function near(a, b, tol, what){ if (!(Math.abs(a - b) <= (tol || 1e-3))) throw new Error((what || 'значение') + ': ожидалось ' + b + ', получено ' + a); }
if (CL) {
  t('Таблицы климата: W0 и bэ по районам (табл. 2.5.1, 2.5.3)', function(){
    eq(CL.w0ByRegion('III'), 650); eq(CL.w0ByRegion('I'), 400); eq(CL.bByRegion('II'), 15); eq(CL.bByRegion('IV'), 25); eq(CL.w0ByRegion('X'), null);
    return 'III → 650 Па; II → 15 мм';
  });
  t('Wг при гололёде (п. 2.5.43): округление и минимум 200 Па до 20 кВ', function(){
    eq(CL.windIce(650, 10).value, 200, '650 Па, 10 кВ'); eq(CL.windIce(1000, 110).value, 280, '1000 Па → 250 → 280');
    eq(CL.windIce(1500, 110).value, 360, '1500 → 375 → ближайшее кратное 40 = 360'); eq(CL.windIce(400, 0.4).value, 200, '0,4 кВ');
    eq(CL.windIce(800, 110).value, 200, '800 → 200 (110 кВ без минимума)');
    return '200 / 280 / 360 / 200 / 200';
  });
  t('Kw (табл. 2.5.2): интерполяция по высоте', function(){
    near(CL.kw(10, 'A'), 1.0); near(CL.kw(17.5, 'A'), 1.125); near(CL.kw(30, 'B'), 0.975); near(CL.kw(400, 'C'), 2.35);
    var ok = false; try { CL.kw(10, ''); } catch(e){ ok = e.blocked; } eq(ok, true, 'без типа местности — блок');
    return 'A 17,5 м → 1,125';
  });
  t('αw и Kl (п. 2.5.52), Kl = 1,0 для ВЛ до 1 кВ (п. 2.4.11)', function(){
    near(CL.alphaW(150), 1); near(CL.alphaW(260), 0.91); near(CL.alphaW(650), 0.70);
    near(CL.kl(40, 10), 1.2); near(CL.kl(75, 10), 1.15); near(CL.kl(300, 110), 1.0); near(CL.kl(40, 0.4), 1.0);
    return 'αw(260) = 0,91; Kl(75) = 1,15';
  });
  t('Ki, Kd (п. 2.5.49): до 25 м без поправок, выше — табл. 2.5.4', function(){
    var a = CL.kiKd(20, 30); eq(a.ki, 1); eq(a.kd, 1);
    var b = CL.kiKd(40, 20); near(b.ki, 1.5); near(b.kd, 0.9);
    return 'h 40 м: Ki 1,5; d 20 мм: Kd 0,9';
  });
  t('Коэффициенты надёжности: ВЛ 10 кВ, ВЛ 0,4 кВ с ОКСН, опоры', function(){
    var g1 = CL.gammas({ kv:10, iceRegion:'II', purpose:'wire' }); near(g1.gf_w, 1.1); near(g1.gf_i, 1.3); near(g1.gd, 0.5); near(g1.gng, 1.0);
    var g2 = CL.gammas({ kv:0.4, iceRegion:'III', purpose:'wire' }); near(g2.gng, 1.2); near(g2.gnw, 1.0); near(g2.gf_i, 1.6);
    var g3 = CL.gammas({ kv:10, iceRegion:'I', purpose:'support1' }); near(g3.gf_w, 1.3); near(g3.gd, 1.0); near(g3.gf_t, 1.3); near(g3.gf_g, 1.05);
    var g4 = CL.gammas({ kv:10, iceRegion:'I', purpose:'wire', multi:true }); near(g4.gnw, 1.1); near(g4.gng, 1.3);
    return 'пп. 2.4.11, 2.5.54, 2.5.55, 2.5.62, 2.5.65, 2.5.69, 2.5.70';
  });
  /* Контрольный пример 1 (ручной счёт): d = 10,5 мм, 90 кг/км, W0 = 650 Па, bэ = 15 мм, тип A, h = 5 м, L = 40 м, 10 кВ, район II
     Pг = π·15·(10,5+15)·0,9·9,8·10⁻³ = 10,5986 Н/м; p2 = 10,5986·1,3·0,5 = 6,8891
     P(ветер) = 0,70·1,2·1,0·1,2·650·10,5·10⁻³ = 6,8796; p4 = 7,5676
     P(ветер при гололёде) = 1·1,2·1·1,2·200·40,5·10⁻³ = 11,664; p5 = 12,8304 */
  t('Контрольный пример 1: нагрузки на кабель, ВЛ 10 кВ', function(){
    var l = CL.loads({ d_mm:10.5, mass_kg_km:90 }, { W0:650, bE:15, terrain:'A', kv:10, h:5, L:40, iceRegion:'II', purpose:'wire' });
    near(l.p1, 0.09 * 9.80665, 1e-6, 'p1'); near(l.p2n, Math.PI * 15 * 25.5 * 0.9 * 9.8e-3, 1e-6, 'Pг');
    near(l.p2, 6.8891, 1e-3, 'p2'); near(l.p4n, 6.8796, 1e-3, 'P ветер'); near(l.p4, 7.5676, 1e-3, 'p4');
    near(l.Wg, 200, 0, 'Wг'); near(l.p5n, 11.664, 1e-3, 'P гол.+ветер'); near(l.p5, 12.8304, 1e-3, 'p5');
    near(l.p7, Math.sqrt(Math.pow(l.p1 + l.p2, 2) + Math.pow(l.p5, 2)), 1e-9, 'p7');
    return 'p2 = 6,889; p4 = 7,568; p5 = 12,830 Н/м';
  });
  /* Контрольный пример 2: тот же кабель на ВЛ 0,4 кВ, район III: γnг = 1,2, γf = 1,6, Kl = 1
     p2 = 10,5986·1,2·1,6·0,5 = 10,1747; p4 = 0,7·1·1·1,2·650·10,5·10⁻³·1,1 = 6,3063 */
  t('Контрольный пример 2: ВЛ 0,4 кВ с ОКСН (п. 2.4.11)', function(){
    var l = CL.loads({ d_mm:10.5, mass_kg_km:90 }, { W0:650, bE:15, terrain:'A', kv:0.4, h:5, L:40, iceRegion:'III', purpose:'wire' });
    near(l.p2, 10.1747, 1e-3, 'p2'); near(l.p4, 6.3063, 1e-3, 'p4'); near(l.kl, 1, 0, 'Kl');
    return 'p2 = 10,175; p4 = 6,306 Н/м';
  });
  /* Контрольный пример 3: СИП на ВЛ 0,4 кВ — Cx = 1,1; d = 30 мм, h = 20 м (Kw = 1,25 тип A) */
  t('Контрольный пример 3: СИП, Cx = 1,1, Kw при h = 20 м', function(){
    var l = CL.loads({ d_mm:30, mass_kg_km:600, isSip:true }, { W0:500, bE:10, terrain:'A', kv:0.4, h:20, L:30, iceRegion:'I', purpose:'wire' });
    near(l.kw, 1.25, 1e-9, 'Kw'); near(l.p4n, 0.71 * 1 * 1.25 * 1.1 * 500 * 30e-3, 1e-6, 'P ветер');
    return 'P = ' + l.p4n.toFixed(3) + ' Н/м';
  });
  t('Нет диаметра или типа местности — расчёт заблокирован', function(){
    var ok = 0;
    try { CL.loads({ d_mm:null, mass_kg_km:90 }, { W0:650, bE:15, terrain:'A', kv:10, h:5, L:40 }); } catch(e){ if (e.blocked) ok++; }
    try { CL.regimes({ tMax:40, tMin:null, tAvg:10 }); } catch(e){ if (e.blocked) ok++; }
    eq(ok, 2); return 'блок с перечнем данных';
  });
  t('Режимы п. 2.5.71 и температуры п. 2.5.51', function(){
    var r = CL.regimes({ tMax:40, tMin:-25, tAvg:10 });
    eq(r.length, 6); eq(r.filter(function(x){ return x.id === 'ice'; })[0].t, -5, 'гололёд');
    eq(CL.regimes({ tMax:30, tMin:-50, tAvg:-6 })[3].t, -10, 'tсг ≤ −5 → −10');
    eq(CL.regimes({ tMax:30, tMin:-40, tAvg:0, altitude:1500 })[3].t, -10, 'высота 1500 м');
    return '6 режимов';
  });
  t('Уравнение состояния: тождество и невязка', function(){
    var p = { EA:1.5e6, alpha:5e-6, L:50, g1:0.9, H1:600, t1:10, g2:0.9, t2:10 };
    near(CL.stateEq(p), 600, 1e-6, 'тот же режим');
    var q = { EA:1.5e6, alpha:5e-6, L:50, g1:0.9, H1:600, t1:10, g2:12, t2:-5 };
    var H = CL.stateEq(q);
    var lhs = H - q.EA * q.g2 * q.g2 * q.L * q.L / (24 * H * H);
    var rhs = q.H1 - q.EA * q.g1 * q.g1 * q.L * q.L / (24 * q.H1 * q.H1) - q.EA * q.alpha * (q.t2 - q.t1);
    near(lhs, rhs, 1e-6, 'невязка');
    eq(CL.stateEq({ EA:1.5e6, alpha:5e-6, L:50, g1:0.9, H1:600, t1:10, g2:0.9, t2:40 }) < 600, true, 'нагрев — тяжение падает');
    return 'H = ' + H.toFixed(1) + ' Н';
  });
  t('Стрела и приведённый пролёт', function(){
    near(CL.sag(1, 40, 200), 1, 1e-12, 'f = gL²/8H');
    near(CL.rulingSpan([30, 40, 50]), Math.sqrt((27000 + 64000 + 125000) / 120), 1e-9, 'Lпр');
    eq(CL.rulingSpan([]), null);
    return 'Lпр(30, 40, 50) = ' + CL.rulingSpan([30, 40, 50]).toFixed(2) + ' м';
  });
  t('Подбор тяжения: определяющий режим загружен на 100 %', function(){
    var l = CL.loads({ d_mm:10.5, mass_kg_km:90 }, { W0:650, bE:15, terrain:'A', kv:10, h:6, L:60, iceRegion:'II' });
    var s = CL.solveSection({ EA:1.5e6, alpha:5e-6, T_max:2700 }, l, CL.regimes({ tMax:40, tMin:-25, tAvg:10 }), 60);
    near(s.governing.ratio, 1, 1e-4, 'загрузка'); eq(s.ok, true);
    s.regimes.forEach(function(x){ if (x.ratio > 1 + 1e-6) throw new Error('режим ' + x.name + ' превышен'); });
    var s2 = CL.solveSection({ EA:1.5e6, alpha:5e-6, T_max:2700, H_install_avg:1500 }, l, CL.regimes({ tMax:40, tMin:-25, tAvg:10 }), 60);
    eq(s2.ok, false, 'чрезмерное монтажное тяжение выявлено');
    return 'H0 = ' + (s.H0 / 1000).toFixed(3) + ' кН';
  });
  t('Монтажная таблица: с ростом температуры стрела растёт', function(){
    var l = CL.loads({ d_mm:10.5, mass_kg_km:90 }, { W0:650, bE:15, terrain:'A', kv:10, h:6, L:45, iceRegion:'II' });
    var cab = { EA:1.5e6, alpha:5e-6, T_max:2700 };
    var s = CL.solveSection(cab, l, CL.regimes({ tMax:40, tMin:-25, tAvg:10 }), 45);
    var mt = CL.montageTable(cab, l, s, [40, 50], -25, 40, 5);
    eq(mt.length, 14, 'строк'); eq(mt[0].sags[1] < mt[13].sags[1], true, 'рост стрелы');
    eq(mt[0].sags[0] < mt[0].sags[1], true, 'длиннее пролёт — больше стрела');
    return mt.length + ' строк, шаг 5 °C';
  });
  t('Габарит до земли и расстояние до провода в пролёте', function(){
    var g = CL.groundClearance(5, 5, 1, 40); near(g.min, 4, 1e-9); near(g.x, 20, 1e-9);
    var g2 = CL.groundClearance(8, 6, 0.5, 50); near(g2.min, 6.0, 1e-9, 'перепад: наименьший габарит у нижней опоры');
    var dd = CL.spanDistance({ hA:7, hB:7, f:1.2 }, { hA:5.5, hB:5.5, f:0.6 }, 40); near(dd.min, 0.9, 1e-9);
    return 'габарит 4,0 м; расстояние 0,9 м';
  });
  t('Свободные интервалы на опоре', function(){
    var f = CL.freeIntervals({ topLimit:9, normWire:0.4, fixDist:0.3, hMinCable:5, items:[{ name:'СИП', h:7, kind:'wire' }, { name:'ОК-1', h:6, kind:'cable' }] });
    eq(f.free.length, 2); near(f.free[0][0], 5); near(f.free[0][1], 5.7); near(f.free[1][0], 6.3); near(f.free[1][1], 6.6);
    return '5,0–5,7 и 6,3–6,6 м';
  });
  t('Момент на промежуточную опору (ручной счёт)', function(){
    /* 3×(5 Н/м × 40 м × 7 м) + 7,5 Н/м × 40 м × 5,5 м = 4200 + 1650 = 5850 Н·м;
       стойка 0,2 × 8 м, тип A: Kw(4 м) = 1; Q = 1·650·0,7·1,6·1,8·1,3 = 1703,52 Н; M = Q·4 = 6814,08 */
    var m = CL.poleMoment({ mark:'П', scheme:'промежуточная', m_adm:20, kState:1, windSpan:40, stand:{ width_m:0.2, height_m:8 } },
      [{ name:'провод', h:7, pw:5, n:3 }, { name:'ОК', h:5.5, pw:7.5, n:1 }], { W0:650, terrain:'A' });
    near(m.M, 5850 + 6814.08, 1e-6, 'M'); eq(m.ok, true); eq(m.tensioned, false);
    var m2 = CL.poleMoment({ mark:'П', scheme:'промежуточная', m_adm:20, kState:0.8, windSpan:40, stand:{ width_m:0.2, height_m:8 } },
      [{ name:'провод', h:7, pw:5, n:3 }], { W0:650, terrain:'A' });
    near(m2.Madm, 16000, 1e-9, 'k = 0,8');
    return 'M = ' + (m.M / 1000).toFixed(3) + ' кН·м';
  });
  t('Момент на угловую опору: 2·sin(α/2); без угла — блок', function(){
    var m = CL.poleMoment({ scheme:'угловая', m_adm:20, angle:60, windSpan:40, stand:{ width_m:0.2, height_m:8 } }, [{ name:'ОК', h:6, pw:0, T:1000 }], { W0:650, terrain:'A' });
    near(m.M - 6814.08 * (8 * 0.2 * 650 * 0.7 * 1.8 * 1.3 * 4 / 6814.08) , 1000 * 1 * 6, 1e-6, 'тяжение');
    var m2 = CL.poleMoment({ scheme:'угловая', m_adm:20, windSpan:40, stand:{ width_m:0.2, height_m:8 } }, [{ name:'ОК', h:6, pw:0, T:1000 }], { W0:650, terrain:'A' });
    eq(m2.ok, false); eq(m2.blocked.length, 1);
    return '2·sin 30° = 1';
  });
  t('Нет геометрии стойки — результат не выпускается', function(){
    var m = CL.poleMoment({ scheme:'промежуточная', m_adm:20, windSpan:40, stand:null }, [{ name:'ОК', h:6, pw:1 }], { W0:650, terrain:'A' });
    eq(m.ok, false); eq(/стойки/.test(m.blocked[0]), true); return 'блок';
  });
  t('Длина кабеля с запасами и аварийным запасом', function(){
    var r0 = CL.cableLength({ spansSum:1000, sagFactor:1.02, drops:20, reserves:30, splicing:6, emergencyShare:0.05 });
    near(r0.value, 1020 + 56 + 50, 1e-9); return r0.value + ' м';
  });
}
var DS = window.PDRD_DESIGN;
if (DS && IM) {
  var v25 = window.__v25;
  t('Расчёт проекта: анкерные участки по неориентированному графу', function(){
    var o = v25(function(o){
      o.poles = [
        { line:'Л', num:'1', kv:'10', mark:'А10-1', lat:45, lon:38, span:'50', nextRef:'2' },
        { line:'Л', num:'2', kv:'10', mark:'П10-1', lat:45.00045, lon:38, span:'50', prevRef:'1', nextRef:'3' },
        { line:'Л', num:'3', kv:'10', mark:'П10-1', lat:45.0009, lon:38, span:'', prevRef:'4' },
        { line:'Л', num:'4', kv:'10', mark:'А10-1', lat:45.00135, lon:38, span:'50', nextRef:'3' }
      ];
    });
    var r0 = IM.toProject(IM.fromV25Object(o), P.blank());
    r0.project.poles.forEach(function(p){ p.fromReport.forEach(function(x){ x.prev = x.prev; }); });
    /* пролёты «до пред.» V25 не хранит — восполним для графа */
    r0.project.poles[2].fromReport[0].span_prev_m = 50;
    var s = DS.sections(r0.project);
    eq(s.length, 1, 'участков'); eq(s[0].spans.length, 3, 'пролётов'); near(s[0].Lr, 50, 1e-9);
    return '1 участок из 3 пролётов, направления обхода разные';
  });
  t('Расчёт проекта: без исходных данных всё заблокировано, аварийная — под замену', function(){
    var r0 = IM.toProject(IM.fromV25Object(v25()), P.blank());
    var res2 = DS.run(r0.project);
    eq(res2.summary.ok, 0, 'обоснованных'); eq(res2.summary.replace, 1, 'опор под замену');
    eq(Object.keys(res2.missing).length > 0, true, 'перечень данных');
    return res2.summary.blocked + ' заблокировано';
  });
}

/* ---------------------------------------------------------- решения */
var DC = window.PDRD_DECIDE;
if (DC && IM) {
  var v25d = window.__v25;
  function proj(mod){ var r0 = IM.toProject(IM.fromV25Object(v25d(mod)), P.blank()); return r0.project; }
  t('Решения: аварийная опора — «после восстановления», без марки — не «размещать» молча', function(){
    var d0 = proj(); DC.propose(d0);
    var av = d0.poles.filter(function(p){ return /Аварийн/.test(p.state); })[0];
    eq(av.design.decision, 'after', 'аварийная');
    return 'после восстановления владельцем';
  });
  t('Решения: ручное решение не перезаписывается', function(){
    var d0 = proj(); DC.propose(d0);
    d0.poles[0].design.decision = 'bypass'; d0.poles[0].design.by = 'проектировщик';
    var r1 = DC.propose(d0); eq(d0.poles[0].design.decision, 'bypass'); eq(r1.kept, 1);
    DC.propose(d0, { overwrite:true }); eq(d0.poles[0].design.by, 'авто', 'перезапись по флагу');
    return 'сохранено';
  });
  t('Решения: линия вне трассы — обход', function(){
    var d0 = proj(); d0.lines.forEach(function(l){ l.cable = false; }); DC.propose(d0);
    eq(d0.poles.every(function(p){ return p.design.decision === 'bypass'; }), true); return 'все — обход';
  });
  t('Решения: «размещать» на аварийной опоре — блок (135-ФЗ)', function(){
    var d0 = proj(); DC.propose(d0);
    var av = d0.poles.filter(function(p){ return /Аварийн/.test(p.state); })[0];
    av.design.decision = 'place'; av.design.by = 'проектировщик';
    eq(DC.check(d0).some(function(x){ return x.lv === 'stop' && /без технологической возможности/.test(x.text); }), true);
    return 'блок';
  });
  t('Решения: интервал высот — провод 7 м, норма 0,4 м, габарит 5 м + стрела', function(){
    var d0 = proj(); d0.wiresByKv = { '0,4':[{ mark:'СИП-2', h_m:7 }] };
    d0.calcResult = { poles:[], spans:[{ line:'ВЛ 0,4 Л-1', from:'1', to:'2', fmax:0.8 }] };
    var p = d0.poles.filter(function(x){ return x.lines.some(function(l){ return l.lineId === 'ВЛ 0,4 Л-1' && l.num === '1'; }); })[0];
    var hw = DC.heightWindow(d0, p, DC.poleInfo(d0)[p.id], DC.params(d0));
    eq(hw.ok, true); near(hw.free[0][0], 5.8, 1e-9, 'низ'); near(hw.free[0][1], 6.6, 1e-9, 'верх');
    return '5,8…6,6 м';
  });
  t('Решения: нет места на опоре — промежуточная опора', function(){
    var d0 = proj(); d0.wiresByKv = { '0,4':[{ mark:'СИП-2', h_m:5.3 }] };
    d0.calcResult = { poles:[], spans:[] }; DC.propose(d0);
    var p = d0.poles.filter(function(x){ return x.mark === 'П8-1' && !/Аварийн/.test(x.state); })[0];
    eq(p.design.decision, 'extra'); eq(p.design.why.some(function(w){ return /нет свободного/.test(w); }), true);
    return 'Е.1';
  });
  t('Муфты: ручной режим — программа их не расставляет', function(){
    var d0 = proj(); d0.wiresByKv = { '0,4':[{ mark:'СИП', h_m:7 }] }; d0.decideParams = { reserveT_m:15 };
    DC.propose(d0);
    eq(d0.poles.filter(function(p){ return p.design.sleeve; }).length, 0, 'муфт нет');
    eq(DC.check(d0).some(function(x){ return x.lv === 'stop' && /Муфты и запасы кабеля не назначены/.test(x.text); }), true, 'требуется указать');
    var id = d0.poles[0].id;
    DC.setSleeve(d0, id, true, { type:'разветвительная' });
    var p0 = d0.poles.filter(function(x){ return x.id === id; })[0];
    eq(p0.design.sleeve, true, 'назначена'); eq(p0.design.node, 'С', 'узел'); eq(p0.design.reserve_m, 15, 'запас'); eq(p0.design.by, 'проектировщик', 'ручное');
    DC.propose(d0);
    eq(d0.poles.filter(function(x){ return x.id === id; })[0].design.sleeve, true, 'сохранена при пересчёте');
    DC.setSleeve(d0, id, false);
    eq(d0.poles.filter(function(x){ return x.id === id; })[0].design.sleeve, false, 'снята');
    return 'ручное назначение';
  });
  t('Муфты: автоматический режим расставляет их сам', function(){
    var d0 = window.PDRD_DEMO.build();
    d0.poles.forEach(function(p){ if (p.design) { p.design.sleeve = false; p.design.by = 'авто'; } });
    d0.decideParams.sleeveMode = 'auto';
    DC.propose(d0);
    eq(d0.poles.filter(function(p){ return p.design.sleeve; }).length > 0, true);
    return d0.poles.filter(function(p){ return p.design.sleeve; }).length + ' муфт';
  });
  t('Решения: муфты на смежных промежуточных опорах — блок (ТТ № 282р)', function(){
    var o = function(o){ o.poles = [
      { line:'Л', num:'1', kv:'0,4', mark:'П8-1', lat:45, lon:38, span:'30', nextRef:'2' },
      { line:'Л', num:'2', kv:'0,4', mark:'П8-1', lat:45.0003, lon:38, span:'30', prevRef:'1', nextRef:'3' },
      { line:'Л', num:'3', kv:'0,4', mark:'П8-1', lat:45.0006, lon:38, span:'', prevRef:'2' }]; };
    var d0 = proj(o); d0.wiresByKv = { '0,4':[{ mark:'СИП', h_m:7 }] }; d0.decideParams = { reserveT_m:15 };
    DC.propose(d0);
    d0.poles[0].design.sleeve = true; d0.poles[0].design.reserve_m = 15; d0.poles[0].design.decision = 'place';
    d0.poles[1].design.sleeve = true; d0.poles[1].design.reserve_m = 15; d0.poles[1].design.decision = 'place';
    eq(DC.check(d0).some(function(x){ return x.lv === 'stop' && /смежных промежуточных/.test(x.text); }), true);
    return 'выявлено';
  });
  t('Решения: запас не задан профилем Ростелеком — блок', function(){
    var d0 = proj(); DC.propose(d0);
    eq(DC.check(d0).some(function(x){ return /технологического запаса/.test(x.text) && x.lv === 'stop'; }), true);
    d0.decideParams = { reserveT_m:15 };
    eq(DC.check(d0).some(function(x){ return /технологического запаса/.test(x.text); }), false);
    return 'требуется ввод';
  });
  t('Решения: гасители с заданной длины пролёта', function(){
    var d0 = proj(); d0.decideParams = { dampersFromSpan_m:50 }; d0.wiresByKv = { '0,4':[{ mark:'СИП', h_m:7 }], '10':[{ mark:'АС 35', h_m:8 }] };
    DC.propose(d0);
    var p = d0.poles.filter(function(x){ return x.mark === 'П10-1'; })[0];
    eq(p.design.dampers, true, 'пролёт 50 м'); return 'на пролётах ≥ 50 м';
  });
  t('Ведомость опор и Е.1 в документе', function(){
    var d0 = proj(); DC.propose(d0);
    var dd = window.PDRD_DOCX.dataFromProject(d0, window.PDRD_DOCX.TEMPLATES[2]);
    eq(dd.tables['ОПОРЫ'].rows.length, d0.poles.length, 'строк'); eq(!!dd.tables['Е1'], true, 'Е.1');
    return dd.tables['ОПОРЫ'].rows.length + ' опор';
  });
}

/* ---------------------------------------------------------- комплект: демо-проект */
var DM = window.PDRD_DEMO;
if (DM && window.PDRD_SPEC && window.PDRD_SVG && window.PDRD_AUDIT) {
  var demo = null;
  t('Демо-проект: импорт → расчёт → решения', function(){
    demo = DM.build();
    eq(demo.poles.length, 31, 'опор'); eq(demo.calcResult.summary.blocked, 0, 'без пробелов данных');
    eq(demo.poles.every(function(p){ return p.design && p.design.decision; }), true, 'решения');
    return JSON.stringify(demo.calcResult.summary);
  });
  t('Итерация: после уточнения высот нормы пролётов обеспечены или закрыты мероприятием', function(){
    var bad = PDRD_AUDIT.run(demo).filter(function(x){ return x.lv === 'stop' && /Пролёт/.test(x.text); });
    eq(bad.length, 0); return 'нарушений пролётов без мероприятий нет';
  });
  t('Длина трассы: учитываются пролёты по ссылкам «пред.» и «след.»', function(){
    var d0 = DM.build();
    var byNum = {}; d0.poles.forEach(function(p){ (p.fromReport || []).forEach(function(r){ byNum[r.line_id + '|' + r.num] = r; }); });
    var full = PDRD_SPEC.lengths(d0).route_m;
    /* убираем ссылку «след.» у одной опоры — пролёт должен сохраниться по обратной ссылке */
    Object.keys(byNum).some(function(k){ var r = byNum[k]; if (r.next && r.span_next_m) { r.next = ''; return true; } return false; });
    eq(PDRD_SPEC.lengths(d0).route_m, full, 'длина не потеряна');
    return full + ' м';
  });
  t('Справочник филиала: добавленные опоры и кабели доступны расчёту', function(){
    var R = window.PDRD_REFS_V25;
    eq(!!R.poleByMark('УА23'), true, 'УА23'); eq(!!R.poleByMark('П10/0,38'), true, 'совместная опора');
    eq(R.poleByMark('А23').m_adm, 20, 'допустимый момент'); eq(R.poleByMark('ПР1').lgab, 70, 'габаритный пролёт');
    eq(!!R.cableByMark('ОКМС-32'), true, 'кабель из справочника');
    eq(R.branchAdded.poles >= 15, true, 'опоры филиала добавлены');
    return R.branchAdded.poles + ' опор, ' + R.branchAdded.cables + ' кабелей';
  });
  t('Аварийная опора: расчёт на новую опору и «установка после замены»', function(){
    var r = demo.calcResult.poles.filter(function(p){ return p.replace; });
    eq(r.length > 0, true, 'есть опоры под замену');
    eq(r.every(function(p){ return typeof p.M === 'number' && p.M > 0; }), true, 'момент посчитан');
    eq(r.every(function(p){ return p.status !== 'excluded'; }), true, 'опора не исключается');
    var dd = PDRD_DOCX.dataFromProject(demo, PDRD_DOCX.TEMPLATES.filter(function(x){ return x.code === 'ТКР'; })[0]);
    eq(dd.tables['НАГРУЗКИ'].rows.some(function(x){ return /установка после замены/.test(x[4]); }), true, 'отметка в ведомости нагрузок');
    return r.length + ' опор';
  });
  t('Спецификация: узлы, талрепы, звенья, лента и скрепы', function(){
    var sp = PDRD_SPEC.build(demo), by = {};
    sp.items.forEach(function(x){ by[x.key] = x; });
    var t2 = PDRD_DECIDE.totals(demo);
    eq(by.node_susp.qty, t2.nodes['П'] || 0, 'узлы поддерживающие = зажимы поддерживающие');
    eq(by.clamp_susp.qty, by.node_susp.qty, 'зажим и узел работают в паре');
    eq(!!by.turnbuckle && by.turnbuckle.qty > 0, true, 'талрепы');
    eq(!!by.link && by.link.qty === by.turnbuckle.qty, true, 'промежуточные звенья');
    eq(!!by.node_tens && by.node_tens.qty === by.clamp_tens.qty, true, 'натяжные узлы');
    eq(!!by.band && by.band.qty > 0, true, 'лента крепёжная');
    eq(by.buckle.qty, sp.brackets * PDRD_SPEC.specParams(demo).bucklesPerBracket, 'скрепы по кронштейнам');
    eq(!!by.sleeve_holder && !!by.reserve_holder, true, 'устройства для муфты и запаса');
    return sp.items.length + ' позиций';
  });
  t('Спецификация: тип и марка берутся из каталога проекта', function(){
    var d0 = window.PDRD_DEMO.build();
    eq(PDRD_SPEC.build(d0).needType, 0, 'в демо марки заполнены');
    d0.specCatalog.turnbuckle = {};
    eq(PDRD_SPEC.build(d0).needType > 0, true, 'пустая марка выявляется');
    eq(PDRD_AUDIT.run(d0).some(function(x){ return x.lv === 'stop' && /тип и марка/.test(x.text); }), true, 'выпуск заблокирован');
    return 'каталог проверяется';
  });
  t('Одностоечная опора с муфтой усиливается подкосом', function(){
    var t2 = PDRD_DECIDE.totals(demo);
    eq(t2.reinforce > 0, true, 'усиление предусмотрено');
    var sp = PDRD_SPEC.build(demo);
    eq(sp.items.some(function(x){ return x.key === 'strut' && x.qty === t2.reinforce; }), true, 'подкос в спецификации');
    eq(PDRD_SPEC.bor(demo, sp).some(function(x){ return /подкос/i.test(x.name); }), true, 'работа в ВОР');
    var dd = PDRD_DOCX.dataFromProject(demo, PDRD_DOCX.TEMPLATES[0]);
    eq(dd.tables['Е1'].rows.some(function(x){ return /подкос/i.test(x[1]); }), true, 'мероприятие Е.1');
    return t2.reinforce + ' опор';
  });
  t('Ведомость пролётов заполняется', function(){
    var dd = PDRD_DOCX.dataFromProject(demo, PDRD_DOCX.TEMPLATES.filter(function(x){ return x.code === 'ЛКС'; })[0]);
    eq(dd.tables['ПРОЛЁТЫ'].rows.length > 0, true, 'строки есть');
    var d0 = window.PDRD_DEMO.build();
    d0.calcResult.spans = [];
    var dd2 = PDRD_DOCX.dataFromProject(d0, PDRD_DOCX.TEMPLATES.filter(function(x){ return x.code === 'ЛКС'; })[0]);
    eq(dd2.tables['ПРОЛЁТЫ'].rows.length > 0, true, 'при отсутствии расчёта выводятся пролёты трассы');
    return dd.tables['ПРОЛЁТЫ'].rows.length + ' пролётов';
  });
  t('Спецификация: кабель ≥ трассы × k + запасы, бирки = узлы', function(){
    var sp = PDRD_SPEC.build(demo), L = sp.lengths;
    eq(L.total_m >= Math.floor(L.route_m * 1.02 + L.reserves_m), true, 'длина');
    var nodes = Object.keys(sp.totals.nodes).reduce(function(a, k){ return a + sp.totals.nodes[k]; }, 0);
    eq(sp.items.filter(function(x){ return x.key === 'tag'; })[0].qty, nodes, 'бирки');
    eq(sp.items.filter(function(x){ return x.key === 'clamp_tens'; })[0].qty, 2 * (sp.totals.nodes['А2'] || 0) + (sp.totals.nodes['А1'] || 0) + 3 * (sp.totals.nodes['АО'] || 0) + 2 * (sp.totals.nodes['С'] || 0), 'натяжные');
    return L.total_m + ' м кабеля';
  });
  t('ВОР согласована со спецификацией', function(){
    var sp = PDRD_SPEC.build(demo), b = PDRD_SPEC.bor(demo, sp);
    var km = b.filter(function(x){ return /Подвеска/.test(x.name); })[0].qty;
    near(km * 1000, sp.lengths.route_m, 1, 'км трассы');
    return b.length + ' позиций';
  });
  t('Чертежи: рамка, штамп, утверждающий, номера листов', function(){
    var sh = PDRD_SVG.sheets(demo);
    eq(sh.length >= 8, true, 'листов');
    sh.forEach(function(s, i){ eq(s.meta.num, i + 1, 'номер'); if (!s.p.some(function(e){ return e.l === 'ШТАМП'; })) throw new Error('нет штампа на листе ' + (i + 1)); });
    eq(sh[0].p.some(function(e){ return e.t === 'text' && /Чепусов/.test(e.s); }), true, 'утверждающий в штампе');
    eq(sh[0].p.some(function(e){ return e.t === 'text' && e.s === 'Утв.'; }), true, 'строка «Утв.»');
    var svg = PDRD_SVG.toSvg(sh[0]); eq(/^<svg[\s\S]*<\/svg>$/.test(svg), true, 'SVG');
    return sh.length + ' листов';
  });
  t('Чертежи: ничего не выходит за рамку, шрифт не мельче 2,5 мм', function(){
    var sh = PDRD_SVG.sheets(demo), W = PDRD_SVG.W, H = PDRD_SVG.H;
    sh.forEach(function(s){
      s.p.forEach(function(e){
        if (e.t === 'text' && e.h < 2.49) throw new Error('лист ' + s.meta.num + ': шрифт ' + e.h + ' мм');
        if (e.l === 'ШТАМП' || e.l === 'РАМКА') return;   /* графы поля подшивки — вне рамки по ГОСТ */
        var b = PDRD_SVG.bbox([e]); if (!b) return;
        if (b.x < 4.9 || b.y < 4.4 || b.x + b.w > W - 4.9 || b.y + b.h > H - 4.4) throw new Error('лист ' + s.meta.num + ': за рамкой (' + (e.s || e.t) + ')');
      });
    });
    return 'проверено ' + sh.length + ' листов';
  });
  t('Чертежи: примечания — над штампом справа снизу', function(){
    var sh = PDRD_SVG.sheets(demo).filter(function(s){ return s.notes.length; })[0];
    eq(!!sh, true, 'есть лист с примечаниями');
    var n = sh.p.filter(function(e){ return e.t === 'text' && e.s === 'Примечания:'; })[0];
    eq(!!n, true, 'заголовок примечаний');
    eq(n.x + 250 >= PDRD_SVG.W - 20, true, 'блок прижат к правому краю');
    eq(n.y > PDRD_SVG.H / 2, true, 'снизу');
    return 'блок примечаний на месте';
  });
  t('Чертежи: заполнение листа не менее 70 % (схемы и таблицы)', function(){
    var sh = PDRD_SVG.sheets(demo).filter(function(s){ return s.meta.kind !== 'plan'; });
    sh.forEach(function(s){ if ((s.meta.fill || 0) < 70) throw new Error('лист ' + s.meta.num + ': заполнение ' + s.meta.fill + ' %'); });
    return sh.length + ' листов ≥ 70 %';
  });
  t('Штамп: только фамилии подписантов', function(){
    var sh = PDRD_SVG.sheets(demo)[0];
    var st = sh.p.filter(function(e){ return e.l === 'ШТАМП' && e.t === 'text'; }).map(function(e){ return e.s; });
    eq(st.indexOf('Куличкин') >= 0, true, 'ГИП'); eq(st.indexOf('Чепусов') >= 0, true, 'утверждающий');
    eq(st.some(function(s){ return /Е\.В\.|И\.И\.|А\.В\./.test(s); }), false, 'инициалов нет');
    eq(st.some(function(s){ return /…/.test(s); }), false, 'ничего не обрезано');
    return 'фамилии';
  });
  t('Подписи опор на плане не лежат на линии трассы', function(){
    var pl = PDRD_SVG.sheets(demo).filter(function(s){ return s.meta.kind === 'plan'; })[0];
    var lines = pl.p.filter(function(e){ return e.t === 'line' && (e.l === 'ВОЛС' || e.l === 'ВЛ_ПРОВОДА'); });
    var labels = pl.p.filter(function(e){ return e.t === 'text' && /^[\d\-\/]+$/.test(e.s); });
    eq(labels.length > 0, true, 'подписи есть');
    labels.forEach(function(e){
      lines.forEach(function(l){
        var vx = l.x2 - l.x1, vy = l.y2 - l.y1, L2 = vx * vx + vy * vy;
        var tx = e.x - l.x1, ty = e.y - 0.9 - l.y1;
        var u = L2 ? Math.max(0, Math.min(1, (tx * vx + ty * vy) / L2)) : 0;
        var dx = tx - u * vx, dy = ty - u * vy;
        if (Math.sqrt(dx * dx + dy * dy) < 1.2) throw new Error('подпись ' + e.s + ' на линии');
      });
    });
    return labels.length + ' подписей в стороне от линии';
  });
  t('Условные обозначения опор: подкосы вниз, анкерная — два, концевая — один', function(){
    var SV = PDRD_SVG, sh = new SV.Sheet({});
    function braces(scheme){
      var s2 = new SV.Sheet({});
      var before = s2.p.length;
      SV.poleSymbol(s2, 50, 10, 40, scheme);
      return s2.p.filter(function(e){ return e.t === 'line' && Math.abs(e.x2 - e.x1) > 1 && Math.abs(e.y2 - e.y1) > 1; });
    }
    var ank = braces('анкерная'), konc = braces('концевая'), otv = braces('ответвительная'), prom = braces('промежуточная');
    eq(ank.length, 2, 'анкерная'); eq(konc.length, 1, 'концевая'); eq(otv.length, 2, 'ответвительная'); eq(prom.length, 0, 'промежуточная');
    [].concat(ank, konc, otv).forEach(function(e){ if (!(e.y2 > e.y1)) throw new Error('подкос направлен вверх'); });
    return 'проверено';
  });
  t('Подложка: файл привязки .wld соответствует размещению растра', function(){
    var e = { x: 30, y: 20, w: 200, h: 100, pxW: 2000, pxH: 1000 };
    var w = PDRD_MAP.worldFile(e, 297, e.pxW, e.pxH).split(/\r?\n/).map(Number);
    near(w[0], 0.1, 1e-9, 'размер пикселя по X'); near(w[3], -0.1, 1e-9, 'по Y');
    near(w[4], 30.05, 1e-9, 'X центра первого пикселя');
    near(w[5], 277 - 0.05, 1e-9, 'Y центра первого пикселя');
    return 'привязка верна';
  });
  t('Топооснова OSM: разбор данных и классификация', function(){
    var O = window.PDRD_OSM;
    eq(/way\["highway"\]/.test(O.query({ n:45.31, s:45.29, e:39.11, w:39.09 })), true, 'запрос дорог');
    eq(O.classify({ highway:'residential', name:'ул. Ленина' }).kind, 'road', 'дорога');
    eq(O.classify({ building:'house', 'addr:housenumber':'12' }).label, '12', 'номер дома');
    eq(O.classify({ waterway:'river', name:'Кирпили' }).kind, 'water', 'река');
    eq(O.classify({ railway:'rail' }).kind, 'rail', 'железная дорога');
    eq(O.classify({ amenity:'bench' }), null, 'лишнее отбрасывается');
    var f = O.parse({ elements: [
      { geometry:[{ lat:45, lon:39 }, { lat:45.001, lon:39.001 }], tags:{ highway:'primary', name:'А-146' } },
      { geometry:[{ lat:45, lon:39 }, { lat:45, lon:39.0002 }, { lat:45.0002, lon:39.0002 }, { lat:45, lon:39 }], tags:{ building:'yes', 'addr:housenumber':'7' } },
      { geometry:[{ lat:45, lon:39 }], tags:{ highway:'track' } } ] });
    eq(f.length, 2, 'разобрано объектов'); eq(f[1].closed, true, 'здание замкнуто');
    return 'дороги, здания, вода, ж/д';
  });
  t('Топооснова на плане: линии на слоях КАРТА_* и подписи улиц', function(){
    var d0 = window.PDRD_DEMO.build();
    var feats = [];
    for (var i = 0; i < 6; i++) feats.push({ kind:'road', label:'ул. Проверочная ' + (i + 1), w:0.5, closed:false,
      pts:[[45.2995 + i * 0.0008, 39.0975], [45.2995 + i * 0.0008, 39.1045]] });
    feats.push({ kind:'water', label:'р. Проверочная', w:0.6, closed:false, pts:[[45.295, 39.095], [45.302, 39.100], [45.309, 39.104]] });
    feats.push({ kind:'building', label:'15', w:0.25, closed:true, pts:[[45.3005, 39.0995], [45.3005, 39.0997], [45.3007, 39.0997], [45.3005, 39.0995]] });
    d0.mapVector = { features: feats, counts: { road:6, water:1, building:1 }, attr:'© OpenStreetMap contributors (ODbL)' };
    PDRD_SVG.reset(d0);
    var pl = PDRD_SVG.sheets(d0).filter(function(s){ return s.meta.kind === 'plan'; })[0];
    eq(pl.p.some(function(e){ return e.l === 'КАРТА_ДОРОГИ'; }), true, 'дороги');
    eq(pl.p.some(function(e){ return e.l === 'КАРТА_ВОДА'; }), true, 'вода');
    eq(pl.p.some(function(e){ return e.t === 'text' && e.l === 'КАРТА_ПОДПИСИ' && /Проверочная/.test(e.s); }), true, 'подписи улиц');
    eq(pl.notes.some(function(n){ return /OpenStreetMap/.test(n); }), true, 'ссылка на источник');
    var dxf = PDRD_DXF.parse(PDRD_DXF.toDxf(pl));
    eq(dxf.layers.indexOf('КАРТА_ДОРОГИ') >= 0 && dxf.layers.indexOf('КАРТА_ПОДПИСИ') >= 0, true, 'слои в DXF');
    return 'основа в SVG и DXF';
  });
  t('Карта: источники и проекции (EPSG:3857 и EPSG:3395)', function(){
    var ids = PDRD_MAP.SOURCES.map(function(s){ return s.id; });
    ['yandex-map','yandex-sat','yandex-hyb','google-map','google-sat','google-hyb','osm','custom'].forEach(function(id){
      if (ids.indexOf(id) < 0) throw new Error('нет источника ' + id);
    });
    var yg = PDRD_MAP.lat2y(45.3, 16, 'google'), yy = PDRD_MAP.lat2y(45.3, 16, 'yandex');
    eq(Math.abs(yg - yy) > 10, true, 'проекции различаются');
    near(PDRD_MAP.y2lat(yy, 16, 'yandex'), 45.3, 1e-6, 'обратное преобразование Яндекса');
    near(PDRD_MAP.y2lat(yg, 16, 'google'), 45.3, 1e-6, 'обратное преобразование Google');
    eq(PDRD_MAP.byId('yandex-hyb').layers.length, 2, 'гибрид — два слоя');
    return 'источников: ' + ids.length;
  });
  t('Карта: перечень тайлов на трассу и их привязка', function(){
    var p = PDRD_MAP.plan(PDRD_MAP.routeBbox(demo), { source:'osm', maxZoom:16 });
    eq(p.tiles.length > 0, true, 'тайлы'); eq(p.z <= 16, true, 'уровень');
    var t0 = p.tiles[0];
    eq(t0.nw.lat > t0.se.lat && t0.se.lon > t0.nw.lon, true, 'углы тайла');
    eq(/16\/\d+\/\d+/.test(t0.url), true, 'адрес тайла');
    var g = PDRD_MAP.plan(PDRD_MAP.routeBbox(demo), { source:'google-hyb', maxZoom:16 });
    eq(/mt[0-3]\.google/.test(g.tiles[0].url), true, 'поддомены Google');
    return p.tiles.length + ' тайлов';
  });
  t('Подложка из тайлов: на план попадают все тайлы с обрезкой по рамке', function(){
    var d0 = window.PDRD_DEMO.build();
    var p = PDRD_MAP.plan(PDRD_MAP.routeBbox(d0), { source:'yandex-map', maxZoom:16 });
    d0.mapUnderlay = { mode:'tiles', tiles: p.tiles.map(function(x){ return { url:x.url, nw:x.nw, se:x.se }; }), nw:p.nw, se:p.se, attr:'© Яндекс.Карты' };
    PDRD_SVG.reset(d0);
    var pl = PDRD_SVG.sheets(d0).filter(function(s){ return s.meta.kind === 'plan'; });
    eq(pl.length > 0, true, 'планы');
    var im = pl[0].p.filter(function(e){ return e.t === 'image'; });
    eq(im.length > 0, true, 'тайлы на листе');
    eq(im.every(function(e){ return e.remote && e.clip; }), true, 'ссылки с обрезкой');
    eq(PDRD_MAP.hasRemote(pl[0]), true, 'признак внешних тайлов');
    eq(pl[0].notes.some(function(n){ return /Яндекс/.test(n); }), true, 'ссылка на источник в примечаниях');
    return im.length + ' тайлов на листе';
  });
  t('Подложка-растр: попадает в лист и в файл привязки', function(){
    var d0 = window.PDRD_DEMO.build();
    var px = 'data:image/png;base64,iVBORw0KGgo=';
    d0.mapUnderlay = { mode:'image', dataUrl: px, nw:{ lat:45.32, lon:39.09 }, se:{ lat:45.28, lon:39.12 }, attr:'© OpenStreetMap contributors (ODbL)', name:'Карта' };
    PDRD_SVG.reset(d0);
    var pl = PDRD_SVG.sheets(d0).filter(function(s){ return s.meta.kind === 'plan'; })[0];
    var im = PDRD_MAP.imageOf(pl);
    eq(!!im, true, 'растр на листе'); eq(im.remote, false, 'локальный растр');
    eq(PDRD_MAP.worldFile(im, PDRD_SVG.H, 1000, 1000).split(/\r?\n/).length >= 6, true, 'файл привязки');
    return 'ок';
  });
  t('Карта: выбор масштабного уровня и рамка трассы', function(){
    var bb = PDRD_MAP.routeBbox(demo);
    eq(bb.n > bb.s && bb.e > bb.w, true, 'рамка');
    var z = 18, x0 = PDRD_MAP.lon2x(bb.w, z), x1 = PDRD_MAP.lon2x(bb.e, z);
    eq(x1 > x0, true, 'тайловые координаты');
    near(PDRD_MAP.x2lon(PDRD_MAP.lon2x(39.1, 15), 15), 39.1, 1e-6, 'обратное преобразование');
    near(PDRD_MAP.y2lat(PDRD_MAP.lat2y(45.3, 15), 15), 45.3, 1e-6, 'широта');
    return 'преобразования верны';
  });
  t('Чертежи: анкерные опоры показаны с подкосами', function(){
    var route = PDRD_SVG.sheets(demo).filter(function(s){ return s.meta.kind === 'route'; })[0];
    eq(!!route, true, 'лист размещения');
    var diag = route.p.filter(function(e){ return e.t === 'line' && e.l === 'ВЛ_ОПОРЫ' && Math.abs(e.x2 - e.x1) > 0.5 && Math.abs(e.y2 - e.y1) > 0.5; });
    eq(diag.length > 0, true, 'подкосы есть');
    return diag.length + ' подкосов';
  });
  t('Ситуационный план: координатная сетка и масштаб', function(){
    var pl = PDRD_SVG.sheets(demo).filter(function(s){ return s.meta.kind === 'plan'; })[0];
    eq(!!pl.meta.scale, true, 'масштаб');
    eq(pl.p.some(function(e){ return e.t === 'text' && /°/.test(e.s); }), true, 'подписи координат');
    eq(pl.p.some(function(e){ return e.t === 'line' && e.dash; }), true, 'линии сетки');
    eq(pl.notes.some(function(n){ return /WGS-84/.test(n); }), true, 'система координат в примечаниях');
    return 'М 1:' + pl.meta.scale;
  });
  t('DXF R12: заголовок, кодировка, слои, объекты', function(){
    var sh = PDRD_SVG.sheets(demo)[0], txt = PDRD_DXF.toDxf(sh), pr = PDRD_DXF.parse(txt);
    eq(/AC1009/.test(txt), true, 'версия'); eq(/ANSI_1251/.test(txt), true, 'кодировка'); eq(pr.eof, true, 'EOF');
    eq(PDRD_SVG.LAYERS.every(function(l){ return pr.layers.indexOf(l) >= 0; }), true, 'слои');
    var n = sh.p.filter(function(e){ return e.t === 'line'; }).length; eq(pr.entities.LINE, n, 'линии');
    eq(pr.entities.TEXT, sh.p.filter(function(e){ return e.t === 'text' && !e.wm; }).length, 'тексты');
    var b = PDRD_DXF.cp1251('Опора № 5 — ё'); eq(b[0], 0xCE, 'О'); eq(b[6], 0xB9, '№'); eq(b[b.length - 1], 0xB8, 'ё');
    return JSON.stringify(pr.entities);
  });
  t('KML: трасса, опоры, координаты', function(){
    var k = PDRD_KMZ.kml(demo);
    eq((k.match(/<Placemark>/g) || []).length > 31, true, 'объектов'); eq(/<LineString>/.test(k), true, 'линии');
    return (k.match(/<Point>/g) || []).length + ' опор';
  });
  t('Тома: ПЗ, ТКР и РД заполняются без пробелов таблиц (кроме утверждаемых данных)', function(){
    var D = PDRD_DOCX, codes = ['ПЗ', 'ТКР', 'ЛКС'];
    codes.forEach(function(c){
      var tpl = D.TEMPLATES.filter(function(x){ return x.code === c; })[0], data = D.dataFromProject(demo, tpl);
      ['ИСХОДНЫЕ_ДАННЫЕ','ЛИНИИ','ТЭП','Е1','НОРМЫ','СОСТАВ_ПД','ОПОРЫ','СПЕЦИФИКАЦИЯ','ВОР','МУФТЫ','УЗЛЫ','ПРОЛЁТЫ','НАГРУЗКИ','ВЕДОМОСТЬ_ЛИСТОВ'].forEach(function(k){ if (!data.tables[k]) throw new Error(c + ': нет таблицы ' + k); });
      ['ОБОСНОВАНИЕ_РАЗРЕШЕНИЯ','ИЗЫСКАНИЯ','ТРАССА','ИСПОЛНИТЕЛЬНАЯ','ВЫВОД_ПО_ОПОРАМ'].forEach(function(k){ if (!(data.blocks[k] || []).length) throw new Error(c + ': нет текста ' + k); });
    });
    return 'таблицы и тексты сформированы';
  });
  t('Аудит демо: блокируют только утверждение шифра и каталога', function(){
    var st = PDRD_AUDIT.run(demo).filter(function(x){ return x.lv === 'stop'; });
    eq(st.every(function(x){ return /Шифр|Марки|каталог/.test(x.text); }), true, st.map(function(x){ return x.text; }).join('; '));
    return st.length + ' блокирующих';
  });
  t('Шлюз: обход требует обоснования ≥ 40 символов и Ф.И.О.', function(){
    var d0 = DM.build(), it = PDRD_AUDIT.run(d0).filter(function(x){ return x.lv === 'stop'; })[0];
    var e1 = 0; try { PDRD_AUDIT.override(d0, it, 'коротко', 'Куличкин Е.В.'); } catch(e){ e1++; }
    try { PDRD_AUDIT.override(d0, it, 'Шифр присваивается после согласования с заказчиком, выпуск для проверки', 'кто-то'); } catch(e){ e1++; }
    eq(e1, 2, 'отказы');
    PDRD_AUDIT.override(d0, it, 'Шифр присваивается после согласования с заказчиком, выпуск для проверки', 'Куличкин Е.В.');
    var again = PDRD_AUDIT.run(d0).filter(function(x){ return x.key === it.key; })[0];
    eq(!!again.override, true, 'решение применено');
    var all = PDRD_AUDIT.run(d0); all.forEach(function(x){ if (x.lv === 'stop' && !x.override) PDRD_AUDIT.override(d0, x, 'Решение принято для проверки шлюза выпуска в автотесте программы', 'Куличкин Е.В.'); });
    eq(PDRD_AUDIT.gate(PDRD_AUDIT.run(d0)).ok, true, 'шлюз открыт');
    return 'работает';
  });
  t('Проверка чужого проекта: замечания со ссылками', function(){
    var r = PDRD_AUDIT.remarks([{ group:'Г', lv:'stop', text:'Т', ref:'ТТ № 282р' }, { group:'Г', lv:'warn', text:'У', ref:'' }]);
    eq(r.length, 2); eq(r[0].level, 'обязательно к устранению'); return 'лист замечаний';
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
