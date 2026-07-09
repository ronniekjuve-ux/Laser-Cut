"""Backfill thickness for existing applications from their .doc files."""
import asyncio
import glob
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.base import async_session
from app.db.models import Application
from app.services.unified_parser import extract_text, parse_application_text
from sqlalchemy import select
from pathlib import Path

UPLOAD_DIR = Path("/app/data/uploads")


async def fix_thickness():
    async with async_session() as db:
        result = await db.execute(
            select(Application).where(
                (Application.thickness == 0.0) | (Application.thickness.is_(None))
            )
        )
        apps = result.scalars().all()
        print(f"Found {len(apps)} applications with missing thickness")

        fixed = 0
        for app in apps:
            app_files = [
                f for f in glob.glob(f"{UPLOAD_DIR}/{app.order_name}*")
                if f.lower().endswith(('.doc', '.docx')) and '_layout_' not in f.lower()
            ]
            if not app_files:
                print(f"  #{app.id} {app.order_name}: no .doc file found, skipping")
                continue

            try:
                text = extract_text(app_files[0])
                data = parse_application_text(text)
                if data.thickness > 0:
                    app.thickness = data.thickness
                    if data.total_weight:
                        app.total_weight = data.total_weight
                    if data.material and data.material != "Steel":
                        app.material = data.material
                    fixed += 1
                    print(f"  #{app.id} {app.order_name}: thickness={data.thickness}")
                else:
                    print(f"  #{app.id} {app.order_name}: no thickness found in .doc")
            except Exception as e:
                print(f"  #{app.id} {app.order_name}: error - {e}")

        await db.commit()
        print(f"\nFixed {fixed} applications")


if __name__ == "__main__":
    asyncio.run(fix_thickness())
