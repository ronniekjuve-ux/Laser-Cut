# -*- coding: utf-8 -*-
"""
Автоконвертер DOC файлов через Microsoft Word.
Следит за data/uploads/ и конвертирует DOC → HTML → GIF.
"""
import os
import sys
import re
import time
import json
import shutil
import hashlib
import tempfile
from pathlib import Path

try:
    import win32com.client
    import pythoncom
except ImportError:
    print("Требуется: pip install pywin32")
    sys.exit(1)

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
except ImportError:
    print("Требуется: pip install watchdog")
    sys.exit(1)

PROJECT_ROOT = Path(__file__).parent
UPLOADS_DIR = PROJECT_ROOT / "data" / "uploads"
IMAGES_DIR = PROJECT_ROOT / "data" / "images"
LOG_FILE = PROJECT_ROOT / "convert.log"
IMG_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.emf', '.wmf'}


def log(msg: str):
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")


def wait_file(filepath: Path, timeout=10) -> bool:
    prev = -1
    for _ in range(timeout * 2):
        try:
            cur = filepath.stat().st_size
            if cur == prev and cur > 0:
                return True
            prev = cur
        except FileNotFoundError:
            return False
        time.sleep(0.5)
    return False


def convert_doc(doc_path: Path) -> dict:
    """Конвертирует DOC → HTML через Word, извлекает GIF."""
    log(f"🔄 {doc_path.name}")

    if not wait_file(doc_path):
        log(f"⚠️ Файл не готов: {doc_path.name}")
        return {"error": "not ready"}

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
                doc.SaveAs2(str(html_path), FileFormat=10)
                doc.Close(False)
            except Exception as e:
                log(f"❌ Word: {e}")
                return {"error": str(e)}
            finally:
                word.Quit()

            time.sleep(0.5)

            # Логируем что создал Word
            for f in tmpdir.rglob("*"):
                if f.is_file():
                    log(f"   📄 {f.name} ({f.stat().st_size} байт)")

            # Ищем изображения
            images = []

            # 1. Из папки *_files
            for d in tmpdir.glob("*_files"):
                if d.is_dir():
                    for f in d.iterdir():
                        if f.is_file() and f.suffix.lower() in IMG_EXTS:
                            images.append(f)
                            log(f"   🖼️ Из _files: {f.name}")

            # 2. Из корня tmpdir
            for f in tmpdir.iterdir():
                if f.is_file() and f.suffix.lower() in IMG_EXTS:
                    if not any(i.name == f.name for i in images):
                        images.append(f)
                        log(f"   🖼️ Из корня: {f.name}")

            # 3. Fallback: rglob всех файлов
            if not images:
                for f in tmpdir.rglob("*"):
                    if f.is_file() and f.suffix.lower() in IMG_EXTS:
                        if not any(i.name == f.name for i in images):
                            images.append(f)
                            log(f"   🖼️ Из rglob: {f.relative_to(tmpdir)}")

            log(f"   Найдено: {len(images)} изображений")

            # Копируем
            IMAGES_DIR.mkdir(parents=True, exist_ok=True)
            saved = []
            for img in images:
                prefix = doc_path.stem.replace(" ", "_").replace(".", "_")
                name = f"{prefix}_{img.name}"
                dest = IMAGES_DIR / name
                shutil.copy2(img, dest)
                saved.append(name)
                log(f"   📷 {name} ({dest.stat().st_size} байт)")

            if saved:
                log(f"✅ {doc_path.name} → {len(saved)} изображений")
            else:
                log(f"⚠️ {doc_path.name} → нет изображений")

            return {"images": saved, "count": len(saved)}
    finally:
        pythoncom.CoUninitialize()


class DocHandler(FileSystemEventHandler):
    def __init__(self):
        self.seen = set()

    def on_created(self, event):
        if not event.is_directory:
            self._handle(Path(event.src_path))

    def on_modified(self, event):
        if not event.is_directory:
            self._handle(Path(event.src_path))

    def _handle(self, fp: Path):
        if fp.suffix.lower() != '.doc':
            return
        if fp.name.startswith('~$'):
            return
        try:
            h = hashlib.md5(fp.read_bytes()).hexdigest()
        except:
            return
        if h in self.seen:
            return
        self.seen.add(h)
        try:
            convert_doc(fp)
        except Exception as e:
            log(f"❌ {fp.name}: {e}")


def main():
    log("=" * 50)
    log("🚀 Автоконвертер Word")
    log(f"📁 Слежение: {UPLOADS_DIR}")
    log(f"📷 Изображения: {IMAGES_DIR}")
    log("=" * 50)

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    # Проверяем Word
    pythoncom.CoInitialize()
    try:
        w = win32com.client.Dispatch("Word.Application")
        w.Quit()
        log("✅ Word доступен")
    except Exception as e:
        log(f"❌ Word: {e}")
        sys.exit(1)
    finally:
        pythoncom.CoUninitialize()

    handler = DocHandler()
    obs = Observer()
    obs.schedule(handler, str(UPLOADS_DIR), recursive=False)
    obs.start()
    log("👀 Слежение запущено!")

    # Конвертируем существующие файлы
    for f in UPLOADS_DIR.glob("*.doc"):
        if not f.name.startswith('~$'):
            try:
                h = hashlib.md5(f.read_bytes()).hexdigest()
                if h not in handler.seen:
                    handler.seen.add(h)
                    convert_doc(f)
            except Exception as e:
                log(f"❌ {f.name}: {e}")

    log("⏳ Ожидание новых файлов...")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        obs.stop()
    obs.join()


if __name__ == "__main__":
    main()
