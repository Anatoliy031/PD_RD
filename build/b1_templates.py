#!/usr/bin/env python3
"""PD_RD — сборка шаблонов томов ПД и РД (tpl_*.docx).

Шаблоны не правятся вручную: каждое поле {{…}} пишется одним run, поэтому
Word не разрывает его. Запуск: python3 build/b1_templates.py  (из корня репозитория)

Оформление по ГОСТ Р 21.101-2020:
  * рамка листа: 20 мм слева, 5 мм сверху, справа, снизу;
  * основная надпись: первый лист текстового документа — форма 5 (185×40 мм),
    последующие — форма 6 (185×15 мм);
  * титульный лист — без рамки и основной надписи.
Отметка «ШИФР НЕ УТВЕРЖДЁН» — фигура PDRD_WATERMARK в колонтитуле;
заполнитель удаляет её, когда шифр утверждён.
"""
import os, sys, zipfile, datetime
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION = '0.3.0'

MM = 56.6929  # twips в мм
def tw(mm): return int(round(mm * MM))
def emu(mm): return int(round(mm * 36000))

FONT = 'Arial'

# ------------------------------------------------------------------ run/paragraph
def run(text, b=False, i=False, sz=None, color=None, caps=False):
    rpr = ''
    if b: rpr += '<w:b/>'
    if i: rpr += '<w:i/>'
    if caps: rpr += '<w:caps/>'
    if color: rpr += f'<w:color w:val="{color}"/>'
    if sz: rpr += f'<w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/>'
    rpr = f'<w:rPr>{rpr}</w:rPr>' if rpr else ''
    return f'<w:r>{rpr}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'

def rich(text, **kw):
    """Текст с полями: каждое {{…}} — отдельный run."""
    out, pos = [], 0
    while True:
        a = text.find('{{', pos)
        if a < 0:
            if pos < len(text): out.append(run(text[pos:], **kw))
            break
        b = text.index('}}', a) + 2
        if a > pos: out.append(run(text[pos:a], **kw))
        out.append(run(text[a:b], **kw))
        pos = b
    return ''.join(out)

def para(text='', style=None, align=None, b=False, sz=None, keep=False, before=None, after=None, ind=None, color=None, runs=None):
    ppr = ''
    if style: ppr += f'<w:pStyle w:val="{style}"/>'
    if keep: ppr += '<w:keepNext/>'
    if before is not None or after is not None:
        ppr += f'<w:spacing w:before="{before or 0}" w:after="{after or 0}"/>'
    if ind is not None: ppr += f'<w:ind w:firstLine="{ind}"/>'
    if align: ppr += f'<w:jc w:val="{align}"/>'
    body = runs if runs is not None else rich(text, b=b, sz=sz, color=color)
    return f'<w:p><w:pPr>{ppr}</w:pPr>{body}</w:p>'

def fld(instr, sz=None, b=False):
    rpr = ''
    if b: rpr += '<w:b/>'
    if sz: rpr += f'<w:sz w:val="{sz}"/><w:szCs w:val="{sz}"/>'
    rpr = f'<w:rPr>{rpr}</w:rPr>' if rpr else ''
    return (f'<w:r>{rpr}<w:fldChar w:fldCharType="begin"/></w:r>'
            f'<w:r>{rpr}<w:instrText xml:space="preserve"> {instr} </w:instrText></w:r>'
            f'<w:r>{rpr}<w:fldChar w:fldCharType="separate"/></w:r>'
            f'<w:r>{rpr}<w:t>1</w:t></w:r>'
            f'<w:r>{rpr}<w:fldChar w:fldCharType="end"/></w:r>')

def page_break():
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'

# ------------------------------------------------------------------ таблицы основной надписи
def cell(w_mm, content, span=1, vmerge=None, borders=None, valign='center', align='center', sz=16, b=False, rot=False):
    tcpr = f'<w:tcW w:w="{tw(w_mm)}" w:type="dxa"/>'
    if span > 1: tcpr += f'<w:gridSpan w:val="{span}"/>'
    if vmerge == 'restart': tcpr += '<w:vMerge w:val="restart"/>'
    elif vmerge == 'cont': tcpr += '<w:vMerge/>'
    if borders:
        tcpr += '<w:tcBorders>' + ''.join(
            f'<w:{k} w:val="single" w:sz="{v}" w:space="0" w:color="000000"/>' for k, v in borders.items()) + '</w:tcBorders>'
    if rot: tcpr += '<w:textDirection w:val="btLr"/>'
    tcpr += f'<w:vAlign w:val="{valign}"/>'
    if isinstance(content, str):
        runs = content if content.startswith('<w:r') else rich(content, sz=sz, b=b)
    else:
        runs = ''.join(content)
    p = (f'<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>'
         f'<w:ind w:left="28" w:right="28"/><w:jc w:val="{align}"/></w:pPr>{runs}</w:p>')
    return f'<w:tc><w:tcPr>{tcpr}</w:tcPr>{p}</w:tc>'

def row(h_mm, cells):
    return (f'<w:tr><w:trPr><w:trHeight w:val="{tw(h_mm)}" w:hRule="exact"/><w:cantSplit/></w:trPr>'
            + ''.join(cells) + '</w:tr>')

