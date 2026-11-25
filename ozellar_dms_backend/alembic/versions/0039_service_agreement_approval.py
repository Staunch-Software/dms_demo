"""Service agreements: email approval gate (activation + renewal) and renewal rollback support

Revision ID: 0039
Revises: 0038
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0039"
down_revision: Union[str, None] = "0038"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_AGREEMENTS = "service_agreements"
_HISTORY = "service_agreement_history"
_DOCUMENTS = "service_agreement_documents"

_AGREEMENT_COLUMNS = [
    ("approval_kind", sa.String(20)),
    ("approval_token_hash", sa.String(128)),
    ("approval_token_expires_at", sa.DateTime()),
    ("approval_requested_at", sa.DateTime()),
    ("approval_decided_at", sa.DateTime()),
    ("approval_decided_by", sa.String(320)),
    ("approval_rejection_reason", sa.Text()),
]
_HISTORY_COLUMNS = [
    ("no_expiry", sa.Boolean()),
    ("contract_date", sa.Date()),
    ("remarks", sa.Text()),
]


def upgrade() -> None:
    bind = op.get_bind()
    agreement_cols = {c["name"] for c in sa.inspect(bind).get_columns(_AGREEMENTS)}
    for name, col_type in _AGREEMENT_COLUMNS:
        if name not in agreement_cols:
            op.add_column(_AGREEMENTS, sa.Column(name, col_type, nullable=True))
    if "pending_renewal_history_id" not in agreement_cols:
        op.add_column(
            _AGREEMENTS,
            sa.Column(
                "pending_renewal_history_id",
                sa.Integer(),
                sa.ForeignKey(f"{_HISTORY}.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
    existing_indexes = {ix["name"] for ix in sa.inspect(bind).get_indexes(_AGREEMENTS)}
    if "ix_service_agreements_approval_token_hash" not in existing_indexes:
        op.create_index(
            "ix_service_agreements_approval_token_hash", _AGREEMENTS, ["approval_token_hash"]
        )

    history_cols = {c["name"] for c in sa.inspect(bind).get_columns(_HISTORY)}
    for name, col_type in _HISTORY_COLUMNS:
        if name not in history_cols:
            default = sa.text("false") if name == "no_expiry" else None
            op.add_column(_HISTORY, sa.Column(name, col_type, nullable=True, server_default=default))

    document_cols = {c["name"] for c in sa.inspect(bind).get_columns(_DOCUMENTS)}
    if "renewal_history_id" not in document_cols:
        op.add_column(
            _DOCUMENTS,
            sa.Column(
                "renewal_history_id",
                sa.Integer(),
                sa.ForeignKey(f"{_HISTORY}.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
    existing_doc_indexes = {ix["name"] for ix in sa.inspect(bind).get_indexes(_DOCUMENTS)}
    if "ix_service_agreement_documents_renewal_history_id" not in existing_doc_indexes:
        op.create_index(
            "ix_service_agreement_documents_renewal_history_id", _DOCUMENTS, ["renewal_history_id"]
        )


def downgrade() -> None:
    bind = op.get_bind()
    doc_indexes = {ix["name"] for ix in sa.inspect(bind).get_indexes(_DOCUMENTS)}
    if "ix_service_agreement_documents_renewal_history_id" in doc_indexes:
        op.drop_index("ix_service_agreement_documents_renewal_history_id", table_name=_DOCUMENTS)
    document_cols = {c["name"] for c in sa.inspect(bind).get_columns(_DOCUMENTS)}
    if "renewal_history_id" in document_cols:
        op.drop_column(_DOCUMENTS, "renewal_history_id")

    history_cols = {c["name"] for c in sa.inspect(bind).get_columns(_HISTORY)}
    for name, _ in _HISTORY_COLUMNS:
        if name in history_cols:
            op.drop_column(_HISTORY, name)

    agreement_indexes = {ix["name"] for ix in sa.inspect(bind).get_indexes(_AGREEMENTS)}
    if "ix_service_agreements_approval_token_hash" in agreement_indexes:
        op.drop_index("ix_service_agreements_approval_token_hash", table_name=_AGREEMENTS)
    agreement_cols = {c["name"] for c in sa.inspect(bind).get_columns(_AGREEMENTS)}
    if "pending_renewal_history_id" in agreement_cols:
        op.drop_column(_AGREEMENTS, "pending_renewal_history_id")
    for name, _ in _AGREEMENT_COLUMNS:
        if name in agreement_cols:
            op.drop_column(_AGREEMENTS, name)
