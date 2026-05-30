import re
from pathlib import Path
from datetime import datetime


def extract_text_debug(filepath: str) -> str:
    """Извлекает текст с отладочной информацией"""
    try:
        import win32com.client
        word = win32com.client.Dispatch("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0
        doc = word.Documents.Open(str(Path(filepath).absolute()))
        text = doc.Range().Text
        doc.Close(False)
        word.Quit()
        return text
    except ImportError:
        import subprocess
        result = subprocess.run(['antiword', filepath], capture_output=True, text=True, timeout=10)
        return result.stdout


def parse_and_visualize(filepath: str, output_path: str = None):
    """Парсит файл и создает HTML отчет"""

    text = extract_text_debug(filepath)
    filename = Path(filepath).name

    if not output_path:
        output_path = Path(filepath).parent / f"{Path(filepath).stem}_DEBUG.html"

    # Парсим данные
    data = {}

    # Основные поля
    patterns = {
        'Субраскладка': r'Субраскладка\s*:\s*(.+?)(?:\s+Дата|$)',
        'Имя файла УП': r'Имя файла УП\s*:\s*(\S+)',
        'Заказчик': r'Заказчик\s*:\s*([^\n|]*)',
        'Материал': r'Материал\s*:\s*([^\s|]+)',
        'Размер': r'Размер\s*:\s*([\d.,]+)\s*[XxхХ]\s*([\d.,]+)',
        'Толщина': r'Толщина\s*:\s*([\d.,]+)',
        'Вес': r'Вес\s*:\s*([\d.,]+)',
        'Кол-во деталей': r'Кол-во\s+деталей\s*:\s*(\d+)',
        'Перемещение': r'Перемещение\s*:\s*(\d+:\d+)',
        'Резка': r'Резка\s*:\s*(\d+:\d+)',
        'Прокалывание': r'Прокалывание\s*:\s*(\d+:\d+)',
        'Время, всего': r'Время,\s*всего\s*:\s*(\d+:\d+)',
        'Перемещ. (мм)': r'Перемещ\.\s*\(мм\)\s*:\s*([\d.,]+)',
        'Резка (мм)': r'Резка\s*\(мм\)\s*:\s*([\d.,]+)',
        'Кол. проколов': r'Кол\s*\.\s*проколов\s*:\s*(\d+)',
    }

    for name, pattern in patterns.items():
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            if name == 'Размер':
                data[name] = f"{match.group(1)} x {match.group(2)}"
            else:
                data[name] = match.group(1).strip()

    # Парсинг деталей
    parts = []
    lines = text.split('\n')
    in_table = False
    current_part = {}
    suffix_pattern = re.compile(r'[\s-]*\d+\s*[ШшСс][Тт]\s*$', re.I)

    for raw_line in lines:
        line = raw_line.replace('|', '').strip()

        if 'Имя детали' in line:
            in_table = True
            continue

        if not in_table:
            continue

        if line in ('DX', 'DY', 'Кол-во') or line.startswith('---'):
            continue

        # Номер детали
        if re.match(r'^\d+\s*$', line):
            if current_part and 'name' in current_part:
                parts.append(current_part)
            current_part = {}
            continue

        # Путь к файлу
        if re.search(r'[A-Za-z]\s*:\s*\\', line):
            full_name = Path(line).name
            clean_name = suffix_pattern.sub('', full_name).strip()
            current_part['name'] = clean_name
            current_part['full_path'] = line
            continue

        # Числа
        try:
            val = float(line.replace(',', '.'))
            if 'name' in current_part:
                if 'dx' not in current_part:
                    current_part['dx'] = val
                elif 'dy' not in current_part:
                    current_part['dy'] = val
                elif 'qty' not in current_part:
                    current_part['qty'] = int(val)
        except ValueError:
            pass

    if current_part and 'name' in current_part:
        parts.append(current_part)

    # Создаем HTML
    html = f"""<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>DEBUG: {filename}</title>
    <style>
        body {{ font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; background: #f5f5f5; }}
        .container {{ max-width: 1400px; margin: 0 auto; }}
        h1 {{ color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }}
        h2 {{ color: #34495e; margin-top: 30px; background: #ecf0f1; padding: 10px; border-radius: 5px; }}
        .info-grid {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 20px 0; }}
        .info-item {{ background: white; padding: 15px; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }}
        .info-label {{ font-weight: bold; color: #7f8c8d; font-size: 0.9em; }}
        .info-value {{ color: #2c3e50; font-size: 1.2em; margin-top: 5px; }}
        table {{ width: 100%; border-collapse: collapse; margin: 20px 0; background: white; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }}
        th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }}
        th {{ background: #3498db; color: white; }}
        tr:hover {{ background: #f5f5f5; }}
        .warning {{ background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 10px 0; }}
        .success {{ background: #d4edda; border-left: 4px solid #28a745; padding: 10px; margin: 10px 0; }}
        .error {{ background: #f8d7da; border-left: 4px solid #dc3545; padding: 10px; margin: 10px 0; }}
        .raw-text {{ background: #2d2d2d; color: #f8f8f2; padding: 15px; border-radius: 5px; overflow-x: auto; font-family: 'Courier New', monospace; font-size: 12px; white-space: pre-wrap; }}
        .stats {{ display: flex; gap: 20px; flex-wrap: wrap; }}
        .stat-box {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; min-width: 150px; text-align: center; }}
        .stat-value {{ font-size: 2em; font-weight: bold; }}
        .stat-label {{ font-size: 0.9em; opacity: 0.9; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 DEBUG Report: {filename}</h1>
        <p>Создан: {datetime.now().strftime('%d.%m.%Y %H:%M:%S')}</p>

        <h2>📊 Статистика</h2>
        <div class="stats">
            <div class="stat-box">
                <div class="stat-value">{len(parts)}</div>
                <div class="stat-label">Деталей найдено</div>
            </div>
            <div class="stat-box" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
                <div class="stat-value">{data.get('Кол-во деталей', 'N/A')}</div>
                <div class="stat-label">Заявлено деталей</div>
            </div>
            <div class="stat-box" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
                <div class="stat-value">{data.get('Материал', 'N/A')}</div>
                <div class="stat-label">Материал</div>
            </div>
        </div>

        <h2>📋 Основные данные</h2>
        <div class="info-grid">
"""

    for key, value in data.items():
        html += f"""            <div class="info-item">
                <div class="info-label">{key}</div>
                <div class="info-value">{value}</div>
            </div>
"""

    html += """        </div>

        <h2>🔧 Детали</h2>
"""

    if parts:
        html += """        <table>
            <thead>
                <tr>
                    <th>№</th>
                    <th>Имя детали</th>
                    <th>DX</th>
                    <th>DY</th>
                    <th>Количество</th>
                    <th>Полный путь</th>
                </tr>
            </thead>
            <tbody>
"""
        for i, part in enumerate(parts, 1):
            html += f"""                <tr>
                    <td>{i}</td>
                    <td><strong>{part.get('name', 'N/A')}</strong></td>
                    <td>{part.get('dx', 'N/A')}</td>
                    <td>{part.get('dy', 'N/A')}</td>
                    <td>{part.get('qty', 'N/A')}</td>
                    <td style="font-size: 0.8em; color: #7f8c8d;">{part.get('full_path', 'N/A')}</td>
                </tr>
"""
        html += """            </tbody>
        </table>
"""
    else:
        html += """        <div class="warning">⚠️ Детали не найдены!</div>
"""

    html += f"""        
        <h2>📄 Сырой текст (первые 2000 символов)</h2>
        <div class="raw-text">{text[:2000]}</div>

        <h2>🔍 Отладочная информация</h2>
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">Длина текста</div>
                <div class="info-value">{len(text)} символов</div>
            </div>
            <div class="info-item">
                <div class="info-label">Строк</div>
                <div class="info-value">{len(text.split(chr(10)))}</div>
            </div>
        </div>
    </div>
</body>
</html>
"""

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"✅ HTML отчет создан: {output_path}")
    return output_path


# Если запускается как скрипт
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Использование: python debug_parser.py <путь_к_файлу.doc>")
    else:
        parse_and_visualize(sys.argv[1])