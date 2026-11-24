"""Vessel Master IMO enhancements and Certificate Management tables

Revision ID: 0030
Revises: 0029
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0030"
down_revision: Union[str, None] = "0029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    # 1. Update vessels table with additional master columns
    if "vessels" in existing_tables:
        vessel_cols = {c["name"] for c in inspector.get_columns("vessels")}
        if "flag" not in vessel_cols:
            op.add_column("vessels", sa.Column("flag", sa.String(100), nullable=True))
        if "class_society" not in vessel_cols:
            op.add_column("vessels", sa.Column("class_society", sa.String(100), nullable=True))
        if "port_of_registry" not in vessel_cols:
            op.add_column("vessels", sa.Column("port_of_registry", sa.String(150), nullable=True))
        if "call_sign" not in vessel_cols:
            op.add_column("vessels", sa.Column("call_sign", sa.String(50), nullable=True))

    # 2. Create vessel_name_history
    if "vessel_name_history" not in existing_tables:
        op.create_table(
            "vessel_name_history",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("vessel_id", sa.Integer(), sa.ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("previous_name", sa.String(200), nullable=False),
            sa.Column("changed_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column("changed_by_email", sa.String(320), nullable=True),
        )

    # 3. Create certificate_master
    if "certificate_master" not in existing_tables:
        op.create_table(
            "certificate_master",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(255), unique=True, nullable=False, index=True),
            sa.Column("category", sa.String(100), nullable=False, index=True),
            sa.Column("sub_category", sa.String(100), nullable=True),
            sa.Column("issuing_authority", sa.String(150), nullable=True),
            sa.Column("default_validity_years", sa.Integer(), nullable=True),
            sa.Column("is_mandatory", sa.Boolean(), default=True, nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )

    # 4. Create certificate_applicability
    if "certificate_applicability" not in existing_tables:
        op.create_table(
            "certificate_applicability",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("certificate_master_id", sa.Integer(), sa.ForeignKey("certificate_master.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("scope", sa.String(30), nullable=False, server_default="all_ships"),
            sa.Column("ship_type", sa.String(50), nullable=True, index=True),
            sa.Column("vessel_id", sa.Integer(), sa.ForeignKey("vessels.id", ondelete="CASCADE"), nullable=True, index=True),
            sa.Column("is_required", sa.Boolean(), default=True, nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )

    # 5. Create certificates table
    if "certificates" not in existing_tables:
        op.create_table(
            "certificates",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("vessel_id", sa.Integer(), sa.ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("certificate_master_id", sa.Integer(), sa.ForeignKey("certificate_master.id", ondelete="RESTRICT"), nullable=False, index=True),
            sa.Column("certificate_number", sa.String(100), nullable=True, index=True),
            sa.Column("issuing_authority", sa.String(150), nullable=False),
            sa.Column("issue_date", sa.Date(), nullable=False),
            sa.Column("expiry_date", sa.Date(), nullable=True, index=True),
            sa.Column("has_no_expiry", sa.Boolean(), default=False, nullable=False),
            sa.Column("responsible_person", sa.String(150), nullable=True),
            sa.Column("endorsement_date", sa.Date(), nullable=True),
            sa.Column("status", sa.String(30), default="valid", nullable=False, index=True),
            sa.Column("sharepoint_file_url", sa.String(1024), nullable=True),
            sa.Column("sharepoint_item_id", sa.String(256), nullable=True),
            sa.Column("filename", sa.String(255), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )

    # 6. Create certificate_history
    if "certificate_history" not in existing_tables:
        op.create_table(
            "certificate_history",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("certificate_id", sa.Integer(), sa.ForeignKey("certificates.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("vessel_id", sa.Integer(), sa.ForeignKey("vessels.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("certificate_number", sa.String(100), nullable=True),
            sa.Column("issuing_authority", sa.String(150), nullable=True),
            sa.Column("issue_date", sa.Date(), nullable=False),
            sa.Column("expiry_date", sa.Date(), nullable=True),
            sa.Column("sharepoint_file_url", sa.String(1024), nullable=True),
            sa.Column("sharepoint_item_id", sa.String(256), nullable=True),
            sa.Column("filename", sa.String(255), nullable=True),
            sa.Column("renewed_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column("renewed_by_email", sa.String(320), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    op.drop_table("certificate_history")
    op.drop_table("certificates")
    op.drop_table("certificate_applicability")
    op.drop_table("certificate_master")
    op.drop_table("vessel_name_history")
    op.drop_column("vessels", "call_sign")
    op.drop_column("vessels", "port_of_registry")
    op.drop_column("vessels", "class_society")
    op.drop_column("vessels", "flag")
