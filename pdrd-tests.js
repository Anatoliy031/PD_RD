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

/* ---------------------------------------------------------- заполнение шаблонов */
var DX = window.PDRD_DOCX;
if (DX) {
  var WNS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
  function P_(txt, st){ return '<w:p><w:pPr><w:pStyle w:val="' + (st||'Body') + '"/></w:pPr><w:r><w:t xml:space="preserve">' + txt + '</w:t></w:r></w:p>'; }
  function docX(inner){ return '<w:document ' + WNS + '><w:body>' + inner + '<w:sectPr/></w:body></w:document>'; }
  function fill(inner, data){ var rep = { missing:[], errors:[], filled:0 }; var x = DX.fillPart(docX(inner), data, rep, 'document.xml'); return { x:x, r:rep }; }
  t('Шаблон: поле подставляется, пустое → «—» и пробел', function(){
    var o = fill(P_('Объект {{ОБЪЕКТ_НАИМ}}, ГИП {{ГИП_ФИО}}'), { fields:{ 'ГИП_ФИО':'Е.В. Куличкин', 'ОБЪЕКТ_НАИМ':'' } });
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
    var shape = '<w:p><w:r><w:drawing><wp:anchor><wp:docPr id="1" name="PDRD_WATERMARK"/></wp:anchor></w:drawing></w:r></w:p>';
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
