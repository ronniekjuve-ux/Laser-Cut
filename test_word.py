# -*- coding: utf-8 -*-
"""Тест: что создает Word при сохранении DOC → HTML"""
import tempfile
import time
from pathlib import Path

try:
    import win32com.client
except ImportError:
    print("pip install pywin32")
    exit(1)

# Берем любой DOC файл из папки uploads
uploads = Path("data/uploads")
doc_files = list(uploads.glob("*.doc"))

if not doc_files:
    print("Нет DOC файлов в data/uploads/")
    exit(1)

doc_path = doc_files[0]
print(f"Тестирую: {doc_path.name}")

with tempfile.TemporaryDirectory() as tmpdir:
    tmpdir = Path(tmpdir)
    
    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    
    doc = word.Documents.Open(str(doc_path.absolute()))
    html_path = tmpdir / f"{doc_path.stem}.html"
    doc.SaveAs2(str(html_path), FileFormat=10)
    doc.Close(False)
    word.Quit()
    
    time.sleep(1)
    
    print(f"\nВсе файлы в tmpdir:")
    for f in sorted(tmpdir.rglob("*")):
        if f.is_file():
            rel = f.relative_to(tmpdir)
            print(f"  {rel} ({f.stat().st_size} байт)")
    
    # Проверяем HTML
    html_files = list(tmpdir.glob("*.html"))
    if html_files:
        content = html_files[0].read_text(encoding='utf-8', errors='ignore')
        import re
        imgs = re.findall(r'<img[^>]+src=["\']([^"\']+)', content)
        print(f"\nТеги <img> в HTML: {len(imgs)}")
        for img in imgs:
            print(f"  {img}")
