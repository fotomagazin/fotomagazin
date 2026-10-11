"""Собирает архив для скачивания: dist/fotomagazin.zip → папка «Фотомагазин» с программой и инструкцией.

Запуск из корня проекта:  python3 tools/make-zip.py
- номер версии берётся из APP_BUILD в app/fotomagazin.html и подставляется в инструкцию;
- инструкция сохраняется в UTF-8 с BOM и переводами строк Windows — так русский текст
  правильно открывается и в Блокноте на Windows, и в TextEdit на Mac;
- имена файлов в архиве помечены как UTF-8 (Python делает это сам), чтобы не было «кракозябр».
"""
import re, zipfile, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
app = (ROOT / 'app' / 'fotomagazin.html').read_bytes()
version = re.search(rb"const APP_BUILD = '([\d.]+)'", app).group(1).decode()
guide = (ROOT / 'app' / 'Как пользоваться.txt').read_text(encoding='utf-8').replace('{VERSION}', version)
guide = '﻿' + guide.replace('\r\n', '\n').replace('\n', '\r\n')

out = ROOT / 'dist' / 'fotomagazin.zip'
out.parent.mkdir(exist_ok=True)
stamp = time.localtime()[:6]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    def add(name, data):
        info = zipfile.ZipInfo('Фотомагазин/' + name, stamp)
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        z.writestr(info, data)
    add('fotomagazin.html', app)
    add('Как пользоваться.txt', guide.encode('utf-8'))
print(f'{out.relative_to(ROOT)} — версия {version}, {out.stat().st_size // 1024} КБ')
