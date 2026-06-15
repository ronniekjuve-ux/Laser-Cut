# -*- coding: utf-8 -*-
"""add_user_activity_tracking

Revision ID: 002
Revises: 001
Create Date: 2026-06-15

"""
from alembic import op
import sqlalchemy as sa

revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('last_active', sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        'user_activity',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False, index=True),
        sa.Column('action_type', sa.String(50), nullable=False, server_default='api_call'),
        sa.Column('details', sa.String(200), nullable=True),
    )

    op.create_table(
        'login_history',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False, index=True),
        sa.Column('login_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('logout_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ip_address', sa.String(50), nullable=True),
        sa.Column('user_agent', sa.String(200), nullable=True),
    )


def downgrade():
    op.drop_table('login_history')
    op.drop_table('user_activity')
    op.drop_column('users', 'last_active')