def table(widths, rows, indent_mm=-5):
    grid = ''.join(f'<w:gridCol w:w="{tw(w)}"/>' for w in widths)
    thick = 12  # 1,5 pt ≈ 0,5 мм — основная линия
    thin = 4
    borders = (f'<w:tblBorders><w:top w:val="single" w:sz="{thick}" w:color="000000"/>'
               f'<w:left w:val="single" w:sz="{thick}" w:color="000000"/>'
               f'<w:bottom w:val="single" w:sz="{thick}" w:color="000000"/>'
               f'<w:right w:val="single" w:sz="{thick}" w:color="000000"/>'
               f'<w:insideH w:val="single" w:sz="{thin}" w:color="000000"/>'
               f'<w:insideV w:val="single" w:sz="{thick}" w:color="000000"/></w:tblBorders>')
    return (f'<w:tbl><w:tblPr><w:tblW w:w="{tw(sum(widths))}" w:type="dxa"/>'
            f'<w:tblInd w:w="{tw(indent_mm)}" w:type="dxa"/>{borders}<w:tblLayout w:type="fixed"/>'
            f'<w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>'
            f'</w:tblPr><w:tblGrid>{grid}</w:tblGrid>' + ''.join(rows) + '</w:tbl>')

LEFT = [10, 10, 10, 10, 15, 10]   # Изм., Кол.уч., Лист, № док., Подп., Дата
HDR = ['Изм.', 'Кол.уч.', 'Лист', '№ док.', 'Подп.', 'Дата']

def left_cells(values=None, sz=14):
    values = values or [''] * 6
    return [cell(w, v, sz=sz) for w, v in zip(LEFT, values)]

def form5():
    """Форма 5: 185×40 мм. Сетка: 6 левых + 70 + 15 + 15 + 20."""
    widths = LEFT + [70, 15, 15, 20]
    C = lambda w, t, **k: cell(w, t, **k)
    rows = []
    # строки 1–2: изменения; справа — обозначение документа (rows 1–3)
    rows.append(row(5, left_cells() + [cell(120, '{{ОБОЗНАЧЕНИЕ}}', span=4, vmerge='restart', sz=28, b=True)]))
    rows.append(row(5, left_cells() + [cell(120, '', span=4, vmerge='cont')]))
    rows.append(row(5, left_cells(HDR) + [cell(120, '', span=4, vmerge='cont')]))
    roles = [('Разраб.', '{{РАЗРАБ_ФИО}}'), ('Пров.', '{{ПРОВ_ФИО}}'), ('', ''), ('Н. контр.', '{{НКОНТР_ФИО}}'), ('ГИП', '{{ГИП_ФИО}}')]
    for k, (role, fio) in enumerate(roles):
        c = [cell(20, role, span=2, sz=14, align='left'), cell(20, fio, span=2, sz=14, align='left'),
             cell(15, '', sz=14), cell(10, '{{ДАТА_ВЫПУСКА_КР}}' if fio else '', sz=12)]
        if k == 0:
            c += [cell(70, '{{ОБЪЕКТ_НАИМ}}. {{ТОМ_НАИМ}}', vmerge='restart', sz=13),
                  cell(15, 'Стадия', sz=14), cell(15, 'Лист', sz=14), cell(20, 'Листов', sz=14)]
        elif k == 1:
            c += [cell(70, '', vmerge='cont'),
                  cell(15, '{{СТАДИЯ}}', sz=16), cell(15, fld('PAGE', sz=16)), cell(20, fld('NUMPAGES', sz=16))]
        elif k == 2:
            c += [cell(70, '', vmerge='cont'), cell(50, '{{ОРГАНИЗАЦИЯ}}', span=3, vmerge='restart', sz=14)]
        else:
            c += [cell(70, '', vmerge='cont'), cell(50, '', span=3, vmerge='cont')]
        rows.append(row(5, c))
    return table(widths, rows)

def form6():
    """Форма 6: 185×15 мм. Сетка: 6 левых + 110 + 10."""
    widths = LEFT + [110, 10]
    rows = [
        row(5, left_cells() + [cell(110, '{{ОБОЗНАЧЕНИЕ}}', vmerge='restart', sz=28, b=True), cell(10, 'Лист', sz=14)]),
        row(5, left_cells() + [cell(110, '', vmerge='cont'), cell(10, fld('PAGE', sz=18), vmerge='restart')]),
        row(5, left_cells(HDR) + [cell(110, '', vmerge='cont'), cell(10, '', vmerge='cont')]),
    ]
    return table(widths, rows)

# ------------------------------------------------------------------ рамка и отметка
_shape_id = [100]
def anchor(name, x_mm, y_mm, w_mm, h_mm, inner, behind=True):
    _shape_id[0] += 1
    sid = _shape_id[0]
    return (f'<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="{sid}" '
            f'behindDoc="{1 if behind else 0}" locked="1" layoutInCell="1" allowOverlap="1">'
            f'<wp:simplePos x="0" y="0"/>'
            f'<wp:positionH relativeFrom="page"><wp:posOffset>{emu(x_mm)}</wp:posOffset></wp:positionH>'
            f'<wp:positionV relativeFrom="page"><wp:posOffset>{emu(y_mm)}</wp:posOffset></wp:positionV>'
            f'<wp:extent cx="{emu(w_mm)}" cy="{emu(h_mm)}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>'
            f'<wp:wrapNone/><wp:docPr id="{sid}" name="{name}"/><wp:cNvGraphicFramePr/>'
            f'<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
            f'<a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">'
            f'{inner}</a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>')

def frame_shape():
    inner = (f'<wps:wsp><wps:cNvSpPr/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{emu(185)}" cy="{emu(287)}"/></a:xfrm>'
             f'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>'
             f'<a:ln w="{emu(0.5)}"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln></wps:spPr>'
             f'<wps:bodyPr/></wps:wsp>')
    return anchor('PDRD_FRAME', 20, 5, 185, 287, inner)

