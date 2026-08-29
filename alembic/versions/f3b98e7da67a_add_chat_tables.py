"""add chat tables

Revision ID: f3b98e7da67a
Revises: 006
Create Date: 2026-08-29 17:46:26.745114

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f3b98e7da67a'
down_revision: Union[str, None] = '006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('sender_id', sa.Integer(), nullable=False),
        sa.Column('chat_type', sa.Enum('GENERAL', 'PERSONAL', name='chattype'), nullable=False),
        sa.Column('chat_id', sa.Integer(), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('reply_to_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['chat_id'], ['users.id']),
        sa.ForeignKeyConstraint(['reply_to_id'], ['messages.id']),
        sa.ForeignKeyConstraint(['sender_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_messages_sender_id'), 'messages', ['sender_id'], unique=False)
    op.create_index(op.f('ix_messages_chat_id'), 'messages', ['chat_id'], unique=False)

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
    op.drop_index(op.f('ix_message_mentions_mentioned_user_id'), table_name='message_mentions')
    op.drop_index(op.f('ix_message_mentions_message_id'), table_name='message_mentions')
    op.drop_table('message_mentions')
    op.drop_index(op.f('ix_messages_chat_id'), table_name='messages')
    op.drop_index(op.f('ix_messages_sender_id'), table_name='messages')
    op.drop_table('messages')
