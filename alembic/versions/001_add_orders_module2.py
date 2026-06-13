# -*- coding: utf-8 -*-
"""add_orders_module2

Revision ID: 001
Revises:
Create Date: 2026-05-20 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Создаем таблицу customers
    op.create_table('customers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )

    # Создаем таблицу objects
    op.create_table('objects',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('customer_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Создаем таблицу orders
    op.create_table('orders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('customer_id', sa.Integer(), nullable=False),
        sa.Column('object_id', sa.Integer(), nullable=True),
        sa.Column('number', sa.String(length=50), nullable=False),
        sa.Column('steel_grade', sa.String(length=20), nullable=True, server_default='St3'),
        sa.Column('active_version_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True, server_default='pending'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.ForeignKeyConstraint(['customer_id'], ['customers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['object_id'], ['objects.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('number')
    )

    # Создаем таблицу file_versions
    op.create_table('file_versions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('order_id', sa.Integer(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('original_filename', sa.String(length=255), nullable=False),
        sa.Column('file_path', sa.Text(), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('order_id', 'version', name='uq_order_version')
    )

    # Создаем таблицу layouts
    op.create_table('layouts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('file_version_id', sa.Integer(), nullable=False),
        sa.Column('material', sa.String(length=50), nullable=False),
        sa.Column('thickness', sa.Float(), nullable=False),
        sa.Column('sheet_w', sa.Float(), nullable=False),
        sa.Column('sheet_h', sa.Float(), nullable=False),
        sa.Column('weight', sa.Float(), nullable=True),
        sa.Column('cut_length', sa.Float(), nullable=False),
        sa.Column('pierces', sa.Integer(), nullable=False),
        sa.Column('processing_time', sa.String(length=15), nullable=False),
        sa.ForeignKeyConstraint(['file_version_id'], ['file_versions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('file_version_id')
    )

    # Создаем таблицу parts
    op.create_table('parts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('layout_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('dx', sa.Float(), nullable=False),
        sa.Column('dy', sa.Float(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['layout_id'], ['layouts.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Создаем индексы для ускорения поиска
    op.create_index('ix_orders_number', 'orders', ['number'], unique=False)
    op.create_index('ix_customers_name', 'customers', ['name'], unique=False)


def downgrade():
    op.drop_index('ix_customers_name', table_name='customers')
    op.drop_index('ix_orders_number', table_name='orders')
    op.drop_table('parts')
    op.drop_table('layouts')
    op.drop_table('file_versions')
    op.drop_table('orders')
    op.drop_table('objects')
    op.drop_table('customers')