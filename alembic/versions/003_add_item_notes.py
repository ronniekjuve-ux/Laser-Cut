# -*- coding: utf-8 -*-
"""add_item_notes

Revision ID: 003
Revises: 002
Create Date: 2026-07-05

"""
from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '166308c53fa6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'item_notes',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('item_type', sa.String(20), nullable=False),
        sa.Column('item_id', sa.Integer(), nullable=False, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('username', sa.String(50), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade():
    op.drop_table('item_notes')
