# -*- coding: utf-8 -*-
"""
Локальный скрипт для тестирования извлечения изображений из DOC файлов.
Запуск: python test_extract_local.py <путь_к_файлу.doc>

Извлекает изображения (GIF) из DOC файла через win32com и сохраняет их локально.
"""
import os
import sys
import re
import shutil
import tempfile
from pathlib import Path


def extract_images_local(filepath: str, output_dir: str = None):
    """
    Извлекает изображения из DOC файла локально через win32com.
    
    1. Конвертирует DOC → HTML через Word
    2. Находит папку с изображениями (*_files)
    3. Копирует GIF файлы в output_dir
    4. Удаляет временные файлы
    """
    try:
        import win32com.client
    except ImportError:
        print("❌ Требуется pywin32: pip install pywin32")
        sys.exit(1)

    filepath = Path(filepath).absolute()
    if not filepath.exists():
        print(f"❌ Файл не найден: {filepath}")
        sys.exit(1)

    if output_dir is None:
        output_dir = Path.cwd() / "extracted_images"
    else:
        output_dir = Path(output_dir)

    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"📂 Файл: {filepath}")
    print(f"📁 Выходная папка: {output_dir}")

    # Создаем временную папку для HTML
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        print(f"⏳ Временная папка: {tmpdir}")

        # Конвертируем DOC → HTML через Word
        print("🔄 Конвертация DOC → HTML через Word...")
        word = win32com.client.Dispatch("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0

        try:
            doc = word.Documents.Open(str(filepath))
            # Сохраняем как HTML
            html_path = tmpdir / f"{filepath.stem}.html"
            doc.SaveAs2(str(html_path), FileFormat=10)  # 10 = wdFormatHTML
            doc.Close(False)
            print(f"✅ HTML создан: {html_path}")
        except Exception as e:
            print(f"❌ Ошибка конвертации: {e}")
            word.Quit()
            return []
        finally:
            word.Quit()

        # Ищем папку с изображениями (*_files)
        files_dirs = list(tmpdir.glob("*_files"))
        if not files_dirs:
            print("⚠️ Папка *_files не найдена, ищем изображения в корне...")
            files_dirs = [tmpdir]

        # Собираем все изображения
        IMG_EXTS = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.emf', '.wmf', '.tiff', '.tif'}
        found_images = []

        for files_dir in files_dirs:
            if files_dir.is_dir():
                for img_file in files_dir.iterdir():
                    if img_file.is_file() and img_file.suffix.lower() in IMG_EXTS:
                        found_images.append(img_file)
            else:
                # Это файл, не папка
                if files_dir.suffix.lower() in IMG_EXTS:
                    found_images.append(files_dir)

        print(f"\n📊 Найдено изображений: {len(found_images)}")
        for img in found_images:
            print(f"   - {img.name} ({img.stat().st_size} байт)")

        # Копируем изображения в выходную папку
        copied = []
        for img in found_images:
            dest = output_dir / img.name
            shutil.copy2(img, dest)
            copied.append(dest)
            print(f"   ✅ Скопировано: {dest.name}")

        # Читаем HTML для анализа (опционально)
        html_files = list(tmpdir.glob("*.html"))
        if html_files:
            html_content = html_files[0].read_text(encoding='utf-8', errors='ignore')
            
            # Подсчитываем количество <img> тегов
            img_tags = re.findall(r'<img[^>]+src=["\']([^"\']+)', html_content)
            print(f"\n📄 HTML содержит {len(img_tags)} тегов <img>:")
            for src in img_tags[:10]:  # Показываем первые 10
                print(f"   - {src}")
            if len(img_tags) > 10:
                print(f"   ... и ещё {len(img_tags) - 10}")

        return copied


def main():
    if len(sys.argv) < 2:
        print("Использование: python test_extract_local.py <путь_к_файлу.doc>")
        print("\nПримеры:")
        print("  python test_extract_local.py samples/8мм001.Cnf.DOC")
        print("  python test_extract_local.py \"8мм001.Cnf.DOC\"")
        sys.exit(1)

    filepath = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None

    extracted = extract_images_local(filepath, output_dir)

    if extracted:
        print(f"\n✅ Готово! Извлечено {len(extracted)} изображений.")
        print(f"📁 Смотрите папку: {extracted[0].parent}")
    else:
        print("\n⚠️ Изображения не найдены.")

    # Спрашиваем, удалить ли временные файлы (в данном случае они уже удалены)
    print("\n🗑️ Временные файлы автоматически удалены.")


if __name__ == "__main__":
    main()
