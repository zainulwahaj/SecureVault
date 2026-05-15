"""add recovery key + webauthn credentials + account plan

Revision ID: 0006_add_recovery_key
Revises: 0005_add_chunked_storage_and_share_envelopes
Create Date: 2026-05-15
"""

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "0006_add_recovery_key"
down_revision: Union[str, None] = "0005_add_chunked_storage_and_share_envelopes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table_name: str, column_name: str) -> bool:
    if context.is_offline_mode():
        return False
    inspector = sa.inspect(op.get_bind())
    return any(col["name"] == column_name for col in inspector.get_columns(table_name))


def _has_table(table_name: str) -> bool:
    if context.is_offline_mode():
        return False
    return sa.inspect(op.get_bind()).has_table(table_name)


def upgrade() -> None:
    # Recovery key columns on users.
    with op.batch_alter_table("users") as batch:
        if not _has_column("users", "recovery_enabled"):
            batch.add_column(sa.Column("recovery_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
        if not _has_column("users", "recovery_salt"):
            batch.add_column(sa.Column("recovery_salt", sa.Text(), nullable=True))
        if not _has_column("users", "recovery_kdf_params"):
            batch.add_column(sa.Column("recovery_kdf_params", sa.JSON(), nullable=True))
        if not _has_column("users", "encrypted_vault_key_recovery"):
            batch.add_column(sa.Column("encrypted_vault_key_recovery", sa.JSON(), nullable=True))
        if not _has_column("users", "plan"):
            batch.add_column(sa.Column("plan", sa.String(length=20), nullable=False, server_default="free"))
        if not _has_column("users", "plan_storage_bytes"):
            batch.add_column(sa.Column("plan_storage_bytes", sa.BigInteger(), nullable=True))
        if not _has_column("users", "plan_max_file_bytes"):
            batch.add_column(sa.Column("plan_max_file_bytes", sa.BigInteger(), nullable=True))
        if not _has_column("users", "plan_max_file_count"):
            batch.add_column(sa.Column("plan_max_file_count", sa.Integer(), nullable=True))
        if not _has_column("users", "plan_max_versions_per_file"):
            batch.add_column(sa.Column("plan_max_versions_per_file", sa.Integer(), nullable=True))
        if not _has_column("users", "plan_max_links_per_file"):
            batch.add_column(sa.Column("plan_max_links_per_file", sa.Integer(), nullable=True))
        if not _has_column("users", "plan_max_link_expiry_days"):
            batch.add_column(sa.Column("plan_max_link_expiry_days", sa.Integer(), nullable=True))
        if not _has_column("users", "plan_max_trash_days"):
            batch.add_column(sa.Column("plan_max_trash_days", sa.Integer(), nullable=True))

    # WebAuthn credentials.
    if not _has_table("webauthn_credentials"):
        op.create_table(
            "webauthn_credentials",
            sa.Column("id", sa.String(length=36), primary_key=True),
            sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("credential_id", sa.Text(), nullable=False, unique=True),
            sa.Column("public_key", sa.Text(), nullable=False),
            sa.Column("sign_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("transports", sa.JSON(), nullable=True),
            sa.Column("aaguid", sa.String(length=64), nullable=True),
            sa.Column("label", sa.String(length=120), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("last_used_at", sa.DateTime(), nullable=True),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_webauthn_credentials_user_active", "webauthn_credentials", ["user_id", "revoked_at"])


def downgrade() -> None:
    if _has_table("webauthn_credentials"):
        op.drop_index("ix_webauthn_credentials_user_active", table_name="webauthn_credentials")
        op.drop_table("webauthn_credentials")

    with op.batch_alter_table("users") as batch:
        for col in (
            "plan_max_trash_days",
            "plan_max_link_expiry_days",
            "plan_max_links_per_file",
            "plan_max_versions_per_file",
            "plan_max_file_count",
            "plan_max_file_bytes",
            "plan_storage_bytes",
            "plan",
            "encrypted_vault_key_recovery",
            "recovery_kdf_params",
            "recovery_salt",
            "recovery_enabled",
        ):
            if _has_column("users", col):
                batch.drop_column(col)
