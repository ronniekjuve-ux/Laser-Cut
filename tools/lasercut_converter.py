# -*- coding: utf-8 -*-
"""
LaserCut Local Converter — converts DOC layouts to GIF images using Microsoft Word.
Packaged as a standalone .exe via PyInstaller.

Usage:
  Double-click lasercut_converter.exe
  
  Or: python lasercut_converter.py
  
The server starts on http://localhost:8001 and:
  - Converts DOC files to GIF using Microsoft Word
  - Saves images to data/images/ folder
  - Returns image URLs for the web application
"""
import os
import sys
import re
import time
import json
import shutil
import hashlib
import tempfile
import threading
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

try:
    import pythoncom
    import win32com.client
except ImportError:
    print("ERROR: pywin32 not installed. Run: pip install pywin32")
    sys.exit(1)

# Find project root (same directory as exe or script)
if getattr(sys, 'frozen', False):
    # Running as exe
    PROJECT_ROOT = Path(sys.executable).parent
else:
    # Running as script
    PROJECT_ROOT = Path(__file__).parent

DATA_DIR = PROJECT_ROOT / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
IMAGES_DIR = DATA_DIR / "images"
LOG_FILE = PROJECT_ROOT / "converter.log"
PORT = 8001

IMG_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.emf', '.wmf'}


def log(msg):
    ts = time.strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    except Exception:
        pass


def convert_doc_to_gif(doc_path: Path) -> dict:
    """Convert DOC to HTML using Word, extract GIF images."""
    log(f"Converting: {doc_path.name}")

    pythoncom.CoInitialize()
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir = Path(tmpdir)

            word = win32com.client.Dispatch("Word.Application")
            word.Visible = False
            word.DisplayAlerts = 0

            try:
                doc = word.Documents.Open(str(doc_path.absolute()))
                html_path = tmpdir / f"{doc_path.stem}.html"
                doc.SaveAs2(str(html_path), FileFormat=10)  # wdFormatHTML
                doc.Close(False)
            except Exception as e:
                log(f"Word error: {e}")
                return {"error": str(e)}
            finally:
                word.Quit()

            time.sleep(0.5)

            # Find all images
            all_images = {}
            for d in tmpdir.glob("*_files"):
                if d.is_dir():
                    for f in d.iterdir():
                        if f.is_file() and f.suffix.lower() in IMG_EXTS:
                            all_images[f.name] = f
            for f in tmpdir.iterdir():
                if f.is_file() and f.suffix.lower() in IMG_EXTS:
                    if f.name not in all_images:
                        all_images[f.name] = f

            if not all_images:
                log("No images found in DOC")
                return {"error": "No images found"}

            # Save images to data/images/
            IMAGES_DIR.mkdir(parents=True, exist_ok=True)
            saved = []
            stem = doc_path.stem.replace(" ", "_").replace(".", "_")

            for name, src in all_images.items():
                dest_name = f"{stem}_{name}"
                dest = IMAGES_DIR / dest_name
                shutil.copy2(src, dest)
                saved.append({
                    "name": dest_name,
                    "size": dest.stat().st_size,
                    "url": f"/api/v1/images/{dest_name}"
                })
                log(f"  Saved: {dest_name} ({dest.stat().st_size} bytes)")

            log(f"Converted: {doc_path.name} -> {len(saved)} images")
            return {"images": saved, "count": len(saved)}
    finally:
        pythoncom.CoUninitialize()


class ConverterHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/convert':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)

            try:
                data = json.loads(post_data)
                doc_path = data.get('path')

                if not doc_path:
                    self.send_json(400, {"error": "path is required"})
                    return

                doc_path = Path(doc_path)
                if not doc_path.exists():
                    self.send_json(404, {"error": f"File not found: {doc_path}"})
                    return

                result = convert_doc_to_gif(doc_path)
                self.send_json(200, result)

            except Exception as e:
                log(f"Error: {e}")
                self.send_json(500, {"error": str(e)})
        else:
            self.send_json(404, {"error": "Not found"})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            self.send_json(200, {"status": "ok", "word": True})
        elif self.path.startswith('/images/'):
            filename = self.path.split('/')[-1]
            file_path = IMAGES_DIR / filename
            if file_path.exists():
                self.send_response(200)
                ext = file_path.suffix.lower()
                ct = {'.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.bmp': 'image/bmp'}.get(ext, 'application/octet-stream')
                self.send_header('Content-Type', ct)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(file_path.read_bytes())
            else:
                self.send_json(404, {"error": "Not found"})
        else:
            self.send_json(200, {
                "name": "LaserCut Converter",
                "version": "1.0",
                "endpoints": {
                    "POST /convert": "Convert DOC file (JSON: {path: '/path/to/file.doc'})",
                    "GET /health": "Health check",
                    "GET /images/<name>": "Get converted image"
                }
            })

    def send_json(self, code, data):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def log_message(self, format, *args):
        pass  # Suppress default logging


def main():
    log("=" * 50)
    log("LaserCut Local Converter v1.0")
    log(f"Data directory: {DATA_DIR}")
    log(f"Images directory: {IMAGES_DIR}")
    log("=" * 50)

    # Create directories
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    # Check Word
    pythoncom.CoInitialize()
    try:
        w = win32com.client.Dispatch("Word.Application")
        w.Quit()
        log("Microsoft Word: OK")
    except Exception as e:
        log(f"Microsoft Word: NOT FOUND ({e})")
        log("Please install Microsoft Word")
        sys.exit(1)
    finally:
        pythoncom.CoUninitialize()

    # Start server
    server = HTTPServer(('0.0.0.0', PORT), ConverterHandler)
    log(f"Server running on http://localhost:{PORT}")
    log("Ready to convert DOC files!")
    log("Press Ctrl+C to stop")
    print(f"\n{'='*50}")
    print(f"  LaserCut Converter running on port {PORT}")
    print(f"  Close this window to stop")
    print(f"{'='*50}\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("Stopped")
        server.server_close()


if __name__ == "__main__":
    main()
