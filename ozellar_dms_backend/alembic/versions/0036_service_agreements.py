"""Service agreements: agreements, the ships they cover and their renewal history

Revision ID: 0036
Revises: 0035
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0036"
down_revision: Union[str, None] = "0035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The backend's startup create_all() may already have made these tables.
    existing = set(sa.inspect(op.get_bind()).get_table_names())

    if "service_agreements" not in existing:
        op.create_table(
            "service_agreements",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("contract_no", sa.String(40), nullable=False),
            sa.Column("agreement_name", sa.String(300), nullable=False),
            sa.Column("vendor", sa.String(300), nullable=True),
            sa.Column("category", sa.String(150), nullable=True),
            sa.Column("sub_category", sa.String(150), nullable=True),
            sa.Column("vendor_reference", sa.String(150), nullable=True),
            sa.Column("issue_date", sa.Date(), nullable=True),
            sa.Column("expiry_date", sa.Date(), nullable=True),
            sa.Column("validity_note", sa.String(255), nullable=True),
            sa.Column("applies_to_all_ships", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("remarks", sa.Text(), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="active"),
            sa.Column("sharepoint_file_url", sa.String(1024), nullable=True),
            sa.Column("sharepoint_item_id", sa.String(256), nullable=True),
            sa.Column("sharepoint_drive_id", sa.String(256), nullable=True),
            sa.Column("filename", sa.String(255), nullable=True),
            sa.Column("created_by", sa.String(320), nullable=True),
            sa.Column("updated_by", sa.String(320), nullable=True),
            sa.Column("closed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index("ix_service_agreements_contract_no", "service_agreements", ["contract_no"], unique=True)
        op.create_index("ix_service_agreements_vendor", "service_agreements", ["vendor"])
        op.create_index("ix_service_agreements_category", "service_agreements", ["category"])
        op.create_index("ix_service_agreements_expiry_date", "service_agreements", ["expiry_date"])
        op.create_index("ix_service_agreements_status", "service_agreements", ["status"])

    if "service_agreement_vessels" not in existing:
        op.create_table(
            "service_agreement_vessels",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("agreement_id", sa.Integer(), sa.ForeignKey("service_agreements.id", ondelete="CASCADE"), nullable=False),
            sa.Column("vessel_id", sa.Integer(), sa.ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False),
            sa.UniqueConstraint("agreement_id", "vessel_id", name="uq_service_agreement_vessel"),
        )
        op.create_index("ix_service_agreement_vessels_agreement_id", "service_agreement_vessels", ["agreement_id"])
        op.create_index("ix_service_agreement_vessels_vessel_id", "service_agreement_vessels", ["vessel_id"])

    if "service_agreement_history" not in existing:
        op.create_table(
            "service_agreement_history",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("agreement_id", sa.Integer(), sa.ForeignKey("service_agreements.id", ondelete="CASCADE"), nullable=False),
            sa.Column("vendor", sa.String(300), nullable=True),
            sa.Column("vendor_reference", sa.String(150), nullable=True),
            sa.Column("issue_date", sa.Date(), nullable=True),
            sa.Column("expiry_date", sa.Date(), nullable=True),
            sa.Column("sharepoint_file_url", sa.String(1024), nullable=True),
            sa.Column("sharepoint_item_id", sa.String(256), nullable=True),
            sa.Column("filename", sa.String(255), nullable=True),
            sa.Column("renewed_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("renewed_by_email", sa.String(320), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
        )
        op.create_index("ix_service_agreement_history_agreement_id", "service_agreement_history", ["agreement_id"])


def downgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    for table in ("service_agreement_history", "service_agreement_vessels", "service_agreements"):
        if table in existing:
            op.drop_table(table)
