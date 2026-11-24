"""Certificate master: remarks, validity_note (client's renewal wording) and an explicit no_expiry flag

Revision ID: 0035
Revises: 0034
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0035"
down_revision: Union[str, None] = "0034"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "certificate_master"
_COLUMNS = [
    ("remarks", sa.Column("remarks", sa.Text(), nullable=True)),
    ("validity_note", sa.Column("validity_note", sa.String(255), nullable=True)),
    ("no_expiry", sa.Column("no_expiry", sa.Boolean(), nullable=False, server_default=sa.false())),
]


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if _TABLE not in set(inspector.get_table_names()):
        return
    existing = {c["name"] for c in inspector.get_columns(_TABLE)}
    added_no_expiry = "no_expiry" not in existing
    for name, column in _COLUMNS:
        if name not in existing:
            op.add_column(_TABLE, column)
    if added_no_expiry:
        # Keep today's meaning for existing types: no validity period set = Permanent.
        op.execute(
            "UPDATE certificate_master SET no_expiry = TRUE "
            "WHERE default_validity_years IS NULL AND default_validity_months IS NULL"
        )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if _TABLE not in set(inspector.get_table_names()):
        return
    existing = {c["name"] for c in inspector.get_columns(_TABLE)}
    for name, _ in reversed(_COLUMNS):
        if name in existing:
            op.drop_column(_TABLE, name)
