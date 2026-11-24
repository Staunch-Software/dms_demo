"""User access: login_method (SSO / PASSWORD), status (PENDING/ACTIVE/DENIED/DISABLED), invite and set-password fields

Revision ID: 0034
Revises: 0033
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0034"
down_revision: Union[str, None] = "0033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = [
    ("login_method", sa.Column("login_method", sa.String(10), nullable=False, server_default="SSO")),
    ("status", sa.Column("status", sa.String(10), nullable=False, server_default="ACTIVE")),
    ("set_password_token_hash", sa.Column("set_password_token_hash", sa.String(128), nullable=True)),
    ("set_password_expires_at", sa.Column("set_password_expires_at", sa.DateTime(), nullable=True)),
    ("invited_at", sa.Column("invited_at", sa.DateTime(), nullable=True)),
    ("invite_error", sa.Column("invite_error", sa.Text(), nullable=True)),
    ("access_requested_at", sa.Column("access_requested_at", sa.DateTime(), nullable=True)),
    ("decided_by", sa.Column("decided_by", sa.String(320), nullable=True)),
    ("decided_at", sa.Column("decided_at", sa.DateTime(), nullable=True)),
]


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "user_profiles" not in set(inspector.get_table_names()):
        return
    existing = {c["name"] for c in inspector.get_columns("user_profiles")}
    added_login_method = "login_method" not in existing
    added_status = "status" not in existing
    for name, column in _COLUMNS:
        if name not in existing:
            op.add_column("user_profiles", column)

    # Existing users: a stored password means they use the password form; everyone else uses SSO.
    if added_login_method:
        op.execute(
            "UPDATE user_profiles SET login_method = 'PASSWORD' "
            "WHERE password_hash IS NOT NULL AND password_hash <> ''"
        )
    if added_status:
        op.execute("UPDATE user_profiles SET status = 'DISABLED' WHERE is_active = false")


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "user_profiles" not in set(inspector.get_table_names()):
        return
    existing = {c["name"] for c in inspector.get_columns("user_profiles")}
    for name, _ in reversed(_COLUMNS):
        if name in existing:
            op.drop_column("user_profiles", name)
