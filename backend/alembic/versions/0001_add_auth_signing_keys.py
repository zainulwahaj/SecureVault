"""add auth signing keys to users

Revision ID: 0001_add_auth_signing_keys
Revises: 0000_initial_schema
Create Date: 2026-05-06
"""

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "0001_add_auth_signing_keys"
down_revision: Union[str, None] = "0000_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table_name: str, column_name: str) -> bool:
    if context.is_offline_mode():
        return False
    inspector = sa.inspect(op.get_bind())
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    if not _has_column("users", "auth_public_key"):
        op.add_column("users", sa.Column("auth_public_key", sa.Text(), nullable=True))
    if not _has_column("users", "encrypted_auth_private_key"):
        op.add_column("users", sa.Column("encrypted_auth_private_key", sa.JSON(), nullable=True))
    if not _has_column("users", "server_mfa_secret"):
        op.add_column("users", sa.Column("server_mfa_secret", sa.Text(), nullable=True))
    if not _has_column("users", "auth_key_version"):
        op.add_column(
            "users",
            sa.Column("auth_key_version", sa.String(length=20), nullable=False, server_default="ed25519-v1"),
        )
        op.alter_column("users", "auth_key_version", server_default=None)


def downgrade() -> None:
    if _has_column("users", "auth_key_version"):
        op.drop_column("users", "auth_key_version")
    if _has_column("users", "encrypted_auth_private_key"):
        op.drop_column("users", "encrypted_auth_private_key")
    if _has_column("users", "auth_public_key"):
        op.drop_column("users", "auth_public_key")
    if _has_column("users", "server_mfa_secret"):
        op.drop_column("users", "server_mfa_secret")
