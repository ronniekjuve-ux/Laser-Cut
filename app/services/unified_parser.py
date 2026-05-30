import re
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional, Dict
try:
    from docx import Document
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False

try:
    import win32com.client

    WIN32_AVAILABLE = True
except ImportError:
    WIN32_AVAILABLE = False


@dataclass
class AppPart:
    """Деталь из файла Заявки"""
    name_raw: str
    weight: float
    qty: int


@dataclass
class LayoutPart:
    """Деталь из файла Раскладки - как PartInfo в parser.py"""
    name: str = ""
    dx: float = 0.0
    dy: float = 0.0
    quantity: int = 1


@dataclass
class MergedPart:
    """Итоговая деталь"""
    name: str
    dx: float
    dy: float
    quantity: int
    weight: Optional[float]
    qty_layout: int


@dataclass
class ApplicationData:
    order_name: str = ""
    material: str = "Steel"
    thickness: float = 0.0
    total_weight: Optional[float] = None
    parts: List[AppPart] = field(default_factory=list)


@dataclass
class LayoutData:
    layout_code: str = "001"
    machine_type: str = "CNF"
    sheet_w: float = 0.0
    sheet_h: float = 0.0
    sheet_weight: Optional[float] = None
    cut_time: str = "00:00"
    move_time: str = "00:00"
    pierce_time: str = "00:00"
    cnc_path: str = ""
    parts: List[LayoutPart] = field(default_factory=list)


def extract_text(filepath: str) -> str:
    """Извлекает текст из файла Word"""
    try:
        # 1. Windows (локально) - используем win32com
        import win32com.client
        word = win32com.client.Dispatch("Word.Application")
        word.Visible = False
        word.DisplayAlerts = 0
        doc = word.Documents.Open(str(Path(filepath).absolute()))
        text = doc.Range().Text
        doc.Close(False)
        word.Quit()
        return clean_text(text)

    except ImportError:
        # 2. Docker (Linux) - используем LibreOffice + python-docx
        import tempfile
        import subprocess
        from docx import Document

        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                # Конвертируем .doc в .docx через LibreOffice
                subprocess.run(
                    ['libreoffice', '--headless', '--convert-to', 'docx', '--outdir', tmpdir, filepath],
                    check=True,
                    capture_output=True,
                    timeout=30
                )

                # Ищем созданный файл
                filename = Path(filepath).stem
                docx_path = Path(tmpdir) / f"{filename}.docx"

                if docx_path.exists():
                    doc = Document(docx_path)
                    full_text = []

                    # 1. Читаем обычные параграфы
                    for para in doc.paragraphs:
                        if para.text.strip():
                            full_text.append(para.text.strip())

                    # 2. Читаем таблицы (сохраняем структуру через разделитель |)
                    for table in doc.tables:
                        for row in table.rows:
                            cells = [cell.text.strip() for cell in row.cells]
                            # Пропускаем пустые строки таблицы
                            if any(cells):
                                full_text.append(" | ".join(cells))

                    return clean_text('\n'.join(full_text))
                else:
                    raise FileNotFoundError("LibreOffice не создал файл .docx")

        except Exception as e:
            # Если LibreOffice не сработал, выводим понятную ошибку
            raise RuntimeError(f"Ошибка извлечения текста через LibreOffice: {e}")


def clean_text(text: str) -> str:
    """Очищает текст от мусора Word, сохраняя структуру строк"""
    # 1. Нормализуем переносы строк
    text = text.replace('\r\n', '\n').replace('\r', '\n')

    # 2. Удаляем управляющие символы (кроме \n и \t)
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)

    # 3. Удаляем неразрывные пробелы и zero-width space
    text = text.replace('\u00A0', ' ')
    text = text.replace('\u200B', '')
    text = text.replace('\uFEFF', '')

    # 4. Нормализуем пробелы внутри строк
    lines = text.split('\n')
    cleaned = []
    prev_empty = False

    for line in lines:
        # Заменяем множественные пробелы/табы на один пробел
        line = re.sub(r'[ \t]+', ' ', line.strip())

        if line:
            # Непустая строка — сохраняем
            cleaned.append(line)
            prev_empty = False
        elif not prev_empty:
            # Пустая строка, но предыдущая была непустой — сохраняем одну
            cleaned.append('')
            prev_empty = True
            # Иначе пропускаем (не добавляем множественные пустые строки)

    return '\n'.join(cleaned)


