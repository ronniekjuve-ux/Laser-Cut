# -*- coding: utf-8 -*-
"""add warehouse tables and layout_sheets_used column

Revision ID: 004
Revises: 003
Create Date: 2026-07-12

"""
from alembic import op
import sqlalchemy as sa

revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade():
    # warehouse_items
    op.create_table(
        'warehouse_items',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('metal', sa.String(50), nullable=False),
        sa.Column('grade', sa.String(50), nullable=True),
        sa.Column('size', sa.String(50), nullable=True),
        sa.Column('thickness', sa.Float(), nullable=True),
        sa.Column('sheet_w', sa.Float(), nullable=True),
        sa.Column('sheet_h', sa.Float(), nullable=True),
        sa.Column('sheet_count', sa.Integer(), server_default='0'),
        sa.Column('weight', sa.Float(), nullable=True),
        sa.Column('min_quantity', sa.Integer(), nullable=True),
        sa.Column('article', sa.String(50), nullable=True, unique=True),
        sa.Column('item_type', sa.String(20), server_default='standard'),
        sa.Column('owner', sa.String(100), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('last_deducted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # warehouse_movement
    op.create_table(
        'warehouse_movement',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('warehouse_item_id', sa.Integer(), sa.ForeignKey('warehouse_items.id'), nullable=False),
        sa.Column('application_id', sa.Integer(), sa.ForeignKey('applications.id'), nullable=True),
        sa.Column('quantity_change', sa.Integer(), nullable=False),
        sa.Column('movement_type', sa.String(20), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # warehouse_remnants
    op.create_table(
        'warehouse_remnants',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('warehouse_item_id', sa.Integer(), sa.ForeignKey('warehouse_items.id'), nullable=False),
        sa.Column('article', sa.String(50), nullable=True, unique=True),
        sa.Column('original_w', sa.Float(), nullable=False),
        sa.Column('original_h', sa.Float(), nullable=False),
        sa.Column('vertices', sa.Text(), nullable=False),
        sa.Column('area', sa.Float(), nullable=True),
        sa.Column('weight', sa.Float(), nullable=True),
        sa.Column('is_available', sa.Boolean(), server_default='true'),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Add warehouse columns to applications
    op.add_column('applications', sa.Column('warehouse_item_id', sa.Integer(), sa.ForeignKey('warehouse_items.id'), nullable=True))
    op.add_column('applications', sa.Column('sheets_used', sa.Integer(), nullable=True))
    op.add_column('applications', sa.Column('warehouse_deducted', sa.Boolean(), server_default='false', nullable=True))

    # Add warehouse columns to application_layouts
    op.add_column('application_layouts', sa.Column('warehouse_item_id', sa.Integer(), sa.ForeignKey('warehouse_items.id'), nullable=True))
    op.add_column('application_layouts', sa.Column('layout_sheets_used', sa.Integer(), nullable=True))

    # Update alembic version
    op.execute("UPDATE alembic_version SET version_num = '004'")


def downgrade():
    op.drop_column('application_layouts', 'layout_sheets_used')
    op.drop_column('application_layouts', 'warehouse_item_id')
    op.drop_column('applications', 'warehouse_deducted')
    op.drop_column('applications', 'sheets_used')
    op.drop_column('applications', 'warehouse_item_id')
    op.drop_table('warehouse_remnants')
    op.drop_table('warehouse_movement')
    op.drop_table('warehouse_items')
