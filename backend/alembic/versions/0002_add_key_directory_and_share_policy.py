"""add key directory and share policy fields

Revision ID: 0002_key_directory
Revises: 0001_add_auth_signing_keys
Create Date: 2026-05-06
"""

import base64
import hashlib
import uuid
from datetime import datetime
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "0002_key_directory"
down_revision: Union[str, None] = "0001_add_auth_signing_keys"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _inspector():
    return sa.inspect(op.get_bind())


def _has_table(table_name: str) -> bool:
    return not context.is_offline_mode() and _inspector().has_table(table_name)


def _has_column(table_name: str, column_name: str) -> bool:
    if context.is_offline_mode():
        return False
    return any(column["name"] == column_name for column in _inspector().get_columns(table_name))


def _has_index(table_name: str, index_name: str) -> bool:
    if context.is_offline_mode():
        return False
    return any(index["name"] == index_name for index in _inspector().get_indexes(table_name))


def _has_unique_constraint(table_name: str, constraint_name: str) -> bool:
    if context.is_offline_mode():
        return False
    return any(
        constraint["name"] == constraint_name
        for constraint in _inspector().get_unique_constraints(table_name)
    )


def _has_foreign_key(table_name: str, constraint_name: str) -> bool:
    if context.is_offline_mode():
        return False
    return any(
        constraint["name"] == constraint_name
        for constraint in _inspector().get_foreign_keys(table_name)
    )


def _fingerprint(public_key: str) -> str | None:
    try:
        raw = base64.b64decode(public_key, validate=True)
    except ValueError:
        return None
    if len(raw) != 32:
        return None
    digest = hashlib.sha256(raw).hexdigest().upper()
    return ":".join(digest[i:i + 4] for i in range(0, 32, 4))


def upgrade() -> None:
    if context.is_offline_mode() or _has_unique_constraint("shared_files", "unique_file_recipient"):
        op.drop_constraint("unique_file_recipient", "shared_files", type_="unique")
    if context.is_offline_mode() or not _has_table("user_keys"):
        op.create_table(
            "user_keys",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("key_type", sa.String(length=30), nullable=False),
            sa.Column("algorithm", sa.String(length=30), nullable=False),
            sa.Column("public_key", sa.Text(), nullable=False),
            sa.Column("fingerprint", sa.String(length=95), nullable=False),
            sa.Column("version", sa.String(length=20), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "key_type", "public_key", name="unique_user_key_material"),
        )
    if context.is_offline_mode() or not _has_index("user_keys", "ix_user_keys_user_id"):
        op.create_index(op.f("ix_user_keys_user_id"), "user_keys", ["user_id"], unique=False)
    if context.is_offline_mode() or not _has_index("user_keys", "ix_user_keys_fingerprint"):
        op.create_index(op.f("ix_user_keys_fingerprint"), "user_keys", ["fingerprint"], unique=False)

    if not context.is_offline_mode():
        conn = op.get_bind()
        users = conn.execute(
            sa.text("SELECT id, public_key FROM users WHERE public_key IS NOT NULL")
        ).mappings()
        now = datetime.utcnow()
        for user in users:
            fingerprint = _fingerprint(user["public_key"])
            if not fingerprint:
                continue
            conn.execute(
                sa.text(
                    """
                    INSERT INTO user_keys (
                        id, user_id, key_type, algorithm, public_key, fingerprint,
                        version, is_active, created_at, revoked_at
                    )
                    VALUES (
                        :id, :user_id, :key_type, :algorithm, :public_key,
                        :fingerprint, :version, :is_active, :created_at, NULL
                    )
                    """
                ),
                {
                    "id": str(uuid.uuid4()),
                    "user_id": user["id"],
                    "key_type": "x25519-sharing",
                    "algorithm": "x25519-sealed-box",
                    "public_key": user["public_key"],
                    "fingerprint": fingerprint,
                    "version": "1",
                    "is_active": True,
                    "created_at": now,
                },
            )

    if not _has_column("shared_files", "recipient_key_id"):
        op.add_column("shared_files", sa.Column("recipient_key_id", sa.String(length=36), nullable=True))
    added_permission = False
    if not _has_column("shared_files", "permission"):
        op.add_column("shared_files", sa.Column("permission", sa.String(length=20), nullable=False, server_default="read"))
        added_permission = True
    if not _has_column("shared_files", "expires_at"):
        op.add_column("shared_files", sa.Column("expires_at", sa.DateTime(), nullable=True))
    if not _has_column("shared_files", "revoked_at"):
        op.add_column("shared_files", sa.Column("revoked_at", sa.DateTime(), nullable=True))
    if context.is_offline_mode() or not _has_foreign_key("shared_files", "fk_shared_files_recipient_key_id_user_keys"):
        op.create_foreign_key(
            "fk_shared_files_recipient_key_id_user_keys",
            "shared_files",
            "user_keys",
            ["recipient_key_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if context.is_offline_mode() or not _has_index("shared_files", "ix_shared_files_active_recipient"):
        op.create_index(
            "ix_shared_files_active_recipient",
            "shared_files",
            ["file_id", "recipient_id"],
            unique=True,
            postgresql_where=sa.text("revoked_at IS NULL"),
            sqlite_where=sa.text("revoked_at IS NULL"),
        )
    if context.is_offline_mode() or added_permission:
        op.alter_column("shared_files", "permission", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_shared_files_active_recipient", table_name="shared_files")
    op.create_unique_constraint("unique_file_recipient", "shared_files", ["file_id", "recipient_id"])
    op.drop_constraint("fk_shared_files_recipient_key_id_user_keys", "shared_files", type_="foreignkey")
    op.drop_column("shared_files", "revoked_at")
    op.drop_column("shared_files", "expires_at")
    op.drop_column("shared_files", "permission")
    op.drop_column("shared_files", "recipient_key_id")
    op.drop_index(op.f("ix_user_keys_fingerprint"), table_name="user_keys")
    op.drop_index(op.f("ix_user_keys_user_id"), table_name="user_keys")
    op.drop_table("user_keys")
