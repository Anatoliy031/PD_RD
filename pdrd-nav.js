/* PD_RD — навигация, общая для всех страниц */
(function () {
  var ITEMS = [
    ['index.html', 'Выпуск'], ['proekt.html', 'Проект'], ['vhod.html', 'Исходные данные'], ['raschet.html', 'Расчёты'],
    ['resheniya.html', 'Решения'], ['skhemy.html', 'Чертежи'], ['specifikaciya.html', 'Спецификация'],
    ['spravochnik.html', 'Справочник'], ['shablony.html', 'Шаблоны'], ['normy.html', 'Нормы'], ['proverka.html', 'Проверка проекта'], ['tests.html', 'Тесты']
  ];
  var nav = document.getElementById('nav');
  if (!nav) return;
  var here = (location.pathname.split('/').pop() || 'index.html');
  ITEMS.forEach(function (it) {
    var a = document.createElement('a');
    a.href = it[0]; a.textContent = it[1];
    if (it[0] === here) { a.className = 'on'; a.setAttribute('aria-current', 'page'); }
    nav.appendChild(a);
  });
  /* Проверка версии: если браузер (особенно Safari на iPad) показывает страницу из кэша,
     а на сайте уже новая версия — предлагаем обновить */
  try {
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (v) {
      var cur = window.PDRD && window.PDRD.VERSION;
      if (!v || !v.version || !cur || v.version === cur) return;
      var bar = document.createElement('div');
      bar.setAttribute('role', 'alert');
      bar.style.cssText = 'position:sticky;top:0;z-index:50;background:#FFF4D6;border-bottom:1px solid #E7C66A;padding:10px 16px;font-size:15px;display:flex;gap:12px;align-items:center;flex-wrap:wrap';
      bar.appendChild(document.createTextNode('На сайте новая версия ' + v.version + ' (открыта ' + cur + ' из кэша браузера).'));
      var b = document.createElement('button'); b.className = 'btn primary'; b.type = 'button'; b.textContent = 'Обновить';
      b.onclick = function () { var u = location.pathname + '?r=' + Date.now() + location.hash; location.replace(u); };
      bar.appendChild(b);
      document.body.insertBefore(bar, document.body.firstChild);
    }).catch(function () {});
  } catch (e) {}
})();
