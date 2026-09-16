/* PD_RD — извлечение справочников из АРМ ППО (VOLS_ARM_V25/ppo-core.js)
   в pdrd-refs-v25.js. Файл ppo-core.js целиком в PD_RD не подключается:
   при загрузке он подписывается на события хранилища и при сохранении
   может писать в общий localStorage. Здесь берутся только данные справочников.
   Запуск: node build/b2_refs.js <путь к ppo-core.js>                       */
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = process.argv[2];
if (!src) { console.error('Укажите путь к ppo-core.js'); process.exit(1); }
const mem = {};
const ctx = {
  console, Date, Math, JSON, Object, Array, String, Number, RegExp, parseFloat, parseInt, isNaN, Promise,
  localStorage: { getItem: () => null, setItem: () => { throw new Error('запись запрещена'); }, removeItem: () => {} },
  document: { addEventListener() {}, dispatchEvent() {}, hidden: false },
  CustomEvent: function () {}, setTimeout, clearTimeout
};
ctx.window = ctx;
ctx.addEventListener = () => {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(src, 'utf8'), ctx);
const P = ctx.PPO;
const pick = (a) => JSON.parse(JSON.stringify(a));
const out = {
  source: 'VOLS_ARM_V25/ppo-core.js',
  version: P.VERSION,
  status: 'требует подтверждения',
  note: 'Значения справочников АРМ ППО типовые (README V25): допустимые моменты, габаритные пролёты и характеристики кабелей подтверждаются по типовым проектам и паспортам изготовителей.',
  VL: pick(P.VL), POLES: pick(P.POLES), CABLES: pick(P.CABLES), WIRES: pick(P.WIRES), DEFECTS: pick(P.DEFECTS)
};
const js = `/* PD_RD — справочники АРМ ППО ${P.VERSION} (извлечены build/b2_refs.js, не править вручную).
   Статус значений: требует подтверждения. */
(function (global) {
'use strict';
var R = ${JSON.stringify(out, null, 0)};
function norm(s) { return String(s || '').replace(/\\s+/g, ' ').trim(); }
R.poleByMark = function (m) { m = norm(m); for (var i = 0; i < R.POLES.length; i++) if (R.POLES[i].mark === m) return R.POLES[i]; return null; };
R.vlByKv = function (kv) { var s = String(kv || '').replace('.', ',').trim(); for (var i = 0; i < R.VL.length; i++) if (R.VL[i].kv === s) return R.VL[i]; return null; };
R.cableByMark = function (m) { m = norm(m); for (var i = 0; i < R.CABLES.length; i++) if (R.CABLES[i].mark === m) return R.CABLES[i]; return null; };
R.defectByCat = function (c) {
  var t = String(c || '—').trim().toUpperCase().replace('А', 'A');
  for (var i = 0; i < R.DEFECTS.length; i++) if (String(R.DEFECTS[i].cat).toUpperCase().replace('А', 'A') === t) return R.DEFECTS[i];
  return R.DEFECTS[0];
};
global.PDRD_REFS_V25 = R;
})(typeof window !== 'undefined' ? window : globalThis);
`;
fs.writeFileSync(path.join(__dirname, '..', 'pdrd-refs-v25.js'), js);
console.log('pdrd-refs-v25.js: опор', out.POLES.length, 'кабелей', out.CABLES.length, 'проводов', out.WIRES.length, 'версия', out.version);
