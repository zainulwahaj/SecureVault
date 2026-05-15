"""add storage integrity metadata

Revision ID: 0003_add_storage_integrity
Revises: 0002_add_key_directory_and_share_policy
Create Date: 2026-05-07
"""

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "0003_add_storage_integrity"
down_revision: Union[str, None] = "0002_add_key_directory_and_share_policy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table_name: str, column_name: str) -> bool:
    if context.is_offline_mode():
        return False
    inspector = sa.inspect(op.get_bind())
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    if not _has_column("files", "content_sha256"):
        op.add_column("files", sa.Column("content_sha256", sa.String(length=64), nullable=True))
    if not _has_column("file_versions", "content_sha256"):
        op.add_column("file_versions", sa.Column("content_sha256", sa.String(length=64), nullable=True))


def downgrade() -> None:
    if _has_column("file_versions", "content_sha256"):
        op.drop_column("file_versions", "content_sha256")
    if _has_column("files", "content_sha256"):
        op.drop_column("files", "content_sha256")
