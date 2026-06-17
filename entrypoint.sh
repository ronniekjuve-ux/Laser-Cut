#!/bin/sh
set -e

echo "Running database migrations..."
alembic upgrade heads || echo "Migration skipped (multiple heads or already applied)"

echo "Starting application..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
