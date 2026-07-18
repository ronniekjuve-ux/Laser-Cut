# -*- coding: utf-8 -*-
"""
Локальный конвертер DOC → HTML через Microsoft Word.
Запуск: python local_convert.py <путь_к_файлу.doc> [выходная_папка]

Использует win32com для открытия DOC в Word и сохранения как HTML.
Затем извлекает GIF изображения из созданной папки *_files.
"""
import os
import sys
import re
import shutil
import tempfile
from pathlib import Path

try:
    import win32com.client
except ImportError:
    print("❌ Требуется pywin32: pip install pywin32")
    sys.exit(1)


def convert_doc_to_html_via_word(doc_path: str, output_dir: str = None) -> dict:
    """
    Конвертирует DOC → HTML через Microsoft Word и извлекает изображения.
    
    Args:
        doc_path: Путь к DOC файлу
        output_dir: Папка для сохранения изображений (по умолчанию ./converted_images)
    
    Returns:
        dict с результатами конвертации
    """
    doc_path = Path(doc_path).absolute()
    if not doc_path.exists():
        return {"error": f"Файл не найден: {doc_path}"}

    if output_dir is None:
        output_dir = Path.cwd() / "converted_images"
    else:
        output_dir = Path(output_dir)
    
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"📂 Файл: {doc_path}")
    print(f"📁 Выходная папка: {output_dir}")

    # Создаем временную папку для HTML
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        
        print("🔄 Открываю Word...")
        word = win32com.client.Dispatch("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0

        try:
            print(f"📄 Открываю документ: {doc_path.name}")
            doc = word.Documents.Open(str(doc_path))
            
            # Сохраняем как HTML
            html_path = tmpdir / f"{doc_path.stem}.html"
            print(f"💾 Сохраняю как HTML: {html_path}")
            doc.SaveAs2(str(html_path), FileFormat=10)  # 10 = wdFormatHTML
            doc.Close(False)
            print("✅ HTML сохранён")
        except Exception as e:
            print(f"❌ Ошибка Word: {e}")
            return {"error": str(e)}
        finally:
            word.Quit()
            print("🔒 Word закрыт")

        # Ищем папку с изображениями
        stem = html_path.stem
        files_dir = tmpdir / f"{stem}_files"
        
        if not files_dir.exists():
            # Ищем любую папку *_files
            for d in tmpdir.glob("*_files"):
                if d.is_dir():
                    files_dir = d
                    break

        # Собираем изображения
        IMG_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.emf', '.wmf'}
        images = []

        # 1. Из папки *_files
        if files_dir.exists():
            print(f"📁 Найдена папка: {files_dir.name}")
            for img_file in files_dir.iterdir():
                if img_file.is_file() and img_file.suffix.lower() in IMG_EXTS:
                    dest = output_dir / img_file.name
                    shutil.copy2(img_file, dest)
                    images.append({
                        "name": img_file.name,
                        "size": img_file.stat().st_size,
                        "path": str(dest)
                    })
                    print(f"   ✅ {img_file.name} ({img_file.stat().st_size} байт)")
        else:
            print("⚠️ Папка *_files не найдена")

        # 2. Из корня tmpdir (на случай если GIF рядом с HTML)
        for img_file in tmpdir.iterdir():
            if img_file.is_file() and img_file.suffix.lower() in IMG_EXTS:
                if not any(i["name"] == img_file.name for i in images):
                    dest = output_dir / img_file.name
                    shutil.copy2(img_file, dest)
                    images.append({
                        "name": img_file.name,
                        "size": img_file.stat().st_size,
                        "path": str(dest)
                    })
                    print(f"   ✅ {img_file.name} (из корня)")

        # Читаем HTML для анализа
        html_content = html_path.read_text(encoding='utf-8', errors='ignore')
        img_tags = re.findall(r'<img[^>]+src=["\']([^"\']+)', html_content)

        result = {
            "filename": doc_path.name,
            "output_dir": str(output_dir),
            "images_found": len(images),
            "images": images,
            "img_tags_in_html": len(img_tags),
            "img_tag_srcs": img_tags[:10]
        }

        print(f"\n📊 Результат:")
        print(f"   Изображений найдено: {len(images)}")
        print(f"   Тегов <img> в HTML: {len(img_tags)}")
        print(f"   Сохранено в: {output_dir}")

        return result


def main():
    if len(sys.argv) < 2:
        print("Использование: python local_convert.py <путь_к_файлу.doc> [выходная_папка]")
        print("\nПримеры:")
        print('  python local_convert.py "C:\\Docs\\раскладка.doc"')
        print('  python local_convert.py samples/8мм001.Cnf.DOC ./images')
        sys.exit(1)

    filepath = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None

    result = convert_doc_to_html_via_word(filepath, output_dir)

    if "error" in result:
        print(f"\n❌ Ошибка: {result['error']}")
        sys.exit(1)
    else:
        print(f"\n✅ Готово! Изображения сохранены в: {result['output_dir']}")


if __name__ == "__main__":
    main()
