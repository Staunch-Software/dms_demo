"""Certificate 1st-level approval workflow and AI BANTO integration fields

Revision ID: 0033
Revises: 0032
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0033"
down_revision: Union[str, None] = "0032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    # 1. Update certificates table
    if "certificates" in existing_tables:
        cert_cols = {c["name"] for c in inspector.get_columns("certificates")}
        if "approval_status" not in cert_cols:
            op.add_column(
                "certificates",
                sa.Column("approval_status", sa.String(30), server_default="pending", nullable=True),
            )
        if "approved_by" not in cert_cols:
            op.add_column(
                "certificates",
                sa.Column("approved_by", sa.String(320), nullable=True),
            )
        if "approved_at" not in cert_cols:
            op.add_column(
                "certificates",
                sa.Column("approved_at", sa.DateTime(), nullable=True),
            )
        if "rejection_reason" not in cert_cols:
            op.add_column(
                "certificates",
                sa.Column("rejection_reason", sa.Text(), nullable=True),
            )
        if "ai_banto_synced" not in cert_cols:
            op.add_column(
                "certificates",
                sa.Column("ai_banto_synced", sa.Boolean(), server_default=sa.false(), nullable=True),
            )
        if "ai_banto_synced_at" not in cert_cols:
            op.add_column(
                "certificates",
                sa.Column("ai_banto_synced_at", sa.DateTime(), nullable=True),
            )

    # 2. Update user_profiles table
    if "user_profiles" in existing_tables:
        up_cols = {c["name"] for c in inspector.get_columns("user_profiles")}
        if "can_approve_certificates" not in up_cols:
            op.add_column(
                "user_profiles",
                sa.Column("can_approve_certificates", sa.Boolean(), server_default=sa.false(), nullable=True),
            )
        if "assigned_vessels" not in up_cols:
            op.add_column(
                "user_profiles",
                sa.Column("assigned_vessels", sa.Text(), nullable=True),
            )

    # 3. Update certificate_master table
    if "certificate_master" in existing_tables:
        cm_cols = {c["name"] for c in inspector.get_columns("certificate_master")}
        if "enable_email_automation" not in cm_cols:
            op.add_column(
                "certificate_master",
                sa.Column("enable_email_automation", sa.Boolean(), server_default=sa.false(), nullable=True),
            )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = set(inspector.get_table_names())

    if "certificates" in existing_tables:
        cert_cols = {c["name"] for c in inspector.get_columns("certificates")}
        for col in ["approval_status", "approved_by", "approved_at", "rejection_reason", "ai_banto_synced", "ai_banto_synced_at"]:
            if col in cert_cols:
                op.drop_column("certificates", col)

    if "user_profiles" in existing_tables:
        up_cols = {c["name"] for c in inspector.get_columns("user_profiles")}
        if "can_approve_certificates" in up_cols:
            op.drop_column("user_profiles", "can_approve_certificates")

    if "certificate_master" in existing_tables:
        cm_cols = {c["name"] for c in inspector.get_columns("certificate_master")}
        if "enable_email_automation" in cm_cols:
            op.drop_column("certificate_master", "enable_email_automation")