def watermark_shape():
    inner = (f'<wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm rot="-3300000"><a:off x="0" y="0"/>'
             f'<a:ext cx="{emu(170)}" cy="{emu(22)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
             f'<a:noFill/><a:ln><a:noFill/></a:ln></wps:spPr>'
             f'<wps:txbx><w:txbxContent><w:p><w:pPr><w:jc w:val="center"/></w:pPr>'
             f'<w:r><w:rPr><w:b/><w:color w:val="E3A8A8"/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr>'
             f'<w:t>ШИФР НЕ УТВЕРЖДЁН</w:t></w:r></w:p></w:txbxContent></wps:txbx>'
             f'<wps:bodyPr rot="0" wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/></wps:wsp>')
    return anchor('PDRD_WATERMARK', 28, 135, 170, 22, inner)

NS = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" '
      'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
      'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" mc:Ignorable="w14"')

def hdr_xml(tag, body):
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:{tag} {NS}>{body}</w:{tag}>'

def header_frame():
    return hdr_xml('hdr', '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>'
                          + frame_shape() + watermark_shape() + '</w:p>')

def header_empty():
    return hdr_xml('hdr', '<w:p/>')

def footer(tbl):
    return hdr_xml('ftr', tbl + '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p>')

# ------------------------------------------------------------------ содержимое томов
H1, H2 = 'Heading1', 'Heading2'
def h1(t): return para(t, H1, keep=True)
def h2(t): return para(t, H2, keep=True)
def tx(t): return para(t, 'Body')
def li(t): return para(t, 'ListDash')
def mark(t): return para(t, 'Marker')     # служебная строка {{ТАБЛИЦА}}/{{БЛОК}}/{{ЕСЛИ}}
def note(t): return para(t, 'Hint')       # подсказка для проектировщика, удаляется заполнителем

def title_page(vol_title, pd=True):
    out = [
        para('{{ВЛАДЕЛЕЦ_НАИМ}}', 'TitleSmall', align='center'),
        para('{{ОРГАНИЗАЦИЯ}}', 'TitleSmall', align='center'),
        para('Выписка из реестра членов СРО: {{СРО_НАИМ}}, рег. № {{СРО_РЕГ_НОМЕР}} от {{СРО_ВЫПИСКА_ДАТА}}', 'TitleSmall', align='center'),
        para('', 'Body', after=1600),
        para('Заказчик — {{ЗАКАЗЧИК_НАИМ}}', 'TitleSmall', align='center'),
        para('', 'Body', after=600),
        para('{{ОБЪЕКТ_НАИМ}}', 'TitleObject', align='center'),
        para('', 'Body', after=400),
        para('ПРОЕКТНАЯ ДОКУМЕНТАЦИЯ' if pd else 'РАБОЧАЯ ДОКУМЕНТАЦИЯ', 'TitleStage', align='center'),
        para(vol_title, 'TitleVolume', align='center'),
        para('', 'Body', after=200),
        para('{{ОБОЗНАЧЕНИЕ}}', 'TitleCode', align='center'),
    ]
    if pd:
        out.append(para('Том {{ТОМ_НОМЕР}}', 'TitleSmall', align='center'))
    out += [
        para('', 'Body', after=2400),
        signature_table(),
        para('', 'Body', after=1200),
        para('{{ГОД_ВЫПУСКА}}', 'TitleSmall', align='center'),
    ]
    return ''.join(out)

def signature_table():
    widths = [95, 80]
    def c(t, al='left'):
        return (f'<w:tc><w:tcPr><w:tcW w:w="{tw(95 if al=="left" else 80)}" w:type="dxa"/></w:tcPr>'
                f'<w:p><w:pPr><w:spacing w:before="0" w:after="120"/><w:jc w:val="{al}"/></w:pPr>{rich(t, sz=24)}</w:p></w:tc>')
    rows = ''.join('<w:tr>' + c(a) + c(b, 'right') + '</w:tr>' for a, b in [
        ('Главный инженер проекта', '________________ {{ГИП_ФИО}}'),
    ])
    grid = ''.join(f'<w:gridCol w:w="{tw(w)}"/>' for w in widths)
    return (f'<w:tbl><w:tblPr><w:tblW w:w="{tw(175)}" w:type="dxa"/>'
            f'<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/>'
            f'<w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>{grid}</w:tblGrid>{rows}</w:tbl>')

def contents_block():
    return (h1('Содержание тома') + mark('{{ТАБЛИЦА:СОДЕРЖАНИЕ_ТОМА}}') + page_break())

