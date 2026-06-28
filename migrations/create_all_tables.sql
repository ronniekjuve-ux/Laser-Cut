-- Full schema migration: creates all missing tables
-- Applied automatically by scripts/apply_sql_migrations.py

CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS objects (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS order_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS applications (
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
);

CREATE INDEX IF NOT EXISTS idx_applications_customer_id ON applications(customer_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);

CREATE TABLE IF NOT EXISTS application_layouts (
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
);

CREATE TABLE IF NOT EXISTS application_layout_parts (
    id SERIAL PRIMARY KEY,
    layout_id INTEGER NOT NULL REFERENCES application_layouts(id),
    name VARCHAR(255) NOT NULL,
    dx DOUBLE PRECISION NOT NULL,
    dy DOUBLE PRECISION NOT NULL,
    quantity INTEGER NOT NULL,
    weight DOUBLE PRECISION,
    image_path VARCHAR(500)
);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    object_id INTEGER REFERENCES objects(id),
    number VARCHAR(50) UNIQUE NOT NULL,
    steel_grade VARCHAR(20) DEFAULT 'St3',
    active_version_id INTEGER,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS file_versions (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    version INTEGER NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_layouts (
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
);

CREATE TABLE IF NOT EXISTS order_parts (
    id SERIAL PRIMARY KEY,
    layout_id INTEGER NOT NULL REFERENCES order_layouts(id),
    name VARCHAR(100) NOT NULL,
    dx DOUBLE PRECISION NOT NULL,
    dy DOUBLE PRECISION NOT NULL,
    quantity INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token_jti VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE,
    device_info VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    action VARCHAR(50) NOT NULL,
    resource VARCHAR(50) NOT NULL,
    resource_id INTEGER,
    details VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS deficit_requests (
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
);

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    related_app_id INTEGER REFERENCES applications(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS change_log (
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
);

CREATE TABLE IF NOT EXISTS user_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    action_type VARCHAR(50) DEFAULT 'api_call',
    details VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS login_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    login_at TIMESTAMPTZ DEFAULT NOW(),
    logout_at TIMESTAMPTZ,
    ip_address VARCHAR(50),
    user_agent VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS operator_shifts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    date TIMESTAMPTZ NOT NULL,
    shift_type VARCHAR(10) DEFAULT 'day',
    hours DOUBLE PRECISION DEFAULT 8.0,
    machine_type VARCHAR(10),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operator_monthly_stats (
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
);

CREATE TABLE IF NOT EXISTS schedule_overrides (
    id SERIAL PRIMARY KEY,
    date TIMESTAMPTZ UNIQUE NOT NULL,
    st1 VARCHAR(50),
    st2 VARCHAR(50),
    night VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouse_items (
    id SERIAL PRIMARY KEY,
    metal VARCHAR(50) NOT NULL,
    grade VARCHAR(50),
    size VARCHAR(50),
    sheet_count INTEGER DEFAULT 0,
    owner VARCHAR(100),
    note TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type VARCHAR(20) NOT NULL,
    text TEXT NOT NULL,
    image_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'new',
    admin_response TEXT,
    admin_response_image VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
