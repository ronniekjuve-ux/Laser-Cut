# -*- coding: utf-8 -*-
"""Проверка парсера на образцах из samples/."""
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.unified_parser import (
    extract_text,
    parse_application_text,
    parse_layout_text,
    merge_data,
)

def main():
    app_path = ROOT / "samples" / "8мм.DOC"
    lay_path = ROOT / "samples" / "8мм001.Cnf.DOC"
    out = {}

    for key, path in [("application", app_path), ("layout", lay_path)]:
        text = extract_text(str(path))
        out[f"{key}_text_len"] = len(text)
        out[f"{key}_preview"] = text[:500]
        if key == "application":
            data = parse_application_text(text)
            out["application"] = {
                "order_name": data.order_name,
                "material": data.material,
                "thickness": data.thickness,
                "total_weight": data.total_weight,
                "parts_count": len(data.parts),
                "parts_sample": [
                    {"name": p.name_raw, "weight": p.weight, "qty": p.qty}
                    for p in data.parts[:5]
                ],
            }
        else:
            data = parse_layout_text(text, path.name)
            out["layout"] = {
                "layout_code": data.layout_code,
                "machine_type": data.machine_type,
                "sheet_w": data.sheet_w,
                "sheet_h": data.sheet_h,
                "sheet_weight": data.sheet_weight,
                "cut_time": data.cut_time,
                "move_time": data.move_time,
                "pierce_time": data.pierce_time,
                "total_time": getattr(data, "total_time", None),
                "cut_length": getattr(data, "cut_length", None),
                "travel_length": getattr(data, "travel_length", None),
                "pierces": getattr(data, "pierces", None),
                "sheet_count": getattr(data, "sheet_count", None),
                "parts_count": len(data.parts),
                "parts_sample": [
                    {"name": p.name, "dx": p.dx, "dy": p.dy, "qty": p.quantity}
                    for p in data.parts[:5]
                ],
            }

    ad = parse_application_text(extract_text(str(app_path)))
    ld = parse_layout_text(extract_text(str(lay_path)), lay_path.name)
    merged = merge_data(ad, ld)
    out["merged_count"] = len(merged)
    out["merged_sample"] = [
        {"name": m.name, "dx": m.dx, "dy": m.dy, "qty": m.quantity, "weight": m.weight}
        for m in merged[:5]
    ]

    result_path = ROOT / "scripts" / "parser_sample_result.json"
    result_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(result_path)


if __name__ == "__main__":
    main()