def normalize_name(name: str) -> str:
    """Нормализует имя для сопоставления"""
    # 1. Сначала извлекаем только имя файла из пути D:\...\file.dft
    clean = Path(name).name

    # 2. Убираем расширение .dft
    clean = re.sub(r'\.dft$', '', clean, flags=re.IGNORECASE).strip()

    # 3. Приводим к нижнему регистру
    return clean.lower()


def parse_application_text(text: str) -> ApplicationData:
    """Парсит файл Заявки (.DOC)"""
    data = ApplicationData()

    order_match = re.search(r'Заказ\s*:\s*\n\s*\|\s*([^\s\.]+)', text)
    if order_match:
        data.order_name = order_match.group(1)

    mat_match = re.search(r'Материал\s*:\s*([^\s|]+)', text)
    if mat_match:
        data.material = mat_match.group(1).strip()

    # ========== ИСПРАВЛЕНИЕ 1: Толщина из таблицы ==========
    lines = text.split('\n')

    # Ищем таблицу "Данные материала" или "Доп. данные материала"
    in_material_table = False
    header_found = False

    for i, line in enumerate(lines):
        if 'Данные материала' in line or 'Доп. данные материала' in line:
            in_material_table = True
            continue

        if in_material_table and line.startswith('| ---'):
            header_found = True
            continue

        if in_material_table and header_found:
            if line.startswith('|') and 'Steel' in line:
                cells = [c.strip() for c in line.split('|') if c.strip()]
                # В "Данные материала": | Steel | 8 | ... |
                # В "Доп. данные материала": | Steel | 8.00 | ... |
                if len(cells) >= 2:
                    try:
                        thickness_val = cells[1].replace(',', '.').strip()
                        if thickness_val and thickness_val not in ['.', ',']:
                            data.thickness = float(thickness_val)
                            print(f"✅ Найдена толщина: {data.thickness}")
                    except (ValueError, IndexError):
                        pass
                break

            # Если дошли до следующей таблицы — выходим
            if 'Детали в субраскладках' in line:
                break

    # ========== ИСПРАВЛЕНИЕ 2: Общий вес ==========
    # Ищем "Общий в ес ( KG )" в таблице
    for i, line in enumerate(lines):
        if 'Общий' in line and 'вес' in line and 'KG' in line:
            # Следующая строка или эта же строка содержит значение
            # Формат: |Общий в ес   ( KG ) |  или  |209.114|

            # Проверяем текущую строку
            cells = [c.strip() for c in line.split('|') if c.strip()]
            for cell in cells:
                try:
                    val = float(cell.replace(',', '.'))
                    if 100 < val < 1000:  # Правдоподобный вес
                        data.total_weight = val
                        print(f"✅ Найден вес: {data.total_weight}")
                        break
                except ValueError:
                    pass

            # Если не нашли в текущей, смотрим следующую строку
            if data.total_weight is None and i + 1 < len(lines):
                next_line = lines[i + 1]
                if next_line.startswith('|'):
                    cells = [c.strip() for c in next_line.split('|') if c.strip()]
                    if cells:
                        try:
                            val = float(cells[0].replace(',', '.'))
                            if 100 < val < 1000:
                                data.total_weight = val
                                print(f"✅ Найден вес (след. строка): {data.total_weight}")
                        except ValueError:
                            pass
            break

    # ========== Парсинг деталей (без изменений) ==========
    in_parts_table = False

    for line in lines:
        if 'Детали в субраскладках' in line:
            in_parts_table = True
            continue

        if not in_parts_table:
            continue

        if line.startswith('| ---') or line.startswith('| №'):
            continue

        cells = [c.strip() for c in line.split('|') if c.strip()]

        if len(cells) >= 7:
            try:
                name_raw = cells[1]
                if '.dft' in name_raw.lower() or 'шт' in name_raw.lower():
                    weight_str = cells[5]
                    qty_str = cells[6]

                    data.parts.append(AppPart(
                        name_raw=name_raw,
                        weight=float(weight_str.replace(',', '.')),
                        qty=int(qty_str)
                    ))
            except (ValueError, IndexError):
                continue

    return data