# Тома ПД: код, номер раздела, наименование, наполнение
def vol_pz():
    b = []
    b += [h1('1 Общие положения')]
    b += [h2('1.1 Основание для проектирования'),
          tx('Проектная документация «{{ОБЪЕКТ_НАИМ}}» разработана на основании:'),
          li('технического задания {{ТЗ_НАИМ}} от {{ТЗ_ДАТА}} № {{ТЗ_НОМЕР}};'),
          li('договора на выполнение проектно-изыскательских работ от {{ДОГОВОР_ПИР_ДАТА}} № {{ДОГОВОР_ПИР_НОМЕР}};'),
          li('отчёта о результатах осмотра и обследования объекта инфраструктуры по пункту 13 Правил недискриминационного доступа к инфраструктуре, утверждённых постановлением Правительства Российской Федерации от 22.11.2022 № 2106, от {{ОТЧЁТ_П13_ДАТА}} № {{ОТЧЁТ_П13_НОМЕР}};'),
          li('технических условий (письма) владельца инфраструктуры от {{ТУ_ДАТА}} № {{ТУ_НОМЕР}}.'),
          h2('1.2 Сведения о сторонах'),
          tx('Владелец инфраструктуры — {{ВЛАДЕЛЕЦ_НАИМ}} ({{ВЛАДЕЛЕЦ_ФИЛИАЛ}}).'),
          tx('Пользователь инфраструктуры (оператор связи) — {{ОПЕРАТОР_НАИМ}}.'),
          mark('{{ЕСЛИ:ПОДРЯДЧИК}}'),
          tx('Строительство сети электросвязи выполняет {{ПОДРЯДЧИК_НАИМ}} в интересах {{ОПЕРАТОР_НАИМ}}.'),
          mark('{{КОНЕЦ}}'),
          tx('Заказчик проектной документации — {{ЗАКАЗЧИК_НАИМ}}.'),
          tx('Проектная организация — {{ОРГАНИЗАЦИЯ}}. Сведения о членстве в саморегулируемой организации: {{СРО_НАИМ}}, регистрационный номер в реестре {{СРО_РЕГ_НОМЕР}}, выписка из реестра членов от {{СРО_ВЫПИСКА_ДАТА}} (приложение {{СРО_ПРИЛОЖЕНИЕ}}).'),
          h2('1.3 Исходные данные'),
          mark('{{ТАБЛИЦА:ИСХОДНЫЕ_ДАННЫЕ}}'),
          h2('1.4 Сведения об инженерных изысканиях'),
          mark('{{БЛОК:ИЗЫСКАНИЯ}}'),
          note('Изыскания выполнены — реквизиты отчётов. Не выполнялись — обоснование со ссылкой на пункт нормативного акта.'),
         ]
    b += [h1('2 Характеристика линейного объекта'),
          h2('2.1 Наименование и местоположение'),
          tx('Объект: {{ОБЪЕКТ_НАИМ}}. Местоположение: {{ОБЪЕКТ_МЕСТО}}.'),
          h2('2.2 Сопряжённый объект инфраструктуры'),
          tx('Кабель размещается на опорах воздушных линий электропередачи класса напряжения {{КЛАССЫ_КВ}} кВ. Протяжённость участка размещения — {{ПРОТЯЖЁННОСТЬ_КМ}} км, число опор — {{ОПОР_ВСЕГО}}.'),
          mark('{{ТАБЛИЦА:ЛИНИИ}}'),
          h2('2.3 Идентификационные признаки'),
          tx('Идентификационные признаки объекта в соответствии со статьёй 4 Федерального закона от 30.12.2009 № 384-ФЗ:'),
          mark('{{ТАБЛИЦА:ИДЕНТИФИКАЦИЯ}}'),
          h2('2.4 Технико-экономические показатели'),
          mark('{{ТАБЛИЦА:ТЭП}}'),
         ]
    b += [h1('3 Правовые основания'),
          h2('3.1 Разрешение на строительство и документация по планировке территории'),
          mark('{{БЛОК:ОБОСНОВАНИЕ_РАЗРЕШЕНИЯ}}'),
          h2('3.2 Государственная экспертиза'),
          mark('{{БЛОК:ОБОСНОВАНИЕ_ЭКСПЕРТИЗЫ}}'),
          h2('3.3 Земельные участки'),
          mark('{{БЛОК:ЗЕМЛЯ}}'),
          note('Категории земель, сведения о сервитутах, убытках (ПП РФ № 59); для размещения на существующих опорах — обоснование отсутствия изъятия.'),
         ]
    b += [h1('4 Связь с отчётом по пункту 13 Правил'),
          mark('{{БЛОК:ОБОСНОВАНИЕ_ППО}}'),
          tx('Мероприятия, обусловленные размещением сети электросвязи и выполняемые пользователем инфраструктуры, приведены в таблице. Мероприятия, связанные с устранением дефектов, не обусловленных размещением, пользователю инфраструктуры не поручаются и учтены в проекте только как ограничения.'),
          mark('{{ТАБЛИЦА:Е1}}'),
         ]
    b += [h1('5 Сведения о компьютерных программах'),
          tx('Расчёты выполнены с применением программы {{ПРОГРАММА_РАСЧЁТА}}. Исходные данные и результаты расчётов приведены в томе «Иная документация».'),
          h1('6 Перечень нормативных документов'),
          mark('{{ТАБЛИЦА:НОРМЫ}}'),
          h1('7 Заверение проектной организации'),
          mark('{{БЛОК:ЗАВЕРЕНИЕ_ГИП}}'),
          tx('Главный инженер проекта ________________ {{ГИП_ФИО}}'),
         ]
    return b

def vol_ppo():
    return [mark('{{ЕСЛИ:ППО_РАЗРАБАТЫВАЕТСЯ}}'),
            h1('1 Сведения о полосе отвода'),
            mark('{{БЛОК:ПОЛОСА_ОТВОДА}}'),
            mark('{{КОНЕЦ}}'),
            mark('{{ЕСЛИ:ППО_НЕ_РАЗРАБАТЫВАЕТСЯ}}'),
            h1('1 Обоснование'),
            tx('Раздел «Проект полосы отвода» не разрабатывается. В соответствии с подпунктом «б» пункта 32 Положения о составе разделов проектной документации и требованиях к их содержанию, утверждённого постановлением Правительства Российской Федерации от 16.02.2008 № 87, раздел разрабатывается в соответствии с проектом планировки территории, за исключением случаев, при которых для строительства линейного объекта не требуется подготовка документации по планировке территории.'),
            mark('{{БЛОК:ДПТ_НЕ_ТРЕБУЕТСЯ}}'),
            mark('{{КОНЕЦ}}')]

