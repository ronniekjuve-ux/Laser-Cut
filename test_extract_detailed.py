# -*- coding: utf-8 -*-
"""
Детальный тест извлечения изображений из DOC файлов.
Сравнивает разные методы конвертации и помогает найти причину пропадания линий.

Запуск: python test_extract_detailed.py <путь_к_файлу.doc>
"""
import os
import sys
import re
import shutil
import tempfile
import subprocess
from pathlib import Path
from datetime import datetime


def method_win32com_html(filepath: Path, tmpdir: Path):
    """Метод 1: win32com DOC → HTML"""
    try:
        import win32com.client
    except ImportError:
        print("   ⚠️ pywin32 не установлен")
        return None

    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0

    try:
        doc = word.Documents.Open(str(filepath.absolute()))
        html_path = tmpdir / f"{filepath.stem}_win32com.html"
        doc.SaveAs2(str(html_path), FileFormat=10)  # wdFormatHTML
        doc.Close(False)
        return html_path
    except Exception as e:
        print(f"   ❌ Ошибка win32com: {e}")
        return None
    finally:
        word.Quit()


def method_libreoffice_html(filepath: Path, tmpdir: Path):
    """Метод 2: LibreOffice DOC → HTML"""
    try:
        result = subprocess.run(
            ['libreoffice', '--headless', '--convert-to', 'html', '--outdir', str(tmpdir), str(filepath)],
            capture_output=True, timeout=60
        )
        html_files = list(tmpdir.glob("*.html"))
        return html_files[0] if html_files else None
    except FileNotFoundError:
        print("   ⚠️ LibreOffice не найден")
        return None
    except Exception as e:
        print(f"   ❌ Ошибка LibreOffice: {e}")
        return None


def method_win32com_pdf(filepath: Path, tmpdir: Path):
    """Метод 3: win32com DOC → PDF"""
    try:
        import win32com.client
    except ImportError:
        return None

    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0

    try:
        doc = word.Documents.Open(str(filepath.absolute()))
        pdf_path = tmpdir / f"{filepath.stem}_win32com.pdf"
        doc.SaveAs2(str(pdf_path), FileFormat=17)  # wdFormatPDF
        doc.Close(False)
        return pdf_path
    except Exception as e:
        print(f"   ❌ Ошибка PDF: {e}")
        return None
    finally:
        word.Quit()


def analyze_html(html_path: Path):
    """Анализирует HTML файл и подсчитывает изображения"""
    if not html_path or not html_path.exists():
        return {"error": "Файл не найден"}

    content = html_path.read_text(encoding='utf-8', errors='ignore')

    # Подсчитываем теги <img>
    img_tags = re.findall(r'<img[^>]+src=["\']([^"\']+)', content)

    # Подсчитываем SVG (если есть)
    svg_count = content.lower().count('<svg')

    # Ищем CSS стили для линий
    line_styles = re.findall(r'stroke[:\s]+[^;]+', content)

    return {
        "file_size": html_path.stat().st_size,
        "img_count": len(img_tags),
        "img_srcs": img_tags[:20],  # Первые 20
        "svg_count": svg_count,
        "line_styles_count": len(line_styles),
        "content_length": len(content)
    }


def extract_gifs_from_html(html_path: Path, output_dir: Path):
    """Извлекает GIF изображения из HTML и связанной папки *_files"""
    if not html_path or not html_path.exists():
        return []

    # Ищем папку *_files
    parent = html_path.parent
    stem = html_path.stem
    files_dir = parent / f"{stem}_files"

    gifs = []
    if files_dir.exists():
        for f in files_dir.iterdir():
            if f.suffix.lower() == '.gif':
                dest = output_dir / f.name
                shutil.copy2(f, dest)
                gifs.append(dest)
                print(f"   ✅ GIF: {f.name} ({f.stat().st_size} байт) → {dest.name}")

    return gifs


