/* PD_RD — сборка инструкции пользователя из build/Instrukciya_PD_RD.md (docx-js).
   Запуск: node build/b3_instruction.js */
const fs = require('fs'), path = require('path');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, LevelFormat, BorderStyle, ShadingType } = require('docx');
const md = fs.readFileSync(path.join(__dirname, 'Instrukciya_PD_RD.md'), 'utf8');
const body = md.replace(/^---[\s\S]*?---\s*/, '');
const title = (md.match(/title:\s*"([^"]+)"/) || [])[1] || 'Инструкция';
const subtitle = (md.match(/subtitle:\s*"([^"]+)"/) || [])[1] || '';
function runs(text) {
  const out = [];
  text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).forEach(p => {
    if (!p) return;
    if (p.startsWith('**')) out.push(new TextRun({ text: p.slice(2, -2), bold: true }));
    else if (p.startsWith('`')) out.push(new TextRun({ text: p.slice(1, -1), font: 'Consolas' }));
    else out.push(new TextRun(p));
  });
  return out;
}
const children = [
  new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title)] }),
  new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: subtitle, italics: true })] })
];
const W = 9638; // ширина текста А4 при полях 2 см, twips
const lines = body.split('\n');
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (!l.trim()) continue;
  if (l.startsWith('# ')) { children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(l.slice(2))] })); continue; }
  if (/^\d+\.\s/.test(l)) { children.push(new Paragraph({ numbering: { reference: 'num', level: 0 }, children: runs(l.replace(/^\d+\.\s/, '')) })); continue; }
  if (l.startsWith('- ')) { children.push(new Paragraph({ numbering: { reference: 'dash', level: 0 }, children: runs(l.slice(2)) })); continue; }
  if (l.startsWith('|')) {
    const rows = [];
    while (i < lines.length && lines[i].startsWith('|')) { if (!/^\|[-| ]+\|$/.test(lines[i])) rows.push(lines[i].split('|').slice(1, -1).map(s => s.trim())); i++; }
    i--;
    const n = rows[0].length, cw = n === 2 ? [2800, W - 2800] : Array(n).fill(Math.floor(W / n));
    const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
    children.push(new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: cw,
      rows: rows.map((r, ri) => new TableRow({ tableHeader: ri === 0, children: r.map((c, ci) => new TableCell({
        width: { size: cw[ci], type: WidthType.DXA }, borders: { top: border, bottom: border, left: border, right: border },
        shading: ri === 0 ? { type: ShadingType.CLEAR, fill: 'E7EFF7', color: 'auto' } : undefined,
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [new Paragraph({ children: ri === 0 ? [new TextRun({ text: c, bold: true })] : runs(c) })] })) })) }));
    children.push(new Paragraph({ children: [] }));
    continue;
  }
  children.push(new Paragraph({ spacing: { after: 120 }, children: runs(l) }));
}
const doc = new Document({
  creator: 'PD_RD', title,
  styles: { default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', run: { size: 36, bold: true, color: '003E6B' }, paragraph: { spacing: { after: 120 } } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, color: '005B9C' }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 0 } }
    ] },
  numbering: { config: [
    { reference: 'num', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 340 } } } }] },
    { reference: 'dash', levels: [{ level: 0, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 340 } } } }] }
  ] },
  sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children }]
});
Packer.toBuffer(doc).then(b => { fs.writeFileSync(path.join(__dirname, '..', 'Instrukciya_PD_RD.docx'), b); console.log('Instrukciya_PD_RD.docx', b.length); });