def vol_tkr():
    return [
        h1('1 Сведения о трассе и условиях размещения'),
        h2('1.1 Трасса линии связи'),
        mark('{{БЛОК:ТРАССА}}'),
        h2('1.2 Климатические условия'),
        tx('Район по ветру — {{РАЙОН_ВЕТЕР}} (нормативное ветровое давление {{ДАВЛЕНИЕ_ВЕТРА_ПА}} Па), район по гололёду — {{РАЙОН_ГОЛОЛЁД}} (нормативная толщина стенки гололёда {{СТЕНКА_ГОЛОЛЁДА_ММ}} мм), тип местности — {{ТИП_МЕСТНОСТИ}}, сейсмичность — {{СЕЙСМИЧНОСТЬ}} баллов. Источник: {{КЛИМАТ_ИСТОЧНИК}}.'),
        h2('1.3 Опоры и провода воздушных линий'),
        mark('{{ТАБЛИЦА:ОПОРЫ_СВОДКА}}'),
        mark('{{ТАБЛИЦА:ПРОВОДА}}'),
        h1('2 Линейно-кабельные сооружения и кабель связи'),
        note('Требование ТЗ МТС (п. 9.4.1): ЛКС и кабель связи описываются как самостоятельные объекты с текстовым и графическим описанием способа прокладки.'),
        h2('2.1 Оптический кабель'),
        tx('Для подвески на опорах ВЛ принят кабель {{КАБЕЛЬ_МАРКА}} с числом оптических волокон {{КАБЕЛЬ_ОВ}}. Характеристики кабеля приведены в таблице.'),
        mark('{{ТАБЛИЦА:КАБЕЛЬ}}'),
        h2('2.2 Способ прокладки'),
        mark('{{БЛОК:СПОСОБ_ПРОКЛАДКИ}}'),
        h2('2.3 Размещение кабеля на опорах'),
        tx('Кабель размещается ниже проводов ВЛ. Расстояния на опоре и в пролёте приняты по ТТ № 282р:'),
        mark('{{ТАБЛИЦА:РАССТОЯНИЯ_НОРМЫ}}'),
        mark('{{ЕСЛИ:КЛАСС_35_110}}'),
        tx('Точка подвеса на опорах ВЛ 35–110 кВ выбрана по наименьшему наведённому потенциалу; класс трекингостойкости оболочки — {{КАБЕЛЬ_ТРЕКИНГ}}.'),
        mark('{{КОНЕЦ}}'),
        h2('2.4 Узлы крепления и линейная арматура'),
        tx('Применяется арматура заводского исполнения с паспортами, сертификатами или декларациями соответствия. Прочность заделки кабеля в натяжном зажиме — не менее 90 % разрывной прочности кабеля.'),
        mark('{{ТАБЛИЦА:УЗЛЫ}}'),
        h2('2.5 Муфты, шкафы и запасы кабеля'),
        tx('Муфты, шкафы и бухты запаса не размещаются на двух смежных промежуточных опорах. Длина технологического запаса — {{ЗАПАС_ТЕХН_М}} м, аварийный запас — {{ЗАПАС_АВАР}}.'),
        mark('{{ТАБЛИЦА:МУФТЫ}}'),
        h2('2.6 Пересечения и сближения'),
        mark('{{ТАБЛИЦА:ПЕРЕСЕЧЕНИЯ}}'),
        h2('2.7 Защита от вибрации и пляски'),
        mark('{{БЛОК:ГАСИТЕЛИ}}'),
        h2('2.8 Маркировка'),
        tx('Бирки с информацией о пользователе инфраструктуры и его контактном телефоне крепятся к кабелю на расстоянии не более 0,10 м от места крепления к опоре, не менее одной бирки в каждом анкерном пролёте.'),
        mark('{{ЕСЛИ:ПРОФИЛЬ_GPON}}'),
        h2('2.9 Распределительная сеть'),
        mark('{{БЛОК:GPON}}'),
        mark('{{КОНЕЦ}}'),
        h1('3 Результаты расчётов'),
        h2('3.1 Механический расчёт кабеля'),
        mark('{{ТАБЛИЦА:ПРОЛЁТЫ}}'),
        h2('3.2 Нагрузки на опоры'),
        mark('{{ТАБЛИЦА:НАГРУЗКИ}}'),
        h2('3.3 Вывод'),
        mark('{{БЛОК:ВЫВОД_ПО_ОПОРАМ}}'),
        h1('4 Графическая часть'),
        mark('{{ТАБЛИЦА:ВЕДОМОСТЬ_ЛИСТОВ}}'),
    ]

def vol_ilo():
    return [mark('{{ЕСЛИ:ИЛО_РАЗРАБАТЫВАЕТСЯ}}'),
            h1('1 Здания, строения и сооружения инфраструктуры'),
            mark('{{ТАБЛИЦА:ШКАФЫ}}'),
            mark('{{КОНЕЦ}}'),
            mark('{{ЕСЛИ:ИЛО_НЕ_РАЗРАБАТЫВАЕТСЯ}}'),
            h1('1 Обоснование'),
            tx('Здания, строения и сооружения, входящие в инфраструктуру линейного объекта, проектом не предусматриваются: кабель размещается на существующих опорах воздушных линий электропередачи, оборудование размещается в муфтах и шкафах на опорах (том {{ОБОЗНАЧЕНИЕ_ТКР}}).'),
            mark('{{КОНЕЦ}}')]