def parse_layout_text(text: str, filename: str) -> LayoutData:
    """Парсит файл Раскладки (.Cnf/.Fnf.DOC)"""
    # Очищаем текст
    text = clean_text(text)

    print(f"\n🔍 DEBUG parse_layout_text:")
    print(f"   Получено {len(text)} символов")
    print(f"   Первые 1000 символов:\n{text[:1000]}\n")

    data = LayoutData()

    if "fnf" in filename.lower():
        data.machine_type = "FNF"

    code_match = re.search(r'(\d{3})', filename)
    if code_match:
        data.layout_code = code_match.group(1)

    size_match = re.search(r'Размер\s*:\s*([\d.,]+)\s*[XxхХ]\s*([\d.,]+)', text, re.I)
    if size_match:
        data.sheet_w = float(size_match.group(1).replace(',', '.'))
        data.sheet_h = float(size_match.group(2).replace(',', '.'))
        print(f"   ✅ Размер листа: {data.sheet_w}x{data.sheet_h}")

    for pattern, attr in [
        (r'Перемещение\s*:\s*([\d:]+)', 'move_time'),
        (r'Резка\s*:\s*([\d:]+)', 'cut_time'),
        (r'Прокалывание\s*:\s*([\d:]+)', 'pierce_time')
    ]:
        match = re.search(pattern, text)
        if match:
            setattr(data, attr, match.group(1))

    cnc_match = re.search(r'Имя файла УП\s*:\s*(\S+)', text)
    if cnc_match:
        data.cnc_path = cnc_match.group(1).strip()

    # ========== ПАРСИНГ ДЕТАЛЕЙ (через ячейки) ==========
    parts = []
    in_table = False
    cur = {}  # Текущая собираемая деталь

    for line in text.split('\n'):
        line = line.strip()
        if not line:
            continue

        if 'Имя детали' in line:
            in_table = True
            print(f"   ✅ Найдена таблица деталей")
            continue

        if not in_table:
            continue

        # Разбиваем строку по разделителю |
        # Это даст нам доступ к отдельным колонкам таблицы
        cells = [c.strip() for c in line.split('|') if c.strip()]

        # Если ячеек меньше 2, скорее всего это мусор или заголовок
        if len(cells) < 2:
            continue

        # 1. Ищем ячейку, которая содержит путь (D:\ или C:\)
        path_cell = None
        for cell in cells:
            if re.search(r'[A-Za-z]:\\', cell):
                path_cell = cell
                break

        if path_cell:
            # Если нашли путь — это начало новой детали

            # Сначала сохраняем предыдущую деталь, если она была
            if cur.get('name') and cur.get('dx') is not None:
                parts.append(LayoutPart(
                    name=cur['name'],
                    dx=cur['dx'],
                    dy=cur['dy'],
                    quantity=cur.get('qty', 1)
                ))

            # Извлекаем чистое имя файла ИЗ ЯЧЕЙКИ с путем
            full_name = path_cell.replace('/', '\\').split('\\')[-1]
            clean_name = re.sub(r'\.dft$', '', full_name, flags=re.I).strip()

            # Инициализируем новую деталь
            cur = {
                'name': clean_name,
                'dx': None,
                'dy': None,
                'qty': None
            }

            print(f"   📄 Обнаружена деталь: {clean_name}")

            # 2. Пытаемся найти числа (DX, DY, QTY) в ячейках СПРАВА от пути
            # Находим индекс ячейки с путем
            try:
                path_idx = cells.index(path_cell)
                # Смотрим ячейки после пути
                numbers = []
                for i in range(path_idx + 1, len(cells)):
                    try:
                        val = float(cells[i].replace(',', '.'))
                        numbers.append(val)
                    except ValueError:
                        pass

                # Если нашли 3 числа подряд — записываем их
                if len(numbers) >= 3:
                    cur['dx'] = numbers[0]
                    cur['dy'] = numbers[1]
                    cur['qty'] = int(numbers[2])
                    print(f"   ✅ Сразу найдены размеры: {cur['dx']}x{cur['dy']} кол-во {cur['qty']}")
                elif len(numbers) == 2:
                    cur['dx'] = numbers[0]
                    cur['dy'] = numbers[1]
                elif len(numbers) == 1:
                    cur['dx'] = numbers[0]

            except ValueError:
                pass  # Если не нашли индекс, ничего страшного

            continue

        # 3. Если пути в строке нет, но у нас есть "незавершенная" деталь
        if cur.get('name') and cur.get('dx') is None:
            # Пытаемся найти числа в любой ячейке этой строки
            for cell in cells:
                try:
                    val = float(cell.replace(',', '.'))
                    if cur.get('dx') is None:
                        cur['dx'] = val
                    elif cur.get('dy') is None:
                        cur['dy'] = val
                    elif cur.get('qty') is None:
                        cur['qty'] = int(val)
                except ValueError:
                    pass

    # Сохраняем последнюю деталь
    if cur.get('name') and cur.get('dx') is not None:
        parts.append(LayoutPart(
            name=cur['name'],
            dx=cur['dx'],
            dy=cur['dy'],
            quantity=cur.get('qty', 1)
        ))

    data.parts = parts

    print(f"\n   ✅ ВСЕГО: Найдено {len(parts)} деталей")
    for idx, p in enumerate(parts, 1):
        print(f"      {idx}. {p.name} | DX:{p.dx} DY:{p.dy} QTY:{p.quantity}")

    return data


