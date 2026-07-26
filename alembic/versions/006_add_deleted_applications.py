# -*- coding: utf-8 -*-
"""add deleted_applications table for trash/restore functionality

Revision ID: 006
Revises: 005
Create Date: 2026-07-26

"""
from alembic import op
import sqlalchemy as sa

revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'deleted_applications',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('original_id', sa.Integer, index=True, nullable=False),
        sa.Column('order_name', sa.String(50), nullable=False),
        sa.Column('customer_id', sa.Integer, sa.ForeignKey('customers.id'), nullable=False),
        sa.Column('material', sa.String(50), default='Steel'),
        sa.Column('steel_grade', sa.String(50), nullable=True),
        sa.Column('thickness', sa.Float, nullable=False),
        sa.Column('total_weight', sa.Float, nullable=True),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('priority', sa.String(20), default='medium'),
        sa.Column('supply_material', sa.Boolean, nullable=True),
        sa.Column('comments', sa.Text, nullable=True),
        sa.Column('deleted_by', sa.Integer, sa.ForeignKey('users.id'), nullable=False),
        sa.Column('deleted_by_name', sa.String(50), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('app_data', sa.Text, nullable=True),
        sa.Column('layouts_data', sa.Text, nullable=True),
    )


def downgrade():
    op.drop_table('deleted_applications')