def vol_pos():
    return [
        h1('1 Характеристика условий строительства'),
        mark('{{БЛОК:УСЛОВИЯ_СТРОИТЕЛЬСТВА}}'),
        h1('2 Организация работ в охранной зоне воздушных линий'),
        tx('Работы выполняются в охранной зоне объектов электросетевого хозяйства с соблюдением Правил, утверждённых постановлением Правительства Российской Федерации от 24.02.2009 № 160, по наряду-допуску, с допуском представителем владельца инфраструктуры, в соответствии с Правилами по охране труда при эксплуатации электроустановок (приказ Минтруда России от 15.12.2020 № 903н) и Правилами по охране труда при работе на высоте (приказ Минтруда России от 16.11.2020 № 782н).'),
        mark('{{БЛОК:ОТКЛЮЧЕНИЯ}}'),
        h1('3 Последовательность и методы производства работ'),
        mark('{{БЛОК:ТЕХНОЛОГИЯ_МОНТАЖА}}'),
        h1('4 Потребность в ресурсах'),
        mark('{{ТАБЛИЦА:РЕСУРСЫ}}'),
        h1('5 Календарный план'),
        mark('{{ТАБЛИЦА:КАЛЕНДАРНЫЙ_ПЛАН}}'),
        h1('6 Контроль качества'),
        tx('Контроль качества работ выполняется в соответствии с СП 48.13330.2019. Ведётся общий журнал работ по форме, утверждённой приказом Минстроя России от 02.12.2022 № 1026/пр.'),
        h1('7 Метрологическое обеспечение'),
        mark('{{ТАБЛИЦА:МЕТРОЛОГИЯ}}'),
        h1('8 Требования к исполнительной документации'),
        mark('{{БЛОК:ИСПОЛНИТЕЛЬНАЯ}}'),
        h1('9 Охрана труда'),
        mark('{{БЛОК:ОХРАНА_ТРУДА}}'),
    ]

def vol_oos():
    return [h1('1 Общие сведения'),
            tx('Линейный объект не имеет стационарных источников выбросов загрязняющих веществ, сбросов сточных вод и не образует отходов при эксплуатации.'),
            h1('2 Мероприятия в период строительства'),
            mark('{{БЛОК:ООС_СТРОИТЕЛЬСТВО}}'),
            h1('3 Отходы'),
            mark('{{ТАБЛИЦА:ОТХОДЫ}}')]

def vol_pb():
    return [h1('1 Нормативная база'),
            tx('Раздел разработан в соответствии с Федеральным законом от 21.12.1994 № 69-ФЗ, Федеральным законом от 22.07.2008 № 123-ФЗ, Правилами противопожарного режима в Российской Федерации, утверждёнными постановлением Правительства Российской Федерации от 16.09.2020 № 1479.'),
            h1('2 Пожарно-технические характеристики материалов'),
            mark('{{ТАБЛИЦА:ПБ_МАТЕРИАЛЫ}}'),
            h1('3 Мероприятия при производстве работ'),
            mark('{{БЛОК:ПБ_РАБОТЫ}}')]

def vol_tbe():
    return [h1('1 Условия безопасной эксплуатации'),
            mark('{{БЛОК:ТБЭ_УСЛОВИЯ}}'),
            h1('2 Предельные нагрузки и расстояния'),
            tx('В процессе эксплуатации не допускается превышение значений, приведённых в таблице. Размещение дополнительных кабелей и оборудования на опорах выполняется только при подтверждении расчётом.'),
            mark('{{ТАБЛИЦА:ПРЕДЕЛЬНЫЕ_ЗНАЧЕНИЯ}}'),
            h1('3 Осмотры и техническое обслуживание'),
            mark('{{БЛОК:ОСМОТРЫ}}'),
            h1('4 Срок службы'),
            tx('Нормативный срок службы кабеля — {{КАБЕЛЬ_СРОК_СЛУЖБЫ}} лет.')]

def vol_sm():
    return [mark('{{ЕСЛИ:СМЕТА_РАЗРАБАТЫВАЕТСЯ}}'),
            h1('1 Пояснительная записка к сметной документации'),
            mark('{{БЛОК:СМЕТА}}'),
            mark('{{КОНЕЦ}}'),
            mark('{{ЕСЛИ:СМЕТА_НЕ_РАЗРАБАТЫВАЕТСЯ}}'),
            h1('1 Обоснование'),
            mark('{{БЛОК:СМЕТА_НЕ_РАЗРАБАТЫВАЕТСЯ}}'),
            mark('{{КОНЕЦ}}')]

def vol_id():
    return [h1('1 Расчёты'),
            mark('{{БЛОК:РАСЧЁТЫ_СЛЕД}}'),
            h1('2 Метрологическое обеспечение'),
            tx('Раздел выполнен с учётом требований к метрологической экспертизе проектной документации: для каждого контролируемого параметра приведены номинальное значение, допуск, нормативный документ, методика и периодичность контроля, требования к средствам измерений.'),
            mark('{{ТАБЛИЦА:МЕТРОЛОГИЯ}}'),
            h1('3 Отчёт по пункту 13 Правил'),
            tx('Отчёт от {{ОТЧЁТ_П13_ДАТА}} № {{ОТЧЁТ_П13_НОМЕР}} включён в состав исходных данных (контрольная сумма SHA-256 файла: {{ОТЧЁТ_П13_ХЭШ}}).'),
            mark('{{ЕСЛИ:ПРОФИЛЬ_ВЫМПЕЛКОМ}}'),
            h1('4 Акт выбора трассы'),
            mark('{{БЛОК:АКТ_ВЫБОРА_ТРАССЫ}}'),
            mark('{{КОНЕЦ}}'),
            h1('5 Лист внутреннего контроля'),
            mark('{{ТАБЛИЦА:АУДИТ}}')]

