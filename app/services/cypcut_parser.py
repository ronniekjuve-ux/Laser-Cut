# -*- coding: utf-8 -*-
import re
import subprocess
import tempfile
import os
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional

# Пробуем импортировать pywin32 (только Windows)
try:
    import win32com.client

    WIN32_AVAILABLE = True
except ImportError:
    WIN32_AVAILABLE = False


@dataclass
class PartInfo:
    name: str = ""
    dx: float = 0.0
    dy: float = 0.0
    quantity: int = 1


@dataclass
class CypcutData:
    material: str = "Steel"
    thickness: float = 0.0
    sheet_w: float = 0.0
    sheet_h: float = 0.0
    weight: Optional[float] = None
    cut_length: float = 0.0
    pierces: int = 0
    processing_time: str = "00:00:00"
    parts: List[PartInfo] = field(default_factory=list)
    order_number: str = "001"
    customer: str = ""
    sheet_count: int = 1


class CypcutParser:
    """Универсальный парсер CYPCUT файлов"""

    @staticmethod
    def extract_from_filename(filename: str) -> dict:
        result = {"thickness": None, "order_number": None}

        thick_match = re.search(r'(\d+[,\.]?\d*)\s*мм', filename, re.I)
        if thick_match:
            result["thickness"] = float(thick_match.group(1).replace(',', '.'))

        order_match = re.search(r'\d+мм\s*(\d+)', filename, re.I)
        if order_match:
            result["order_number"] = order_match.group(1)

        return result

    @staticmethod
    def extract_text_with_word(filepath: str) -> str:
        if not WIN32_AVAILABLE:
            raise RuntimeError("pywin32 не установлен")

        try:
            word = win32com.client.Dispatch("Word.Application")
            word.Visible = False
            word.DisplayAlerts = 0

            abs_path = Path(filepath).absolute()
            doc = word.Documents.Open(str(abs_path))
            text = doc.Range().Text

            doc.Close(False)
            word.Quit()

            return text
        except Exception as e:
            raise RuntimeError(f"Ошибка Word: {e}")

    @staticmethod
    def extract_text_with_antiword(filepath: str) -> str:
        try:
            result = subprocess.run(
                ['antiword', filepath],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode != 0:
                raise RuntimeError(f"antiword error: {result.stderr}")
            return result.stdout
        except FileNotFoundError:
            raise RuntimeError("antiword не установлен")

    @classmethod
    def extract_text(cls, filepath: str) -> str:
        if WIN32_AVAILABLE:
            try:
                return cls.extract_text_with_word(filepath)
            except Exception as e:
                print(f"⚠️  Word failed: {e}")

        try:
            return cls.extract_text_with_antiword(filepath)
        except Exception as e:
            print(f"⚠️  antiword failed: {e}")

        raise RuntimeError("Не удалось извлечь текст")

    @staticmethod
    def clean_text(text: str) -> str:
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
        lines = text.split('\n')
        cleaned_lines = [re.sub(r'[ \t]+', ' ', line.strip()) for line in lines]
        return '\n'.join(line for line in cleaned_lines if line)

    @classmethod
    def parse_file(cls, filepath: str) -> CypcutData:
        filepath = Path(filepath)
        raw_text = cls.extract_text(str(filepath))
        text = cls.clean_text(raw_text)
        file_data = cls.extract_from_filename(filepath.name)

        return cls._parse_text(text, file_data, filepath.name)

    @classmethod
    def parse_bytes(cls, content: bytes, filename: str) -> CypcutData:
        with tempfile.NamedTemporaryFile(suffix='.doc', delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            return cls.parse_file(tmp_path)
        finally:
            os.unlink(tmp_path)

    @classmethod
    def _parse_text(cls, text: str, file_data: dict, filename: str) -> CypcutData:
        def find_value(pattern: str) -> Optional[str]:
            match = re.search(rf'(?:\|\s*)?{pattern}\s*:\s*([^\n|]+)', text, re.IGNORECASE)
            return match.group(1).strip() if match else None

        # Основные поля
        material = find_value('Материал') or "Steel"

        size_str = find_value('Размер')
        sheet_w, sheet_h = 0.0, 0.0
        if size_str:
            size_match = re.search(r'(\d+[,\.]?\d*)\s*[XxхХ]\s*(\d+[,\.]?\d*)', size_str)
            if size_match:
                sheet_w = float(size_match.group(1).replace(',', '.'))
                sheet_h = float(size_match.group(2).replace(',', '.'))

        thickness = file_data["thickness"]
        if not thickness:
            thick_str = find_value('Толщина')
            if thick_str:
                try:
                    thickness = float(thick_str.replace(',', '.'))
                except:
                    thickness = 0.0

        weight = None
        weight_str = find_value('Вес')
        if weight_str:
            weight_match = re.search(r'([\d.,]+)', weight_str)
            if weight_match:
                try:
                    weight = float(weight_match.group(1).replace(',', '.'))
                except:
                    pass

        sheet_count = 1
        sheet_str = find_value('Количество листов')
        if sheet_str:
            try:
                sheet_count = int(sheet_str)
            except:
                pass

        customer = find_value('Заказчик') or ""

        cut_length = 0.0
        cut_str = find_value(r'Резка \(мм\)') or find_value('Резка')
        if cut_str:
            cut_match = re.search(r'([\d.,]+)', cut_str)
            if cut_match:
                try:
                    cut_length = float(cut_match.group(1).replace(',', '.'))
                except:
                    pass

        pierces = 0
        pierces_str = find_value(r'Кол\s*\.\s*проколов')
        if pierces_str:
            try:
                pierces = int(pierces_str)
            except:
                pass

        processing_time = "00:00:00"
        time_str = find_value(r'Время,\s*всего')
        if time_str:
            time_match = re.search(r'(\d+):(\d+)', time_str)
            if time_match:
                processing_time = f"00:{time_match.group(1)}:{time_match.group(2)}"

        # ПАРСИНГ ДЕТАЛЕЙ
        parts = []
        lines = text.split('\n')

        in_table = False
        current_part = {}
        suffix_pattern = re.compile(r'[\s-]*\d+\s*[ШшСс][Тт]\s*$', re.I)

        for raw_line in lines:
            line = raw_line.replace('|', '').strip()

            if not line:
                continue

            if 'Имя детали' in line:
                in_table = True
                continue

            if not in_table:
                continue

            if line in ('DX', 'DY', 'Кол-во') or line.startswith('---'):
                continue

            # Номер детали
            if re.match(r'^\d+\s*$', line):
                if current_part.get('name') and current_part.get('dx', 0) > 0 and current_part.get('dy', 0) > 0:
                    parts.append(PartInfo(
                        name=current_part['name'],
                        dx=current_part.get('dx', 0.0),
                        dy=current_part.get('dy', 0.0),
                        quantity=current_part.get('qty', 1)
                    ))
                current_part = {}
                continue

            # Путь к файлу — ИСПРАВЛЕНО: ищем диск (D :, C : и т.д.)
            if re.match(r'^[A-Za-z]\s*:\\', line):
                full_name = Path(line).name
                clean_name = suffix_pattern.sub('', full_name).strip()
                current_part['name'] = clean_name
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

        # Последняя деталь
        if current_part.get('name') and current_part.get('dx', 0) > 0 and current_part.get('dy', 0) > 0:
            parts.append(PartInfo(
                name=current_part['name'],
                dx=current_part.get('dx', 0.0),
                dy=current_part.get('dy', 0.0),
                quantity=current_part.get('qty', 1)
            ))

        return CypcutData(
            material=material,
            thickness=thickness or 0.0,
            sheet_w=sheet_w,
            sheet_h=sheet_h,
            weight=weight,
            cut_length=cut_length,
            pierces=pierces,
            processing_time=processing_time,
            parts=parts,
            order_number=file_data["order_number"] or "001",
            customer=customer,
            sheet_count=sheet_count
        )