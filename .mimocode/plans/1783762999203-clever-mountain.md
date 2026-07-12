# Plan: Исправить качество изображений раскладок

## Проблема
- LibreOffice (Docker/Linux) даёт низкое качество: GIF с розовым фоном, пропадают линии
- PDF→PNG показывает ВСЮ страницу с таблицами — диаграмма маленькая
- **Microsoft Word (Windows)** даёт отличное качество: GIF 887x249, 8.7KB, все линии видны

## Решение
Использовать win32com (Microsoft Word) для извлечения изображений на Windows, как уже сделано для `extract_text()`.

## Ключевой файл
`app/services/unified_parser.py:699` — функция `extract_images()`

## План изменений

### 1. Модифицировать `extract_images()` — добавить ветку win32com

Текущий код:
```python
def extract_images(filepath, output_dir, prefix="", filter_dft=False):
    # Только LibreOffice HTML export
    subprocess.run(['libreoffice', '--headless', '--convert-to', 'html', ...])
```

Новый код:
```python
def extract_images(filepath, output_dir, prefix="", filter_dft=False):
    # 1. Пробуем win32com (Windows) — лучшее качество
    try:
        import win32com.client
        import pythoncom
        pythoncom.CoInitialize()
        word = win32com.client.Dispatch("Word.Application")
        word.Visible = False
        
        with tempfile.TemporaryDirectory() as tmpdir:
            html_path = os.path.join(tmpdir, "temp.html")
            doc = word.Documents.Open(os.path.abspath(filepath))
            doc.SaveAs2(html_path, FileFormat=8)  # wdFormatHTML
            doc.Close(False)
            
            # Собираем изображения из папки temp_files/
            html_name = Path(filepath).stem
            img_dir = Path(tmpdir) / f"{html_name}_files"
            # ... извлекаем изображения как раньше
        
        word.Quit()
        pythoncom.CoUninitialize()
        return saved
    
    except ImportError:
        # 2. Fallback: LibreOffice (Docker/Linux)
        # ... текущий код
```

### 2. Извлечение изображений из HTML папки Word

Когда Word сохраняет DOC как HTML, создаётся папка `{filename}_files/` с изображениями:
- `image001.gif`, `image002.gif`, etc.
- Каждое изображение — отдельная деталь или раскладка
- Качество значительно выше LibreOffice

### 3. Fallback на LibreOffice

Если win32com недоступен (Docker/Linux) — используем текущий метод с LibreOffice.

## Верификация
1. Запустить на Windows локально
2. Загрузить раскладку через `http://localhost:3000`
3. Проверить качество изображения — должна быть чёткая диаграмма без таблиц
4. Сравнить с ручным сохранением DOC как HTML
