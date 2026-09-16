/* PD_RD — навигация, общая для всех страниц */
(function () {
  var ITEMS = [
    ['index.html', 'Выпуск'], ['proekt.html', 'Проект'], ['vhod.html', 'Исходные данные'], ['raschet.html', 'Расчёты'],
    ['resheniya.html', 'Решения'], ['skhemy.html', 'Чертежи'], ['specifikaciya.html', 'Спецификация'],
    ['shablony.html', 'Шаблоны'], ['normy.html', 'Нормы'], ['proverka.html', 'Проверка проекта'], ['tests.html', 'Тесты']
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
})();
