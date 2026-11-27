"""Ship Register: ship_particulars, ship_equipment, equipment_master (+ default equipment names)

Revision ID: 0040
Revises: 0039
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0040"
down_revision: Union[str, None] = "0039"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_EQUIPMENT = [
    "Boiler", "Exhaust Gas Economizer", "Fresh Water Generator", "Oily Water Separator",
    "Sewage Treatment Plant", "Incinerator", "Fuel Oil Purifier", "Lube Oil Purifier",
    "Main Air Compressor", "Emergency Air Compressor", "Steering Gear", "Bow Thruster",
    "Ballast Water Treatment System", "Fire Pump", "Emergency Fire Pump", "Ballast Pump",
    "Cargo Pump", "Provision Refrigeration Plant", "Air Conditioning Plant", "Anchor Windlass",
    "Mooring Winch", "Deck Crane", "Lifeboat", "Rescue Boat", "Davit",
]


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())

    if "ship_particulars" not in tables:
        op.create_table(
            "ship_particulars",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("vessel_id", sa.Integer(), sa.ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False),
            sa.Column("official_no", sa.String(50)),
            sa.Column("mmsi", sa.String(9)),
            sa.Column("gross_tonnage", sa.String(30)),
            sa.Column("net_tonnage", sa.String(30)),
            sa.Column("deadweight", sa.String(30)),
            sa.Column("p_and_i", sa.String(200)),
            sa.Column("h_and_m", sa.String(200)),
            sa.Column("tech_manager", sa.String(200)),
            sa.Column("tech_manager_email", sa.String(320)),
            sa.Column("tech_manager_email2", sa.String(320)),
            sa.Column("tech_manager_phone", sa.String(50)),
            sa.Column("tech_manager_phone2", sa.String(50)),
            sa.Column("crew_manager", sa.String(200)),
            sa.Column("crew_manager_email", sa.String(320)),
            sa.Column("crew_manager_email2", sa.String(320)),
            sa.Column("crew_manager_phone", sa.String(50)),
            sa.Column("crew_manager_phone2", sa.String(50)),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("updated_by_email", sa.String(320)),
        )
        op.create_index("ix_ship_particulars_vessel_id", "ship_particulars", ["vessel_id"], unique=True)

    if "ship_equipment" not in tables:
        op.create_table(
            "ship_equipment",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("vessel_id", sa.Integer(), sa.ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False),
            sa.Column("category", sa.String(30), nullable=False),
            sa.Column("equipment_name", sa.String(200)),
            sa.Column("make", sa.String(200)),
            sa.Column("model", sa.String(200)),
            sa.Column("serial_number", sa.String(100)),
            sa.Column("power", sa.String(30)),
            sa.Column("power_unit", sa.String(10)),
            sa.Column("rpm", sa.String(20)),
            sa.Column("specification", sa.Text()),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index("ix_ship_equipment_vessel_id", "ship_equipment", ["vessel_id"])
        op.create_index("ix_ship_equipment_category", "ship_equipment", ["category"])

    if "equipment_master" not in tables:
        op.create_table(
            "equipment_master",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index("ix_equipment_master_name", "equipment_master", ["name"], unique=True)

    existing = {r[0].strip().lower() for r in bind.execute(sa.text("SELECT name FROM equipment_master"))}
    for i, name in enumerate(DEFAULT_EQUIPMENT):
        if name.lower() not in existing:
            bind.execute(sa.text("INSERT INTO equipment_master (name, sort_order, active) VALUES (:n, :o, true)"),
                         {"n": name, "o": i})


def downgrade() -> None:
    op.drop_table("ship_equipment")
    op.drop_table("ship_particulars")
    op.drop_table("equipment_master")
