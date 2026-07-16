#!/bin/sh
set -e

echo "=== Ensuring schema changes ==="
python /app/scripts/ensure_password_plain.py

echo "=== Running alembic migrations ==="
alembic upgrade heads || echo "Migration skipped (already applied or chain issue)"

echo "=== Applying SQL migrations ==="
python /app/scripts/apply_sql_migrations.py || echo "SQL migration skipped"

echo "=== Creating admin user ==="
python /app/scripts/create_admin.py || echo "Admin user creation skipped"

echo "=== Starting application ==="
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
