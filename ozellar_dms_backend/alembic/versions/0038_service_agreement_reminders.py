"""Service agreements: remember which expiry date the reminder / expired emails were sent for

Revision ID: 0038
Revises: 0037
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0038"
down_revision: Union[str, None] = "0037"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "service_agreements"
_COLUMNS = ["reminder_sent_for", "expired_notice_sent_for"]


def upgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns(_TABLE)}
    for name in _COLUMNS:
        if name not in existing:
            op.add_column(_TABLE, sa.Column(name, sa.Date(), nullable=True))


def downgrade() -> None:
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns(_TABLE)}
    for name in _COLUMNS:
        if name in existing:
            op.drop_column(_TABLE, name)
