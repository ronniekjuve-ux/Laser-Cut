# -*- coding: utf-8 -*-
"""add user_customers junction table for multi-customer assignment

Revision ID: 005
Revises: 004
Create Date: 2026-07-16

"""
from alembic import op
import sqlalchemy as sa

revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade():
    # Create junction table
    op.create_table(
        'user_customers',
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), primary_key=True),
        sa.Column('customer_id', sa.Integer(), sa.ForeignKey('customers.id'), primary_key=True),
    )

    # Migrate existing customer_id data from users table
    op.execute("""
        INSERT INTO user_customers (user_id, customer_id)
        SELECT id, customer_id
        FROM users
        WHERE customer_id IS NOT NULL
    """)



def downgrade():
    op.drop_table('user_customers')
