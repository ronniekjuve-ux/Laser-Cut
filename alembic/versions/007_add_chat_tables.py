"""add chat tables

Revision ID: 007
Revises: 003
Create Date: 2026-08-31 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '007'
down_revision: Union[str, None] = '003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    result = bind.execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :name)")
    , {"name": table_name})
    return result.scalar()


def upgrade() -> None:
    if not table_exists('messages'):
        op.create_table('messages',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('sender_id', sa.Integer(), nullable=False),
            sa.Column('chat_type', sa.Enum('general', 'personal', name='chattype', create_type=False), nullable=False),
            sa.Column('chat_id', sa.Integer(), nullable=True),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('reply_to_id', sa.Integer(), nullable=True),
            sa.Column('is_edited', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('is_deleted', sa.Boolean(), server_default='false', nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(['chat_id'], ['users.id']),
            sa.ForeignKeyConstraint(['reply_to_id'], ['messages.id']),
            sa.ForeignKeyConstraint(['sender_id'], ['users.id']),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_messages_sender_id'), 'messages', ['sender_id'], unique=False)
        op.create_index(op.f('ix_messages_chat_id'), 'messages', ['chat_id'], unique=False)
    else:
        # Table exists — add missing columns
        conn = op.get_bind()
        cols = {row[0] for row in conn.execute(sa.text(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'messages'"
        ))}
        if 'is_edited' not in cols:
            op.add_column('messages', sa.Column('is_edited', sa.Boolean(), server_default='false', nullable=False))
        if 'is_deleted' not in cols:
            op.add_column('messages', sa.Column('is_deleted', sa.Boolean(), server_default='false', nullable=False))

    if not table_exists('message_mentions'):
        op.create_table('message_mentions',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('message_id', sa.Integer(), nullable=False),
            sa.Column('mentioned_user_id', sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(['message_id'], ['messages.id']),
            sa.ForeignKeyConstraint(['mentioned_user_id'], ['users.id']),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('message_id', 'mentioned_user_id')
        )
        op.create_index(op.f('ix_message_mentions_message_id'), 'message_mentions', ['message_id'], unique=False)
        op.create_index(op.f('ix_message_mentions_mentioned_user_id'), 'message_mentions', ['mentioned_user_id'], unique=False)


def downgrade() -> None:
    if table_exists('message_mentions'):
        op.drop_index(op.f('ix_message_mentions_mentioned_user_id'), table_name='message_mentions')
        op.drop_index(op.f('ix_message_mentions_message_id'), table_name='message_mentions')
        op.drop_table('message_mentions')
    if table_exists('messages'):
        op.drop_index(op.f('ix_messages_chat_id'), table_name='messages')
        op.drop_index(op.f('ix_messages_sender_id'), table_name='messages')
        op.drop_table('messages')
