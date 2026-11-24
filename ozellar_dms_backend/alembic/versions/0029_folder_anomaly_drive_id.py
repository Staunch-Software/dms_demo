"""folder_anomalies.drive_id: which SharePoint library an anomaly was found in

Revision ID: 0029
Revises: 0028
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0029"
down_revision: Union[str, None] = "0028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # schema_sync.ensure_schema may already have added the column at startup.
    inspector = sa.inspect(op.get_bind())
    cols = {c["name"] for c in inspector.get_columns("folder_anomalies")}
    if "drive_id" not in cols:
        op.add_column("folder_anomalies", sa.Column("drive_id", sa.String(200), nullable=True))
    indexes = {i["name"] for i in inspector.get_indexes("folder_anomalies")}
    if "ix_folder_anomalies_drive_id" not in indexes:
        op.create_index("ix_folder_anomalies_drive_id", "folder_anomalies", ["drive_id"])


def downgrade() -> None:
    op.drop_index("ix_folder_anomalies_drive_id", table_name="folder_anomalies")
    op.drop_column("folder_anomalies", "drive_id")
