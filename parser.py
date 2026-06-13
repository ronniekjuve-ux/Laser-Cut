# -*- coding: utf-8 -*-
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Парсер файлов CYPCUT (.Cnf.doc / .Fnf.doc)
Использует win32com для чтения бинарного формата Word
"""
import re
import sys
import os
from pathlib import Path
from dataclasses import dataclass
from typing import List, Optional
from datetime import datetime

try:
    import win32com.client

    WIN32COM_AVAILABLE = True
except ImportError:
    WIN32COM_AVAILABLE = False
    print("⚠️  Библиотека pywin32 не установлена.")
    print("   Установи: pip install pywin32")

try:
    import pandas as pd

    PANDAS_AVAILABLE = True
except ImportError:
    PANDAS_AVAILABLE = False
    print("⚠️  Pandas не установлен.")
    print("   Установи: pip install pandas openpyxl")


@dataclass
class PartInfo:
    name: str = ""
    dx: float = 0.0
    dy: float = 0.0
    quantity: int = 1


@dataclass
class LayoutData:
    filename: str = ""
    sublayout_path: str = ""
    cnc_path: str = ""
    customer: str = ""
    order_number: str = "001"
    sheet_count: int = 1
    material: str = "Steel"
    sheet_w: float = 0.0
    sheet_h: float = 0.0
    thickness: float = 0.0
    weight: Optional[float] = None
    parts_total: int = 0
    move_time: str = "00:00"
    cut_time: str = "00:00"
    pierce_time: str = "00:00"
    total_time: str = "00:00"
    move_length: float = 0.0
    cut_length: float = 0.0
    pierces_count: int = 0
    parts: List[PartInfo] = None

    def __post_init__(self):
        if self.parts is None:
            self.parts = []


def extract_text_from_doc(filepath: str) -> str:
    """Извлекает текст из .doc файла через Microsoft Word COM"""
    try:
        word = win32com.client.Dispatch("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0
        doc = word.Documents.Open(os.path.abspath(filepath))
        text = doc.Range().Text
        doc.Close(False)
        word.Quit()
        return text
    except Exception as e:
        raise RuntimeError(f"Ошибка чтения Word: {e}")


def clean_text(text: str) -> str:
    """Очищает текст от мусора Word, сохраняет структуру строк"""
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    lines = text.split('\n')
    cleaned = [re.sub(r'[ \t]+', ' ', line.strip()) for line in lines]
    return '\n'.join(line for line in cleaned if line)


class CypcutParser:
    @staticmethod
    def extract_from_filename(filename: str) -> dict:
        res = {"thickness": None, "order_number": None}
        m = re.search(r'(\d+[,\.]?\d*)\s*мм', filename, re.I)
        if m:
            res["thickness"] = float(m.group(1).replace(',', '.'))
        m = re.search(r'(\d{3})\.', filename)
        if m:
            res["order_number"] = m.group(1)
        return res

    @classmethod
    def parse_file(cls, filepath: str) -> LayoutData:
        fp = Path(filepath)
        text = clean_text(extract_text_from_doc(str(fp)))
        fdata = cls.extract_from_filename(fp.name)

        def find_val(pat):
            m = re.search(rf'(?:\|\s*)?{pat}\s*:\s*([^|\n]+)', text, re.I)
            return m.group(1).strip() if m else None

        data = LayoutData(
            filename=fp.name,
            customer=find_val('Заказчик') or "",
            order_number=fdata["order_number"] or "001"
        )

        # CNC путь
        cnc_m = re.search(r'Имя файла УП\s*:\s*(\S+)', text)
        if cnc_m:
            data.cnc_path = cnc_m.group(1).strip()

        # Количество листов
        ls = find_val(r'Количество\s+листов')
        if ls and ls.isdigit():
            data.sheet_count = int(ls)

        # Материал
        mat = find_val('Материал')
        if mat:
            data.material = mat.split()[0]

        # Размер листа (поддержка дробных чисел)
        sm = re.search(r'Размер\s*:\s*([\d.,]+)\s*[XxхХ]\s*([\d.,]+)', text, re.I)
        if sm:
            data.sheet_w = float(sm.group(1).replace(',', '.'))
            data.sheet_h = float(sm.group(2).replace(',', '.'))

        # Толщина
        if not fdata["thickness"]:
            tm = re.search(r'Толщина\s*:\s*([\d.,]+)', text, re.I)
            if tm:
                data.thickness = float(tm.group(1).replace(',', '.'))
        else:
            data.thickness = fdata["thickness"]

        # Вес
        wm = re.search(r'Вес\s*:\s*([\d.,]+)', text, re.I)
        if wm:
            data.weight = float(wm.group(1).replace(',', '.'))

        # Общее кол-во деталей
        pt = find_val(r'Кол-во\s+деталей')
        if pt and pt.isdigit():
            data.parts_total = int(pt)

        # Время
        for pat, attr in [('Перемещение', 'move_time'), ('Резка', 'cut_time'),
                          ('Прокалывание', 'pierce_time'), (r'Время,\s*всего', 'total_time')]:
            v = find_val(pat)
            if v:
                setattr(data, attr, v)

        # Длина и проколы
        lm = re.search(r'Перемещ\.\s*\(мм\)\s*:\s*([\d.,]+)', text, re.I)
        if lm:
            data.move_length = float(lm.group(1).replace(',', '.'))

        cm = re.search(r'Резка\s*\(мм\)\s*:\s*([\d.,]+)', text, re.I)
        if cm:
            data.cut_length = float(cm.group(1).replace(',', '.'))

        pc = find_val(r'Кол\s*\.\s*проколов')
        if pc and pc.isdigit():
            data.pierces_count = int(pc)

        # ========== ПАРСИНГ ДЕТАЛЕЙ ==========
        parts = []
        in_table = False
        cur = {}
        suffix_pat = re.compile(r'[\s-]*\d+\s*[ШшСс][Тт]\s*$', re.I)
        waiting_for = 0  # 0=жду номер/путь, 3=жду DX, 2=жду DY, 1=жду QTY

        print(f"\n🔍 DEBUG: Начинаю парсинг деталей")
        lines_list = text.split('\n')
        print(f"   Всего строк: {len(lines_list)}\n")

        for i, line in enumerate(lines_list):
            line = line.replace('|', '').strip()
            if not line:
                continue

            if 'Имя детали' in line:
                in_table = True
                print(f"[{i}] Найдена таблица деталей")
                continue

            if not in_table:
                continue

            if line in ('DX', 'DY', 'Кол-во') or line.startswith('---'):
                continue

            # 1. Номер детали (только если не ждём числа)
            if re.match(r'^\d+\s*$', line) and waiting_for == 0:
                print(f"[{i}] Номер: {line.strip()}")
                if cur.get('name'):
                    print(f"    → Сохраняю: {cur}")
                    parts.append(PartInfo(
                        name=cur['name'],
                        dx=cur.get('dx', 0.0),
                        dy=cur.get('dy', 0.0),
                        quantity=cur.get('qty', 1)
                    ))
                cur = {}
                continue

            # 2. Путь к файлу (сохраняем полное имя с -4ШТ)
            if re.search(r'[A-Za-z]\s*:\s*\\', line):
                print(f"[{i}] Путь: {line[:60]}...")
                full_name = Path(line).name
                # Убираем ТОЛЬКО .dft расширение
                clean_name = re.sub(r'\.dft$', '', full_name, flags=re.I).strip()
                cur['name'] = clean_name
                waiting_for = 3  # Теперь ждём 3 числа: DX, DY, QTY
                print(f"    → Имя: {clean_name} (жду 3 числа)")
                continue

            # 3. Числа (DX, DY, Qty) - обрабатываем только если ждём их
            try:
                val = float(line.replace(',', '.'))
                if waiting_for > 0 and 'name' in cur:
                    if waiting_for == 3:
                        cur['dx'] = val
                        waiting_for = 2
                        print(f"[{i}] DX: {val}")
                    elif waiting_for == 2:
                        cur['dy'] = val
                        waiting_for = 1
                        print(f"[{i}] DY: {val}")
                    elif waiting_for == 1:
                        cur['qty'] = int(val)
                        waiting_for = 0  # Сброс - следующая строка будет номер новой детали
                        print(f"[{i}] QTY: {val} → {int(val)}")
            except ValueError:
                pass

        # Последняя деталь
        if cur.get('name'):
            print(f"→ Сохраняю последнюю: {cur}")
            parts.append(PartInfo(
                name=cur['name'],
                dx=cur.get('dx', 0.0),
                dy=cur.get('dy', 0.0),
                quantity=cur.get('qty', 1)
            ))

        print(f"\n✅ DEBUG: Найдено деталей: {len(parts)}")
        for idx, p in enumerate(parts, 1):
            print(f"   {idx}. {p.name} | DX:{p.dx} DY:{p.dy} QTY:{p.quantity}")
        print()

        data.parts = parts
        return data


def create_excel(data: LayoutData, output_path: str):
    if not PANDAS_AVAILABLE:
        return
    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        gen = {
            'Параметр': ['Имя файла', 'Номер раскладки', 'Заказчик', 'Материал',
                         'Толщина (мм)', 'Размер листа (мм)', 'Вес (кг)', 'Кол-во листов',
                         'Всего деталей', 'Время перемещения', 'Время резки',
                         'Время прокалывания', 'Общее время', 'Длина перемещения (мм)',
                         'Длина резки (мм)', 'Кол-во проколов'],
            'Значение': [data.filename, data.order_number, data.customer, data.material,
                         data.thickness, f"{data.sheet_w} x {data.sheet_h}",
                         data.weight if data.weight else "N/A", data.sheet_count,
                         data.parts_total, data.move_time, data.cut_time,
                         data.pierce_time, data.total_time, data.move_length,
                         data.cut_length, data.pierces_count]
        }
        pd.DataFrame(gen).to_excel(writer, sheet_name='Общая информация', index=False)

        pts = {
            '№': [i + 1 for i in range(len(data.parts))],
            'Имя детали': [p.name for p in data.parts],
            'DX (мм)': [p.dx for p in data.parts],
            'DY (мм)': [p.dy for p in data.parts],
            'Количество': [p.quantity for p in data.parts]
        }
        pd.DataFrame(pts).to_excel(writer, sheet_name='Детали', index=False)

        for sheet in writer.sheets.values():
            for col in sheet.columns:
                mx = max((len(str(c.value)) for c in col if c.value is not None), default=10)
                sheet.column_dimensions[col[0].column_letter].width = min(mx + 2, 50)


def create_html(data: LayoutData, output_path: str):
    html = f"""<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Раскладка {data.order_number}</title>
    <style>
        body {{ font-family: system-ui, sans-serif; margin: 20px; background: #f8fafc; color: #1e293b; }}
        .wrap {{ max-width: 1100px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }}
        h1 {{ border-bottom: 3px solid #3b82f6; padding-bottom: 10px; margin-top: 0; }}
        h2 {{ color: #334155; margin-top: 25px; }}
        .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 15px; margin: 15px 0; }}
        .card {{ background: #f1f5f9; padding: 12px 16px; border-radius: 8px; border-left: 4px solid #3b82f6; }}
        .lbl {{ font-size: 0.85em; color: #64748b; font-weight: 600; }}
        .val {{ font-size: 1.1em; margin-top: 4px; }}
        table {{ width: 100%; border-collapse: collapse; margin: 15px 0; }}
        th, td {{ padding: 10px; text-align: left; border-bottom: 1px solid #e2e8f0; }}
        th {{ background: #3b82f6; color: #fff; }}
        tr:hover {{ background: #f8fafc; }}
    </style>
</head>
<body>
<div class="wrap">
    <h1>📋 Раскладка №{data.order_number}</h1>
    <p><strong>Файл:</strong> {data.filename}</p>

    <h2>📊 Основная информация</h2>
    <div class="grid">
        <div class="card"><div class="lbl">Заказчик</div><div class="val">{data.customer or 'Не указан'}</div></div>
        <div class="card"><div class="lbl">Материал</div><div class="val">{data.material}</div></div>
        <div class="card"><div class="lbl">Толщина</div><div class="val">{data.thickness} мм</div></div>
        <div class="card"><div class="lbl">Размер листа</div><div class="val">{data.sheet_w} × {data.sheet_h} мм</div></div>
        <div class="card"><div class="lbl">Вес листа</div><div class="val">{data.weight if data.weight else 'N/A'} кг</div></div>
        <div class="card"><div class="lbl">Листов</div><div class="val">{data.sheet_count}</div></div>
    </div>

    <h2>⏱️ Время работы</h2>
    <div class="grid">
        <div class="card"><div class="lbl">Перемещение</div><div class="val">{data.move_time}</div></div>
        <div class="card"><div class="lbl">Резка</div><div class="val">{data.cut_time}</div></div>
        <div class="card"><div class="lbl">Прокалывание</div><div class="val">{data.pierce_time}</div></div>
        <div class="card"><div class="lbl">Итого</div><div class="val">{data.total_time}</div></div>
    </div>

    <h2>📏 Параметры резки</h2>
    <div class="grid">
        <div class="card"><div class="lbl">Длина перемещения</div><div class="val">{data.move_length} мм</div></div>
        <div class="card"><div class="lbl">Длина резки</div><div class="val">{data.cut_length} мм</div></div>
        <div class="card"><div class="lbl">Проколов</div><div class="val">{data.pierces_count} шт</div></div>
        <div class="card"><div class="lbl">Деталей найдено</div><div class="val">{len(data.parts)} шт</div></div>
    </div>

    <h2>🔧 Список деталей ({len(data.parts)})</h2>
    <table>
        <thead><tr><th>№</th><th>Имя</th><th>DX</th><th>DY</th><th>Кол-во</th></tr></thead>
        <tbody>
"""
    for i, p in enumerate(data.parts, 1):
        html += f"        <tr><td>{i}</td><td>{p.name}</td><td>{p.dx}</td><td>{p.dy}</td><td>{p.quantity}</td></tr>\n"

    html += f"""        </tbody>
    </table>
    <div style="margin-top:20px; color:#94a3b8; font-size:0.9em;">
        Сформировано: {datetime.now().strftime('%d.%m.%Y %H:%M:%S')}
    </div>
</div>
</body>
</html>"""
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)


def main():
    if len(sys.argv) < 2:
        print("Использование: python parser.py <файл.Cnf.doc>")
        sys.exit(1)

    filepath = sys.argv[1]
    if not Path(filepath).exists():
        print(f"❌ Файл не найден: {filepath}")
        sys.exit(1)
    if not WIN32COM_AVAILABLE:
        print("❌ Требуется pywin32. pip install pywin32")
        sys.exit(1)

    print(f"📂 Читаю: {filepath}")
    print("⏳ Запуск Word...")

    try:
        data = CypcutParser.parse_file(filepath)
        print("✅ Успешно!")
        print(f"   Заказ: {data.order_number} | Мат: {data.material} | Толщ: {data.thickness}мм")
        print(f"   Лист: {data.sheet_w}x{data.sheet_h} | Вес: {data.weight}кг | Деталей: {len(data.parts)}")
        print("-" * 40)

        out_dir = Path(filepath).parent
        base = Path(filepath).stem

        if PANDAS_AVAILABLE:
            xl_path = out_dir / f"{base}.xlsx"
            create_excel(data, str(xl_path))
            print(f"📄 Excel: {xl_path}")

        html_path = out_dir / f"{base}.html"
        create_html(data, str(html_path))
        print(f"🌐 HTML: {html_path}")
        print("🚀 Готово!")

    except Exception as e:
        print(f"❌ Ошибка: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()