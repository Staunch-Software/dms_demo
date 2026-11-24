"""ship type master

Revision ID: 0031
Revises: 0030
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0031"
down_revision: Union[str, None] = "0030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_TYPES = [
    "Bulk Carrier", "Container Ship", "Container Carrier", "Gas Carrier", "Oil Tanker",
    "Chemical Tanker", "General Cargo", "Offshore Support", "Reffer Carrier", "Other Cargo Ships",
]


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "ship_types" not in insp.get_table_names():
        op.create_table(
            "ship_types",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index("ix_ship_types_name", "ship_types", ["name"], unique=True)

    # A ship_types table may already exist (created outside Alembic): add what is missing.
    cols = {c["name"] for c in sa.inspect(bind).get_columns("ship_types")}
    if "sort_order" not in cols:
        op.add_column("ship_types", sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"))
    if "active" not in cols:
        op.add_column("ship_types", sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")))

    existing = {r[0].strip().lower() for r in bind.execute(sa.text("SELECT name FROM ship_types"))}
    names = list(DEFAULT_TYPES)
    # Keep any type already typed onto a vessel so nothing disappears from dropdowns.
    for (vt,) in bind.execute(sa.text("SELECT DISTINCT vessel_type FROM vessels WHERE vessel_type IS NOT NULL")):
        vt = (vt or "").strip()
        if vt and vt.lower() not in {n.lower() for n in names}:
            names.append(vt)
    for i, n in enumerate(names):
        if n.lower() not in existing:
            bind.execute(sa.text("INSERT INTO ship_types (name, sort_order, active) VALUES (:n, :o, true)"), {"n": n, "o": i})


def downgrade() -> None:
    op.drop_index("ix_ship_types_name", table_name="ship_types")
    op.drop_table("ship_types")
