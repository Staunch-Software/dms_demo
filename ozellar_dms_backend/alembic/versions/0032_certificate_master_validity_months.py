"""add default_validity_months to certificate_master

Revision ID: 0032
Revises: 0031
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0032"
down_revision: Union[str, None] = "0031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    if "certificate_master" in existing_tables:
        cols = {c["name"] for c in inspector.get_columns("certificate_master")}
        if "default_validity_months" not in cols:
            op.add_column(
                "certificate_master",
                sa.Column("default_validity_months", sa.Integer(), nullable=True),
            )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    if "certificate_master" in existing_tables:
        cols = {c["name"] for c in inspector.get_columns("certificate_master")}
        if "default_validity_months" in cols:
            op.drop_column("certificate_master", "default_validity_months")
