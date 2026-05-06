"""add auth signing keys to users

Revision ID: 0001_add_auth_signing_keys
Revises:
Create Date: 2026-05-06
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0001_add_auth_signing_keys"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("auth_public_key", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("encrypted_auth_private_key", sa.JSON(), nullable=True))
    op.add_column("users", sa.Column("server_mfa_secret", sa.Text(), nullable=True))
    op.add_column(
        "users",
        sa.Column("auth_key_version", sa.String(length=20), nullable=False, server_default="ed25519-v1"),
    )
    op.alter_column("users", "auth_key_version", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "auth_key_version")
    op.drop_column("users", "encrypted_auth_private_key")
    op.drop_column("users", "auth_public_key")
    op.drop_column("users", "server_mfa_secret")