def vol_rd():
    return [
        h1('1 Общие указания'),
        tx('Рабочая документация разработана на основании проектной документации {{ОБОЗНАЧЕНИЕ_ПД}} в соответствии с ГОСТ Р 21.101-2020 и ГОСТ Р 21.703-2020.'),
        mark('{{БЛОК:ОБЩИЕ_УКАЗАНИЯ}}'),
        tx('Технические решения, принятые в рабочей документации, соответствуют требованиям законодательства Российской Федерации, действующих технических регламентов, стандартов, сводов правил и технических требований ПАО «Россети» (ТТ № 282р).'),
        tx('Главный инженер проекта ________________ {{ГИП_ФИО}}'),
        h1('2 Ведомость рабочих чертежей основного комплекта'),
        mark('{{ТАБЛИЦА:ВЕДОМОСТЬ_ЛИСТОВ}}'),
        h1('3 Ведомость ссылочных и прилагаемых документов'),
        mark('{{ТАБЛИЦА:НОРМЫ}}'),
        h1('4 Ведомость опор'),
        mark('{{ТАБЛИЦА:ОПОРЫ}}'),
        h1('5 Ведомость пролётов'),
        mark('{{ТАБЛИЦА:ПРОЛЁТЫ}}'),
        h1('6 Ведомость пересечений'),
        mark('{{ТАБЛИЦА:ПЕРЕСЕЧЕНИЯ}}'),
        h1('7 Ведомость узлов крепления и арматуры'),
        mark('{{ТАБЛИЦА:УЗЛЫ}}'),
        h1('8 Ведомость муфт, шкафов и запасов'),
        mark('{{ТАБЛИЦА:МУФТЫ}}'),
        h1('9 Ведомость контролируемых параметров'),
        mark('{{ТАБЛИЦА:МЕТРОЛОГИЯ}}'),
        h1('10 Ведомость координат характерных точек'),
        mark('{{ТАБЛИЦА:КООРДИНАТЫ}}'),
        h1('11 Спецификация оборудования, изделий и материалов'),
        mark('{{ТАБЛИЦА:СПЕЦИФИКАЦИЯ}}'),
        h1('12 Ведомость объёмов работ'),
        mark('{{ТАБЛИЦА:ВОР}}'),
        h1('13 Требования к исполнительной документации'),
        mark('{{БЛОК:ИСПОЛНИТЕЛЬНАЯ}}'),
        h1('14 Лист согласования владельцем ВЛ'),
        mark('{{БЛОК:СОГЛАСОВАНИЕ_ВЛАДЕЛЬЦА}}'),
    ]

VOLUMES = [
    # file, код, № раздела, наименование, pd?, builder
    ('tpl_pz.docx',  'ПЗ',  '1',  'Раздел 1. Пояснительная записка', True, vol_pz),
    ('tpl_ppo.docx', 'ППО', '2',  'Раздел 2. Проект полосы отвода', True, vol_ppo),
    ('tpl_tkr.docx', 'ТКР', '3',  'Раздел 3. Технологические и конструктивные решения линейного объекта. Искусственные сооружения', True, vol_tkr),
    ('tpl_ilo.docx', 'ИЛО', '4',  'Раздел 4. Здания, строения и сооружения, входящие в инфраструктуру линейного объекта', True, vol_ilo),
    ('tpl_pos.docx', 'ПОС', '5',  'Раздел 5. Проект организации строительства', True, vol_pos),
    ('tpl_oos.docx', 'ООС', '6',  'Раздел 6. Мероприятия по охране окружающей среды', True, vol_oos),
    ('tpl_pb.docx',  'ПБ',  '7',  'Раздел 7. Мероприятия по обеспечению пожарной безопасности', True, vol_pb),
    ('tpl_tbe.docx', 'ТБЭ', '8',  'Раздел 8. Требования к обеспечению безопасной эксплуатации линейного объекта', True, vol_tbe),
    ('tpl_sm.docx',  'СМ',  '9',  'Раздел 9. Смета на строительство', True, vol_sm),
    ('tpl_id.docx',  'ИД',  '10', 'Раздел 10. Иная документация', True, vol_id),
    ('tpl_rd.docx',  'ЛКС', '',   'Линейно-кабельные сооружения. Размещение ВОЛС на опорах ВЛ. Общие данные и ведомости', False, vol_rd),
]

# ------------------------------------------------------------------ пакет
def styles_xml():
    def st(sid, name, ppr='', rpr='', based='Normal', nxt=None, outline=None):
        o = f'<w:outlineLvl w:val="{outline}"/>' if outline is not None else ''
        return (f'<w:style w:type="paragraph" w:styleId="{sid}"><w:name w:val="{name}"/>'
                f'<w:basedOn w:val="{based}"/>' + (f'<w:next w:val="{nxt}"/>' if nxt else '') +
                f'<w:qFormat/><w:pPr>{ppr}{o}</w:pPr><w:rPr>{rpr}</w:rPr></w:style>')
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            f'<w:styles {NS}>'
            f'<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:cs="{FONT}" w:eastAsia="{FONT}"/>'
            '<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault>'
            '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
            '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
            + st('Body', 'PD Текст', '<w:spacing w:after="60"/><w:ind w:firstLine="709"/><w:jc w:val="both"/>')
            + st('ListDash', 'PD Перечисление', '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:spacing w:after="40"/><w:ind w:left="1060" w:hanging="351"/><w:jc w:val="both"/>')
            + st('Heading1', 'heading 1', '<w:keepNext/><w:spacing w:before="240" w:after="120"/><w:ind w:firstLine="709"/>', '<w:b/><w:sz w:val="28"/><w:szCs w:val="28"/>', nxt='Body', outline=0)
            + st('Heading2', 'heading 2', '<w:keepNext/><w:spacing w:before="180" w:after="80"/><w:ind w:firstLine="709"/>', '<w:b/>', nxt='Body', outline=1)
            + st('Marker', 'PD Поле-заполнитель', '<w:spacing w:before="60" w:after="60"/>', '<w:color w:val="1F5F99"/><w:sz w:val="20"/><w:shd w:val="clear" w:color="auto" w:fill="E7EFF7"/>')
            + st('Hint', 'PD Подсказка', '<w:spacing w:after="60"/><w:ind w:left="709"/>', '<w:i/><w:color w:val="8A5A00"/><w:sz w:val="20"/>')
            + st('TitleSmall', 'PD Титул', '<w:spacing w:after="60"/><w:jc w:val="center"/>', '<w:sz w:val="24"/>')
            + st('TitleObject', 'PD Титул объект', '<w:spacing w:after="120"/><w:jc w:val="center"/>', '<w:b/><w:sz w:val="32"/>')
            + st('TitleStage', 'PD Титул стадия', '<w:spacing w:after="120"/><w:jc w:val="center"/>', '<w:b/><w:caps/><w:sz w:val="36"/>')
            + st('TitleVolume', 'PD Титул раздел', '<w:spacing w:after="120"/><w:jc w:val="center"/>', '<w:sz w:val="30"/>')
            + st('TitleCode', 'PD Титул обозначение', '<w:spacing w:after="120"/><w:jc w:val="center"/>', '<w:b/><w:sz w:val="36"/>')
            + '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/>'
              '<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/>'
              '<w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/>'
              '</w:tblCellMar></w:tblPr></w:style>'
            + '</w:styles>')

