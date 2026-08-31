# -*- coding: utf-8 -*-
"""add_login_history_device_fields

Revision ID: 008
Revises: 006, 007
Create Date: 2026-08-31

"""
from alembic import op
import sqlalchemy as sa

revision = '008'
down_revision = ('006', '007')
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('login_history', sa.Column('device_id', sa.String(64), nullable=True))
    op.add_column('login_history', sa.Column('device_name', sa.String(100), nullable=True))
    op.add_column('login_history', sa.Column('device_type', sa.String(20), nullable=True))
    op.create_index('ix_login_history_device_id', 'login_history', ['device_id'])


def downgrade():
    op.drop_index('ix_login_history_device_id', table_name='login_history')
    op.drop_column('login_history', 'device_type')
    op.drop_column('login_history', 'device_name')
    op.drop_column('login_history', 'device_id')
