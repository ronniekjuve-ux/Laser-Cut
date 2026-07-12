import sys
sys.path.insert(0, '/app')

import asyncio
from app.db.base import engine
from sqlalchemy import text

MIGRATIONS = [
    # 1. Р”РѕР±Р°РІРёС‚СЊ РєРѕР»РѕРЅРєРё РІ users
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ;",

    # 2. customers
    """CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );""",

    # 3. objects
    """CREATE TABLE IF NOT EXISTS objects (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        name VARCHAR(100) NOT NULL
    );""",

    # 4. order_groups
    """CREATE TABLE IF NOT EXISTS order_groups (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW()
    );""",

    # 5. applications
    """CREATE TABLE IF NOT EXISTS applications (
        id SERIAL PRIMARY KEY,
        order_name VARCHAR(50) UNIQUE NOT NULL,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        material VARCHAR(50) DEFAULT 'Steel',
        steel_grade VARCHAR(50),
        thickness DOUBLE PRECISION NOT NULL,
        total_weight DOUBLE PRECISION,
        total_parts_count INTEGER DEFAULT 0,
        total_time VARCHAR(20) DEFAULT '00:00:00',
        detail_images TEXT,
        comments TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        priority VARCHAR(20) DEFAULT 'medium',
        supply_material BOOLEAN,
        cut_at TIMESTAMPTZ,
        cut_by INTEGER REFERENCES users(id),
        updated_by INTEGER REFERENCES users(id),
        group_id INTEGER REFERENCES order_groups(id)
    );""",
    "CREATE INDEX IF NOT EXISTS idx_applications_customer_id ON applications(customer_id);",
    "CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);",

    # 6. application_layouts
    """CREATE TABLE IF NOT EXISTS application_layouts (
        id SERIAL PRIMARY KEY,
        application_id INTEGER NOT NULL REFERENCES applications(id),
        layout_code VARCHAR(50) NOT NULL,
        machine_type VARCHAR(10) NOT NULL,
        sheet_w DOUBLE PRECISION NOT NULL,
        sheet_h DOUBLE PRECISION NOT NULL,
        sheet_weight DOUBLE PRECISION,
        sheet_count INTEGER DEFAULT 1,
        completed_runs TEXT,
        cut_time VARCHAR(20) NOT NULL,
        move_time VARCHAR(20) NOT NULL,
        pierce_time VARCHAR(20) NOT NULL,
        cut_length DOUBLE PRECISION,
        travel_length DOUBLE PRECISION,
        pierces INTEGER,
        cnc_path TEXT,
        layout_image VARCHAR(255),
        status VARCHAR(20) DEFAULT 'active',
        merged_from TEXT
    );""",

    # 7. application_layout_parts
    """CREATE TABLE IF NOT EXISTS application_layout_parts (
        id SERIAL PRIMARY KEY,
        layout_id INTEGER NOT NULL REFERENCES application_layouts(id),
        name VARCHAR(255) NOT NULL,
        dx DOUBLE PRECISION NOT NULL,
        dy DOUBLE PRECISION NOT NULL,
        quantity INTEGER NOT NULL,
        weight DOUBLE PRECISION,
        image_path VARCHAR(500)
    );""",

    # 8. orders
    """CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        object_id INTEGER REFERENCES objects(id),
        number VARCHAR(50) UNIQUE NOT NULL,
        steel_grade VARCHAR(20) DEFAULT 'St3',
        active_version_id INTEGER,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
    );""",

    # 9. file_versions
    """CREATE TABLE IF NOT EXISTS file_versions (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        version INTEGER NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        file_path TEXT NOT NULL,
        uploaded_at TIMESTAMPTZ DEFAULT NOW()
    );""",

    # 10. order_layouts
    """CREATE TABLE IF NOT EXISTS order_layouts (
        id SERIAL PRIMARY KEY,
        file_version_id INTEGER UNIQUE NOT NULL REFERENCES file_versions(id),
        material VARCHAR(50) NOT NULL,
        thickness DOUBLE PRECISION NOT NULL,
        sheet_w DOUBLE PRECISION NOT NULL,
        sheet_h DOUBLE PRECISION NOT NULL,
        weight DOUBLE PRECISION,
        cut_length DOUBLE PRECISION NOT NULL,
        pierces INTEGER NOT NULL,
        processing_time VARCHAR(15) NOT NULL
    );""",

    # 11. order_parts
    """CREATE TABLE IF NOT EXISTS order_parts (
        id SERIAL PRIMARY KEY,
        layout_id INTEGER NOT NULL REFERENCES order_layouts(id),
        name VARCHAR(100) NOT NULL,
        dx DOUBLE PRECISION NOT NULL,
        dy DOUBLE PRECISION NOT NULL,
        quantity INTEGER NOT NULL
    );""",

    # 12. sessions
    """CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        token_jti VARCHAR(64) UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        is_revoked BOOLEAN DEFAULT FALSE,
        device_info VARCHAR(100)
    );""",

    # 13. audit_log
    """CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        action VARCHAR(50) NOT NULL,
        resource VARCHAR(50) NOT NULL,
        resource_id INTEGER,
        details VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
    );""",

    # 14. deficit_requests
    """CREATE TABLE IF NOT EXISTS deficit_requests (
        id SERIAL PRIMARY KEY,
        application_id INTEGER REFERENCES applications(id),
        material VARCHAR(50) NOT NULL,
        thickness DOUBLE PRECISION,
        size VARCHAR(50),
        quantity INTEGER,
        customer_name VARCHAR(100),
        status VARCHAR(20) DEFAULT 'pending',
        note TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
    );""",

    # 15. notifications
    """CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        related_app_id INTEGER REFERENCES applications(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
    );""",

    # 16. change_log
    """CREATE TABLE IF NOT EXISTS change_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        user_name VARCHAR(50) NOT NULL,
        change_type VARCHAR(50) NOT NULL,
        resource VARCHAR(50) NOT NULL,
        resource_id INTEGER,
        description TEXT NOT NULL,
        old_value VARCHAR(200),
        new_value VARCHAR(200),
        created_at TIMESTAMPTZ DEFAULT NOW()
    );""",

    # 17. user_activity
    """CREATE TABLE IF NOT EXISTS user_activity (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        action_type VARCHAR(50) DEFAULT 'api_call',
        details VARCHAR(200)
    );""",

    # 18. login_history
    """CREATE TABLE IF NOT EXISTS login_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        login_at TIMESTAMPTZ DEFAULT NOW(),
        logout_at TIMESTAMPTZ,
        ip_address VARCHAR(50),
        user_agent VARCHAR(200)
    );""",

    # 19. operator_shifts
    """CREATE TABLE IF NOT EXISTS operator_shifts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        date TIMESTAMPTZ NOT NULL,
        shift_type VARCHAR(10) DEFAULT 'day',
        hours DOUBLE PRECISION DEFAULT 8.0,
        machine_type VARCHAR(10),
        created_at TIMESTAMPTZ DEFAULT NOW()
    );""",

    # 20. operator_monthly_stats
    """CREATE TABLE IF NOT EXISTS operator_monthly_stats (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        month VARCHAR(7) NOT NULL,
        planned_hours DOUBLE PRECISION DEFAULT 0.0,
        sick_hours DOUBLE PRECISION DEFAULT 0.0,
        vacation_hours DOUBLE PRECISION DEFAULT 0.0,
        overtime_hours DOUBLE PRECISION DEFAULT 0.0,
        hourly_rate DOUBLE PRECISION DEFAULT 0.0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, month)
    );""",

    # 21. schedule_overrides
    """CREATE TABLE IF NOT EXISTS schedule_overrides (
        id SERIAL PRIMARY KEY,
        date TIMESTAMPTZ UNIQUE NOT NULL,
        st1 VARCHAR(50),
        st2 VARCHAR(50),
        night VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW()
    );""",

    # 22. warehouse_items
    """CREATE TABLE IF NOT EXISTS warehouse_items (
        id SERIAL PRIMARY KEY,
        metal VARCHAR(50) NOT NULL,
        grade VARCHAR(50),
        size VARCHAR(50),
        sheet_count INTEGER DEFAULT 0,
        owner VARCHAR(100),
        note TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
    );""",

    # 23. feedback
    """CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        type VARCHAR(20) NOT NULL,
        text TEXT NOT NULL,
        image_url VARCHAR(500),
        status VARCHAR(20) DEFAULT 'new',
        admin_response TEXT,
        admin_response_image VARCHAR(500),
        created_at TIMESTAMPTZ DEFAULT NOW()
    );""",

    # 24. Drop UNIQUE constraint on order_name (allow duplicate names, unique ID only)
    "ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_order_name_key;",

    # 25. Add st1_hours, st2_hours, night_hours to schedule_overrides
    "ALTER TABLE schedule_overrides ADD COLUMN IF NOT EXISTS st1_hours DOUBLE PRECISION;",
    "ALTER TABLE schedule_overrides ADD COLUMN IF NOT EXISTS st2_hours DOUBLE PRECISION;",
    "ALTER TABLE schedule_overrides ADD COLUMN IF NOT EXISTS night_hours DOUBLE PRECISION;",

    # 26. Add placed_parts_count, ordered_parts_count to applications
    "ALTER TABLE applications ADD COLUMN IF NOT EXISTS placed_parts_count INTEGER;",
    "ALTER TABLE applications ADD COLUMN IF NOT EXISTS ordered_parts_count INTEGER;",

    # 27. Add sheet_w, sheet_h, min_quantity, last_deducted_at to warehouse_items
    "ALTER TABLE warehouse_items ADD COLUMN IF NOT EXISTS sheet_w DOUBLE PRECISION;",
    "ALTER TABLE warehouse_items ADD COLUMN IF NOT EXISTS sheet_h DOUBLE PRECISION;",
    "ALTER TABLE warehouse_items ADD COLUMN IF NOT EXISTS min_quantity INTEGER;",
    "ALTER TABLE warehouse_items ADD COLUMN IF NOT EXISTS last_deducted_at TIMESTAMPTZ;",

    # 28. Create warehouse_movement table
    """CREATE TABLE IF NOT EXISTS warehouse_movement (
        id SERIAL PRIMARY KEY,
        warehouse_item_id INTEGER NOT NULL REFERENCES warehouse_items(id),
        application_id INTEGER REFERENCES applications(id),
        quantity_change INTEGER NOT NULL,
        movement_type VARCHAR(20) NOT NULL,
        reason TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
    );""",
    "CREATE INDEX IF NOT EXISTS idx_warehouse_movement_item ON warehouse_movement(warehouse_item_id);",
    "CREATE INDEX IF NOT EXISTS idx_warehouse_movement_app ON warehouse_movement(application_id);",

    # 29. Add warehouse_item_id, sheets_used, warehouse_deducted to applications
    "ALTER TABLE applications ADD COLUMN IF NOT EXISTS warehouse_item_id INTEGER REFERENCES warehouse_items(id);",
    "ALTER TABLE applications ADD COLUMN IF NOT EXISTS sheets_used INTEGER;",
    "ALTER TABLE applications ADD COLUMN IF NOT EXISTS warehouse_deducted BOOLEAN DEFAULT FALSE;",

    # 30. Add article, weight, item_type to warehouse_items
    "ALTER TABLE warehouse_items ADD COLUMN IF NOT EXISTS article VARCHAR(50);",
    "ALTER TABLE warehouse_items ADD COLUMN IF NOT EXISTS weight DOUBLE PRECISION;",
    "ALTER TABLE warehouse_items ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) DEFAULT 'standard';",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouse_items_article ON warehouse_items(article) WHERE article IS NOT NULL;",

    # 31. Create warehouse_remnants table
    """CREATE TABLE IF NOT EXISTS warehouse_remnants (
        id SERIAL PRIMARY KEY,
        warehouse_item_id INTEGER NOT NULL REFERENCES warehouse_items(id),
        article VARCHAR(50) UNIQUE,
        original_w DOUBLE PRECISION NOT NULL,
        original_h DOUBLE PRECISION NOT NULL,
        vertices JSON NOT NULL,
        area DOUBLE PRECISION,
        weight DOUBLE PRECISION,
        is_available BOOLEAN DEFAULT TRUE,
        note TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
    );""",
    "CREATE INDEX IF NOT EXISTS idx_warehouse_remnants_item ON warehouse_remnants(warehouse_item_id);",

    # 32. Add layout_id binding to application_layouts
    "ALTER TABLE application_layouts ADD COLUMN IF NOT EXISTS warehouse_item_id INTEGER REFERENCES warehouse_items(id);",
    "ALTER TABLE application_layouts ADD COLUMN IF NOT EXISTS sheets_used INTEGER;",

    # 33. Add thickness to warehouse_items
    "ALTER TABLE warehouse_items ADD COLUMN IF NOT EXISTS thickness DOUBLE PRECISION;",

    # 34. Add layout_sheets_used to application_layouts
    "ALTER TABLE application_layouts ADD COLUMN IF NOT EXISTS layout_sheets_used INTEGER;",
]

async def main():
    async with engine.begin() as conn:
        for i, stmt in enumerate(MIGRATIONS):
            try:
                await conn.execute(text(stmt))
                print(f"OK [{i+1}/{len(MIGRATIONS)}]: {stmt.strip()[:50]}...")
            except Exception as e:
                print(f"Skip [{i+1}/{len(MIGRATIONS)}]: {stmt.strip()[:50]}... ({e})")

asyncio.run(main())