NUMBERING = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
             f'<w:numbering {NS}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/>'
             '<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="–"/><w:lvlJc w:val="left"/>'
             '<w:pPr><w:ind w:left="1060" w:hanging="351"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:lvl>'
             '</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>')

SETTINGS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            f'<w:settings {NS}><w:defaultTabStop w:val="709"/>'
            '<w:characterSpacingControl w:val="doNotCompress"/><w:updateFields w:val="true"/><w:compat><w:compatSetting w:name="compatibilityMode" '
            'w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>')

CT = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      '<Default Extension="xml" ContentType="application/xml"/>'
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
      + ''.join(f'<Override PartName="/word/{n}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.{t}+xml"/>'
                for n, t in [('header1', 'header'), ('header2', 'header'), ('footer1', 'footer'), ('footer2', 'footer'), ('footer3', 'footer')])
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
      '</Types>')

RELS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
        '</Relationships>')

DOC_RELS = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rSt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            '<Relationship Id="rNum" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'
            '<Relationship Id="rSet" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
            '<Relationship Id="rH1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
            '<Relationship Id="rH2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header2.xml"/>'
            '<Relationship Id="rF1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
            '<Relationship Id="rF2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/>'
            '<Relationship Id="rF3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer3.xml"/>'
            '</Relationships>')

def sect_title():
    # титульный лист: пустые колонтитулы
    return ('<w:sectPr><w:headerReference w:type="default" r:id="rH1"/><w:footerReference w:type="default" r:id="rF1"/>'
            f'<w:pgSz w:w="{tw(210)}" w:h="{tw(297)}"/>'
            f'<w:pgMar w:top="{tw(15)}" w:right="{tw(10)}" w:bottom="{tw(15)}" w:left="{tw(25)}" w:header="{tw(5)}" w:footer="{tw(5)}" w:gutter="0"/>'
            '</w:sectPr>')

def sect_main():
    # рамка 20/5/5/5; текст внутри рамки; форма 5 на первом листе раздела, форма 6 — далее
    return ('<w:sectPr><w:headerReference w:type="default" r:id="rH2"/><w:headerReference w:type="first" r:id="rH2"/>'
            '<w:footerReference w:type="default" r:id="rF3"/><w:footerReference w:type="first" r:id="rF2"/>'
            '<w:type w:val="nextPage"/>'
            f'<w:pgSz w:w="{tw(210)}" w:h="{tw(297)}"/>'
            f'<w:pgMar w:top="{tw(15)}" w:right="{tw(10)}" w:bottom="{tw(22)}" w:left="{tw(25)}" w:header="{tw(5)}" w:footer="{tw(5)}" w:gutter="0"/>'
            '<w:titlePg/></w:sectPr>')

def build(fname, code, num, vtitle, pd, fn):
    fields_note = ''
    body = (title_page(vtitle, pd)
            + f'<w:p><w:pPr>{sect_title()}</w:pPr></w:p>'
            + contents_block()
            + ''.join(fn())
            + sect_main())
    doc = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
           f'<w:document {NS}><w:body>{body}</w:body></w:document>')
    now = datetime.datetime(2026, 1, 1).strftime('%Y-%m-%dT%H:%M:%SZ')
    core = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
            'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            f'<dc:title>{escape(vtitle)}</dc:title><dc:creator>PD_RD</dc:creator>'
            f'<dc:description>Шаблон PD_RD {VERSION}; код тома {code}; раздел ПД {num or "—"}</dc:description>'
            f'<dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created></cp:coreProperties>')
    app = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
           '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">'
           f'<Application>PD_RD {VERSION}</Application></Properties>')
    path = os.path.join(ROOT, fname)
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        def w(n, s):
            zi = zipfile.ZipInfo(n, date_time=(2026, 1, 1, 0, 0, 0)); zi.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(zi, s)
        w('[Content_Types].xml', CT)
        w('_rels/.rels', RELS)
        w('docProps/core.xml', core)
        w('docProps/app.xml', app)
        w('word/_rels/document.xml.rels', DOC_RELS)
        w('word/document.xml', doc)
        w('word/styles.xml', styles_xml())
        w('word/numbering.xml', NUMBERING)
        w('word/settings.xml', SETTINGS)
        w('word/header1.xml', header_empty())
        w('word/header2.xml', header_frame())
        w('word/footer1.xml', hdr_xml('ftr', '<w:p/>'))
        w('word/footer2.xml', footer(form5()))
        w('word/footer3.xml', footer(form6()))
    return path

def main():
    out = []
    for v in VOLUMES:
        out.append(build(*v))
    print('\n'.join(os.path.relpath(p, ROOT) for p in out))

if __name__ == '__main__':
    main()
