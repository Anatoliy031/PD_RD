"""PD_RD — упаковка изображений типовых листов филиала в pdrd-typical-img.js.
Источник: build/typical/*.jpg (образцы заказчика из «Добавить.docx»; на листах
«natyazhnoe» и «podderzh» убран фрагмент основной надписи другого объекта).
Запуск: python3 build/b4_typical_images.py"""
import base64, json, os
from PIL import Image
here = os.path.dirname(os.path.abspath(__file__))
out = {}
for f in sorted(os.listdir(os.path.join(here, 'typical'))):
    if not f.endswith('.jpg'): continue
    p = os.path.join(here, 'typical', f)
    w, h = Image.open(p).size
    out[f[:-4]] = {'w': w, 'h': h, 'src': 'data:image/jpeg;base64,' + base64.b64encode(open(p, 'rb').read()).decode()}
js = ('/* PD_RD — изображения типовых листов филиала (образцы заказчика, без перерисовки).\n'
      '   Сформировано build/b4_typical_images.py — не править вручную. */\n'
      '(function (g) { g.PDRD_TYPICAL_IMG = ' + json.dumps(out) + '; })(typeof window !== "undefined" ? window : globalThis);\n')
open(os.path.join(here, '..', 'pdrd-typical-img.js'), 'w').write(js)
print({k: (v['w'], v['h']) for k, v in out.items()}, len(js))