def main():
    if len(sys.argv) < 2:
        print("Использование: python test_extract_detailed.py <путь_к_файлу.doc>")
        sys.exit(1)

    filepath = Path(sys.argv[1])
    if not filepath.exists():
        print(f"❌ Файл не найден: {filepath}")
        sys.exit(1)

    print(f"{'='*60}")
    print(f"🔍 Детальный тест извлечения изображений")
    print(f"{'='*60}")
    print(f"📂 Файл: {filepath}")
    print(f"📊 Размер: {filepath.stat().st_size} байт")
    print()

    # Создаем временную папку
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        output_dir = Path.cwd() / "extracted_images_test"
        output_dir.mkdir(exist_ok=True)

        results = {}

        # Метод 1: win32com → HTML
        print("🔄 Метод 1: win32com → HTML")
        html1 = method_win32com_html(filepath, tmpdir / "m1")
        if html1:
            results["win32com_html"] = analyze_html(html1)
            print(f"   📊 Результат: {results['win32com_html']['img_count']} изображений")
            extract_gifs_from_html(html1, output_dir / "method1_win32com")
        print()

        # Метод 2: LibreOffice → HTML
        print("🔄 Метод 2: LibreOffice → HTML")
        html2 = method_libreoffice_html(filepath, tmpdir / "m2")
        if html2:
            results["libreoffice_html"] = analyze_html(html2)
            print(f"   📊 Результат: {results['libreoffice_html']['img_count']} изображений")
            extract_gifs_from_html(html2, output_dir / "method2_libreoffice")
        print()

        # Метод 3: win32com → PDF (для сравнения)
        print("🔄 Метод 3: win32com → PDF")
        pdf3 = method_win32com_pdf(filepath, tmpdir / "m3")
        if pdf3:
            results["win32com_pdf"] = {"file_size": pdf3.stat().st_size}
            print(f"   📊 PDF создан: {pdf3.stat().st_size} байт")
            # Копируем PDF для просмотра
            dest_pdf = output_dir / "method3_win32com.pdf"
            shutil.copy2(pdf3, dest_pdf)
            print(f"   📄 Скопировано: {dest_pdf}")
        print()

        # Сравнение результатов
        print(f"{'='*60}")
        print("📊 СРАВНЕНИЕ РЕЗУЛЬТАТОВ")
        print(f"{'='*60}")

        for method, data in results.items():
            print(f"\n🔧 {method}:")
            for key, value in data.items():
                if key == "img_srcs":
                    print(f"   {key}: {len(value)} src атрибутов")
                    for src in value[:5]:
                        print(f"      - {src}")
                else:
                    print(f"   {key}: {value}")

        # Рекомендации
        print(f"\n{'='*60}")
        print("💡 РЕКОМЕНДАЦИИ")
        print(f"{'='*60}")

        if "win32com_html" in results and "libreoffice_html" in results:
            w_count = results["win32com_html"]["img_count"]
            l_count = results["libreoffice_html"]["img_count"]
            if w_count > l_count:
                print("✅ win32com извлекает больше изображений")
            elif l_count > w_count:
                print("✅ LibreOffice извлекает больше изображений")
            else:
                print("⚖️ Оба метода извлекают одинаковое количество")

        print(f"\n📁 Результаты сохранены в: {output_dir}")
        print("   - method1_win32com/ — GIF из win32com HTML")
        print("   - method2_libreoffice/ — GIF из LibreOffice HTML")
        print("   - method3_win32com.pdf — PDF для сравнения")

        # Спрашиваем, оставить ли файлы
        print(f"\n{'='*60}")
        answer = input("🗑️ Удалить результаты? (y/n, по умолчанию n): ").strip().lower()
        if answer == 'y':
            shutil.rmtree(output_dir)
            print("✅ Результаты удалены")
        else:
            print(f"📁 Результаты оставлены в: {output_dir}")


if __name__ == "__main__":
    main()
