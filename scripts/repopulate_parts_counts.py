# -*- coding: utf-8 -*-
"""Reparse existing DOC files to populate placed_parts_count and ordered_parts_count."""
import asyncio
import glob
from pathlib import Path
from sqlalchemy import select

from app.db.base import engine, async_session
from app.db.models import Application
from app.services.unified_parser import extract_text, parse_application_text


async def main():
    async with async_session() as db:
        result = await db.execute(select(Application))
        apps = result.scalars().all()

        updated = 0
        for app in apps:
            # Find the DOC file for this application
            patterns = [
                f"/app/data/uploads/{app.order_name}.DOC",
                f"/app/data/uploads/{app.order_name}.doc",
                f"/app/data/uploads/{app.order_name}*.DOC",
                f"/app/data/uploads/{app.order_name}*.doc",
            ]
            doc_files = []
            for p in patterns:
                doc_files.extend(glob.glob(p))
            # Filter out layout files
            doc_files = [f for f in doc_files if '_layout_' not in f.lower()]

            if not doc_files:
                print(f"SKIP #{app.id} {app.order_name}: no DOC file found")
                continue

            try:
                text = extract_text(doc_files[0])
                data = parse_application_text(text)

                if data.placed_parts_count is not None or data.ordered_parts_count is not None:
                    app.placed_parts_count = data.placed_parts_count
                    app.ordered_parts_count = data.ordered_parts_count
                    updated += 1
                    print(f"OK #{app.id} {app.order_name}: placed={data.placed_parts_count}, ordered={data.ordered_parts_count}")
                else:
                    print(f"SKIP #{app.id} {app.order_name}: no placed/ordered info in DOC")
            except Exception as e:
                print(f"ERROR #{app.id} {app.order_name}: {e}")

        await db.commit()
        print(f"\nDone: {updated}/{len(apps)} applications updated")


if __name__ == "__main__":
    asyncio.run(main())
