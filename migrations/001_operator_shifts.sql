CREATE TABLE IF NOT EXISTS operator_shifts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    date TIMESTAMPTZ,
    shift_type VARCHAR(10) DEFAULT 'day',
    hours FLOAT DEFAULT 8.0,
    machine_type VARCHAR(10),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
