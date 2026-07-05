"""merge migration chains

Revision ID: 166308c53fa6
Revises: 002, af7bee50996a
Create Date: 2026-07-05 20:45:42.413429

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '166308c53fa6'
down_revision: Union[str, None] = ('002', 'af7bee50996a')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