def extract_images(filepath: str, output_dir: str, prefix: str = "") -> List[str]:
    """Извлекает изображения из DOC файла"""
    import tempfile
    import subprocess
    from pathlib import Path

    saved_paths = []

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            # Конвертируем DOC в HTML через LibreOffice (сохраняет изображения)
            subprocess.run(
                ['libreoffice', '--headless', '--convert-to', 'html', '--outdir', tmpdir, filepath],
                check=True,
                capture_output=True,
                timeout=30
            )

            # Ищем папку с изображениями
            html_name = Path(filepath).stem
            img_dir = Path(tmpdir) / f"{html_name}_files"

            if img_dir.exists():
                # Создаем папку назначения
                dest_dir = Path(output_dir) / prefix
                dest_dir.mkdir(parents=True, exist_ok=True)

                # Копируем изображения
                for img_file in img_dir.glob('*'):
                    if img_file.suffix.lower() in ['.png', '.jpg', '.jpeg', '.gif', '.bmp']:
                        dest_path = dest_dir / img_file.name
                        import shutil
                        shutil.copy2(img_file, dest_path)
                        # Относительный путь для API
                        rel_path = f"/images/{prefix}/{img_file.name}"
                        saved_paths.append(rel_path)

    except Exception as e:
        print(f"⚠️ Ошибка извлечения изображений: {e}")

    return saved_paths


def merge_data(app_data: ApplicationData, layout_data: LayoutData) -> List[MergedPart]:
    """Объединяет данные из Заявки и Раскладки"""
    if not app_data.parts:
        return [
            MergedPart(
                name=p.name,
                dx=p.dx,
                dy=p.dy,
                quantity=p.quantity,
                weight=None,
                qty_layout=p.quantity
            )
            for p in layout_data.parts
        ]

    # Создаем словарь из заявки для быстрого поиска
    app_dict: Dict[str, AppPart] = {}
    for p in app_data.parts:
        key = normalize_name(p.name_raw)
        app_dict[key] = p

    result = []
    for lp in layout_data.parts:
        key = normalize_name(lp.name)
        ap = app_dict.get(key)

        if ap:
            # Есть совпадение
            result.append(MergedPart(
                name=ap.name_raw.replace('.dft', '').replace('.DFT', ''),
                dx=lp.dx,
                dy=lp.dy,
                quantity=ap.qty,
                weight=ap.weight,
                qty_layout=lp.quantity
            ))
        else:
            # Нет совпадения
            result.append(MergedPart(
                name=lp.name,
                dx=lp.dx,
                dy=lp.dy,
                quantity=lp.quantity,
                weight=None,
                qty_layout=lp.quantity
            ))

    return result


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Использование: python unified_parser.py <путь_к_файлу.doc>")
        sys.exit(1)

    filepath = sys.argv[1]
    filename = Path(filepath).name

    print(f"📂 Парсинг: {filepath}")

    try:
        # Извлекаем текст
        text = extract_text(filepath)
        print("✅ Текст извлечён")

        # Парсим раскладку
        layout_data = parse_layout_text(text, filename)
        print(f"✅ Найдено деталей: {len(layout_data.parts)}")

        # Выводим информацию
        print(f"\n📊 Основная информация:")
        print(f"   Тип: {layout_data.machine_type}")
        print(f"   Код: {layout_data.layout_code}")
        print(f"   Размер листа: {layout_data.sheet_w} x {layout_data.sheet_h}")
        print(f"   CNC путь: {layout_data.cnc_path}")
        print(f"   Время резки: {layout_data.cut_time}")
        print(f"   Время перемещения: {layout_data.move_time}")

        print(f"\n🔧 Детали:")
        for i, part in enumerate(layout_data.parts, 1):
            print(f"   {i}. {part.name} | DX:{part.dx} DY:{part.dy} QTY:{part.quantity}")

    except Exception as e:
        print(f"❌ Ошибка: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)