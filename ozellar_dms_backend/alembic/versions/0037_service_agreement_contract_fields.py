"""Service agreements: client's contract fields (description, business unit, owner, confidentiality,
contract / initial expiry dates, auto-renewal, renewal + notice period, applies-to), parties and documents

Revision ID: 0037
Revises: 0036
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0037"
down_revision: Union[str, None] = "0036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "service_agreements"
_COLUMNS = [
    sa.Column("description", sa.String(500), nullable=True),
    sa.Column("business_unit", sa.String(30), nullable=True),
    sa.Column("owner_email", sa.String(320), nullable=True),
    sa.Column("owner_name", sa.String(200), nullable=True),
    sa.Column("confidentiality", sa.String(20), nullable=False, server_default="General"),
    sa.Column("contract_date", sa.Date(), nullable=True),
    sa.Column("initial_expiry_date", sa.Date(), nullable=True),
    sa.Column("no_expiry", sa.Boolean(), nullable=False, server_default=sa.false()),
    sa.Column("auto_renewal", sa.Boolean(), nullable=False, server_default=sa.false()),
    sa.Column("renewal_period_value", sa.Integer(), nullable=True),
    sa.Column("renewal_period_unit", sa.String(10), nullable=True),
    sa.Column("notice_period_days", sa.Integer(), nullable=True),
    sa.Column("applies_to", sa.String(20), nullable=False, server_default="vessels"),
    sa.Column("applies_to_detail", sa.String(200), nullable=True),
]


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = set(inspector.get_table_names())
    if _TABLE not in tables:
        return
    existing = {c["name"] for c in inspector.get_columns(_TABLE)}
    for col in _COLUMNS:
        if col.name not in existing:
            op.add_column(_TABLE, col)
    if "ix_service_agreements_business_unit" not in {i["name"] for i in inspector.get_indexes(_TABLE)}:
        op.create_index("ix_service_agreements_business_unit", _TABLE, ["business_unit"])
    if "ix_service_agreements_owner_email" not in {i["name"] for i in inspector.get_indexes(_TABLE)}:
        op.create_index("ix_service_agreements_owner_email", _TABLE, ["owner_email"])

    if "service_agreement_parties" not in tables:
        op.create_table(
            "service_agreement_parties",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("agreement_id", sa.Integer(), sa.ForeignKey("service_agreements.id", ondelete="CASCADE"), nullable=False),
            sa.Column("role", sa.String(20), nullable=False),
            sa.Column("name", sa.String(300), nullable=False),
            sa.Column("address", sa.Text(), nullable=True),
            sa.Column("pic", sa.String(200), nullable=True),
            sa.Column("phone", sa.String(60), nullable=True),
            sa.Column("email", sa.String(320), nullable=True),
            sa.Column("sort_order", sa.Integer(), nullable=True, server_default="0"),
        )
        op.create_index("ix_service_agreement_parties_agreement_id", "service_agreement_parties", ["agreement_id"])

    if "service_agreement_documents" not in tables:
        op.create_table(
            "service_agreement_documents",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("agreement_id", sa.Integer(), sa.ForeignKey("service_agreements.id", ondelete="CASCADE"), nullable=False),
            sa.Column("document_type", sa.String(60), nullable=False, server_default="Main Contract"),
            sa.Column("version", sa.String(30), nullable=True),
            sa.Column("filename", sa.String(255), nullable=True),
            sa.Column("sharepoint_file_url", sa.String(1024), nullable=True),
            sa.Column("sharepoint_item_id", sa.String(256), nullable=True),
            sa.Column("sharepoint_drive_id", sa.String(256), nullable=True),
            sa.Column("folder", sa.String(10), nullable=False, server_default="active"),
            sa.Column("uploaded_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("uploaded_by", sa.String(320), nullable=True),
        )
        op.create_index("ix_service_agreement_documents_agreement_id", "service_agreement_documents", ["agreement_id"])

    # Carry the first version's data across.
    op.execute("UPDATE service_agreements SET status = 'terminated' WHERE status = 'closed'")
    op.execute("UPDATE service_agreements SET applies_to = 'all_ships' WHERE applies_to_all_ships IS TRUE")
    op.execute("UPDATE service_agreements SET initial_expiry_date = expiry_date WHERE initial_expiry_date IS NULL")
    op.execute(
        "INSERT INTO service_agreement_parties (agreement_id, role, name, sort_order) "
        "SELECT a.id, 'second', a.vendor, 1 FROM service_agreements a "
        "WHERE a.vendor IS NOT NULL AND a.vendor <> '' AND NOT EXISTS "
        "(SELECT 1 FROM service_agreement_parties p WHERE p.agreement_id = a.id AND p.role = 'second')"
    )
    op.execute(
        "INSERT INTO service_agreement_documents (agreement_id, document_type, version, filename, sharepoint_file_url, "
        "sharepoint_item_id, sharepoint_drive_id, folder, uploaded_at, uploaded_by) "
        "SELECT a.id, 'Main Contract', '1', a.filename, a.sharepoint_file_url, a.sharepoint_item_id, a.sharepoint_drive_id, "
        "CASE WHEN a.status = 'terminated' THEN 'expiry' ELSE 'active' END, a.created_at, a.created_by "
        "FROM service_agreements a WHERE a.sharepoint_item_id IS NOT NULL AND NOT EXISTS "
        "(SELECT 1 FROM service_agreement_documents d WHERE d.agreement_id = a.id)"
    )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = set(inspector.get_table_names())
    for table in ("service_agreement_documents", "service_agreement_parties"):
        if table in tables:
            op.drop_table(table)
    if _TABLE in tables:
        op.execute("UPDATE service_agreements SET status = 'closed' WHERE status = 'terminated'")
        existing = {c["name"] for c in inspector.get_columns(_TABLE)}
        indexes = {i["name"] for i in inspector.get_indexes(_TABLE)}
        for name in ("ix_service_agreements_owner_email", "ix_service_agreements_business_unit"):
            if name in indexes:
                op.drop_index(name, table_name=_TABLE)
        for col in reversed(_COLUMNS):
            if col.name in existing:
                op.drop_column(_TABLE, col.name)
