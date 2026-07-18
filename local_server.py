# -*- coding: utf-8 -*-
"""
Локальный сервер для конвертации DOC → HTML через Microsoft Word.
Запуск: python local_server.py

Сервер запускается на порту 8001 и предоставляет API для:
- POST /convert - конвертация DOC файла через Word
- GET /images/<filename> - получение изображения

Используйте вместе с фронтендом (localhost:3000) для тестирования.
"""
import os
import sys
import re
import json
import shutil
import tempfile
import subprocess
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

try:
    import win32com.client
    WIN32_AVAILABLE = True
except ImportError:
    WIN32_AVAILABLE = False
    print("⚠️ pywin32 не установлен. Используйте: pip install pywin32")

# Папка для хранения изображений
IMAGES_DIR = Path(__file__).parent / "local_images"
IMAGES_DIR.mkdir(exist_ok=True)


def convert_doc_to_html(doc_path: str) -> dict:
    """Конвертирует DOC → HTML через Word и извлекает изображения."""
    doc_path = Path(doc_path).absolute()
    if not doc_path.exists():
        return {"error": f"Файл не найден: {doc_path}"}

    if not WIN32_AVAILABLE:
        return {"error": "pywin32 не установлен. Запустите: pip install pywin32"}

    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)

        # Открываем Word
        word = win32com.client.Dispatch("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0

        try:
            doc = word.Documents.Open(str(doc_path))
            html_path = tmpdir / f"{doc_path.stem}.html"
            doc.SaveAs2(str(html_path), FileFormat=10)  # wdFormatHTML
            doc.Close(False)
        except Exception as e:
            return {"error": f"Ошибка Word: {e}"}
        finally:
            word.Quit()

        # Ищем изображения
        IMG_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.emf', '.wmf'}
        images = []

        # Ищем папку *_files
        for files_dir in tmpdir.glob("*_files"):
            if files_dir.is_dir():
                for img_file in files_dir.iterdir():
                    if img_file.is_file() and img_file.suffix.lower() in IMG_EXTS:
                        dest = IMAGES_DIR / img_file.name
                        shutil.copy2(img_file, dest)
                        images.append({
                            "name": img_file.name,
                            "size": img_file.stat().st_size,
                            "url": f"http://localhost:8001/images/{img_file.name}"
                        })

        # Из корня tmpdir
        for img_file in tmpdir.iterdir():
            if img_file.is_file() and img_file.suffix.lower() in IMG_EXTS:
                if not any(i["name"] == img_file.name for i in images):
                    dest = IMAGES_DIR / img_file.name
                    shutil.copy2(img_file, dest)
                    images.append({
                        "name": img_file.name,
                        "size": img_file.stat().st_size,
                        "url": f"http://localhost:8001/images/{img_file.name}"
                    })

        # Анализ HTML
        html_files = list(tmpdir.glob("*.html"))
        img_tags = []
        if html_files:
            html_content = html_files[0].read_text(encoding='utf-8', errors='ignore')
            img_tags = re.findall(r'<img[^>]+src=["\']([^"\']+)', html_content)

        return {
            "filename": doc_path.name,
            "images_found": len(images),
            "images": images,
            "img_tags_in_html": len(img_tags),
            "img_tag_srcs": img_tags[:10]
        }


class ConvertHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/convert':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data)
                doc_path = data.get('path')
                
                if not doc_path:
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "path is required"}).encode())
                    return

                result = convert_doc_to_html(doc_path)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(result).encode())
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/images/'):
            filename = self.path.split('/')[-1]
            file_path = IMAGES_DIR / filename
            
            if file_path.exists():
                self.send_response(200)
                content_type = {
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.bmp': 'image/bmp',
                }.get(file_path.suffix.lower(), 'application/octet-stream')
                self.send_header('Content-Type', content_type)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(file_path.read_bytes())
            else:
                self.send_response(404)
                self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")


def main():
    port = 8001
    server = HTTPServer(('localhost', port), ConvertHandler)
    print(f"🚀 Локальный сервер запущен: http://localhost:{port}")
    print(f"📁 Изображения: {IMAGES_DIR}")
    print(f"\nИспользование:")
    print(f"  1. Откройте фронтенд: http://localhost:3000/api/v1/images/debug/test")
    print(f"  2. Или вызовите API: curl -X POST -d '{{\"path\": \"C:\\\\doc.doc\"}}' http://localhost:{port}/convert")
    print(f"\nНажмите Ctrl+C для остановки")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Сервер остановлен")
        server.server_close()


if __name__ == "__main__":
    main()
