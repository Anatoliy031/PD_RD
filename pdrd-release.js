/* PD_RD — сборка комплекта: тома ПД и РД (DOCX), лист входного контроля,
   чертежи (PDF, DXF), ведомости (XLSX), трасса (KMZ), файл проекта и опись
   с контрольными суммами. Выпуск возможен только при открытом шлюзе аудита;
   черновой комплект — всегда, с отметкой «ЧЕРНОВИК» в именах файлов. */
(function (global) {
'use strict';
function fetchBuf(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error('не найден ' + url); return r.arrayBuffer(); }); }
function safe(s) { return global.PDRD.fileSafe(s); }

/* Заполнение всех шаблонов в памяти: для аудита и для выпуска */
function fillAll(d, onStep) {
  var D = global.PDRD_DOCX, lg = d.legal, sm = (d.pdSwitches || {}).smeta;
  var prof = global.PDRD_PROFILES ? global.PDRD_PROFILES.get(d.profile && d.profile.operator) : {};
  if (prof.smeta === 'не разрабатывать') sm = false;
  var list = D.TEMPLATES.filter(function (t) {
    if (t.code === 'ППО') return lg.dpt.needed !== true;          /* при ДПТ раздел прикладывается отдельно */
    if (t.code === 'ИЛО') return true;
    if (t.code === 'СМ') return sm !== true || !!d.smetaText;
    return true;
  }).concat([D.INTAKE_TPL]);
  var out = [];
  return list.reduce(function (p, t) {
    return p.then(function () {
      if (onStep) onStep('Том ' + t.code);
      return fetchBuf(t.file).then(function (buf) {
        var data = t.code === 'ВК' ? D.dataForIntake(d) : D.dataFromProject(d, t);
        return D.fillDocx(buf, data).then(function (res) { out.push({ tpl: t, blob: res.blob, missing: res.report.missing.map(function (m) { return m.key; }) }); });
      });
    });
  }, Promise.resolve()).then(function () { return out; });
}

function build(d, opt) {
  opt = opt || {};
  var step = opt.onStep || function () {};
  var draft = !!opt.draft;
  var code = d.passport.shifr || 'SHIFR';
  var sfx = draft ? '_CHERNOVIK' : '';
  var z = new JSZip(), manifest = [];
  function put(path, data) { z.file(path, data); manifest.push(path); }
  return fillAll(d, step).then(function (vols) {
    vols.forEach(function (v) {
      var dir = v.tpl.code === 'ВК' ? '0_Vhodnoj_kontrol/' : (v.tpl.pd ? '1_PD/' : '2_RD/');
      put(dir + safe(code + '-' + v.tpl.code + sfx) + '.docx', v.blob);
    });
    step('Чертежи');
    var sheets = global.PDRD_SVG.sheets(d);
    sheets.forEach(function (sh) { put('3_Chertezhi_DXF/' + global.PDRD_DXF.fileName(d, sh).replace('.dxf', sfx + '.dxf'), global.PDRD_DXF.cp1251(global.PDRD_DXF.toDxf(sh))); });
    var pdf = global.PDRD_PDF && sheets.length ? global.PDRD_PDF.render(sheets, { title: d.passport.object }).then(function (buf) { put('2_RD/' + safe(code + '-LKS-chertezhi' + sfx) + '.pdf', buf); return null; }).catch(function (e) { return e.message; }) : Promise.resolve('листов нет');
    return pdf.then(function (pdfErr) {
      step('Ведомости и трасса');
      if (global.XLSX) put('3_Vedomosti/' + safe(code + '-vedomosti' + sfx) + '.xlsx', global.PDRD_XLSX.toArray(d).data);
      return global.PDRD_KMZ.kmz(d).then(function (kmz) {
        put('3_Vedomosti/' + safe(code + '-trassa' + sfx) + '.kmz', kmz);
        put('4_Proekt/' + safe(code + sfx) + '.pdrd', JSON.stringify(d, null, 1));
        step('Опись');
        return Promise.all(manifest.map(function (path) {
          return z.file(path).async('arraybuffer').then(function (buf) { return global.PDRD_IMPORT.sha256(buf).then(function (h) { return { path: path, size: buf.byteLength, sha: h }; }); });
        })).then(function (rows) {
          var txt = ['Опись комплекта', 'Объект: ' + d.passport.object, 'Обозначение: ' + (d.passport.shifr || 'не утверждено'),
            'Статус: ' + (draft ? 'ЧЕРНОВИК — выпуск не разрешён аудитом' : 'выпуск разрешён аудитом'), 'Сформировано: PD_RD ' + global.PDRD.VERSION + ', ' + new Date().toLocaleString('ru-RU'),
            'ГИП: ' + d.passport.signs.gip, pdfErr ? 'PDF чертежей не сформирован: ' + pdfErr + ' — используйте «Чертежи» → «Печать».' : '', '',
            'Файл | байт | SHA-256'].concat(rows.map(function (r) { return r.path + ' | ' + r.size + ' | ' + r.sha; })).filter(function (x) { return x !== ''; }).join('\r\n');
          z.file('Opis' + sfx + '.txt', '\ufeff' + txt);
          return z.generateAsync({ type: 'blob', compression: 'DEFLATE' }).then(function (blob) {
            return { blob: blob, files: rows.length + 1, name: safe(code + '-komplekt' + sfx) + '.zip', pdfErr: pdfErr, vols: vols };
          });
        });
      });
    });
  });
}
global.PDRD_RELEASE = { fillAll: fillAll, build: build, safe: safe };
})(typeof window !== 'undefined' ? window : globalThis);
