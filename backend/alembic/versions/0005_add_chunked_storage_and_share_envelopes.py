"""add chunked storage and share envelopes

Revision ID: 0005_chunked_storage
Revises: 0004_add_audit_observability
Create Date: 2026-05-15
"""

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "0005_chunked_storage"
down_revision: Union[str, None] = "0004_add_audit_observability"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table_name: str) -> bool:
    if context.is_offline_mode():
        return False
    return sa.inspect(op.get_bind()).has_table(table_name)


def _has_column(table_name: str, column_name: str) -> bool:
    if context.is_offline_mode():
        return False
    inspector = sa.inspect(op.get_bind())
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _has_index(table_name: str, index_name: str) -> bool:
    if context.is_offline_mode():
        return False
    inspector = sa.inspect(op.get_bind())
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def upgrade() -> None:
    if not _has_column("files", "storage_mode"):
        op.add_column("files", sa.Column("storage_mode", sa.String(length=20), nullable=False, server_default="single"))
    if not _has_column("files", "chunk_manifest"):
        op.add_column("files", sa.Column("chunk_manifest", sa.JSON(), nullable=True))
    if not _has_column("file_versions", "storage_mode"):
        op.add_column("file_versions", sa.Column("storage_mode", sa.String(length=20), nullable=False, server_default="single"))
    if not _has_column("file_versions", "chunk_manifest"):
        op.add_column("file_versions", sa.Column("chunk_manifest", sa.JSON(), nullable=True))

    if not _has_table("device_keys"):
        op.create_table(
            "device_keys",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("device_label", sa.String(length=120), nullable=True),
            sa.Column("encryption_public_key", sa.Text(), nullable=False),
            sa.Column("signing_public_key", sa.Text(), nullable=True),
            sa.Column("fingerprint", sa.String(length=95), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "encryption_public_key", name="uq_device_key_material"),
        )
        op.create_index("ix_device_keys_user_id", "device_keys", ["user_id"], unique=False)
        op.create_index("ix_device_keys_fingerprint", "device_keys", ["fingerprint"], unique=False)
        op.create_index("ix_device_keys_user_active", "device_keys", ["user_id", "is_active", "revoked_at"], unique=False)

    if not _has_table("file_upload_sessions"):
        op.create_table(
            "file_upload_sessions",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("file_id", sa.String(length=36), nullable=False),
            sa.Column("folder_id", sa.String(length=36), nullable=True),
            sa.Column("idempotency_key", sa.String(length=128), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("encrypted_file_key", sa.JSON(), nullable=False),
            sa.Column("encrypted_filename", sa.JSON(), nullable=False),
            sa.Column("encrypted_mime_type", sa.JSON(), nullable=True),
            sa.Column("total_parts", sa.Integer(), nullable=False),
            sa.Column("total_size", sa.Integer(), nullable=False),
            sa.Column("chunk_size", sa.Integer(), nullable=False),
            sa.Column("manifest", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("aborted_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["folder_id"], ["folders.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "idempotency_key", name="uq_upload_user_idempotency"),
        )
        op.create_index("ix_file_upload_sessions_user_id", "file_upload_sessions", ["user_id"], unique=False)
        op.create_index("ix_file_upload_sessions_user_status", "file_upload_sessions", ["user_id", "status"], unique=False)

    if not _has_table("file_chunks"):
        op.create_table(
            "file_chunks",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("upload_id", sa.String(length=36), nullable=True),
            sa.Column("file_id", sa.String(length=36), nullable=True),
            sa.Column("version_id", sa.String(length=36), nullable=True),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("part_number", sa.Integer(), nullable=False),
            sa.Column("storage_path", sa.String(length=255), nullable=False),
            sa.Column("encrypted_size", sa.Integer(), nullable=False),
            sa.Column("content_sha256", sa.String(length=64), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["file_id"], ["files.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["upload_id"], ["file_upload_sessions.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["version_id"], ["file_versions.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("upload_id", "part_number", name="uq_upload_part_number"),
            sa.UniqueConstraint("storage_path"),
        )
        op.create_index("ix_file_chunks_upload_id", "file_chunks", ["upload_id"], unique=False)
        op.create_index("ix_file_chunks_file_id", "file_chunks", ["file_id"], unique=False)
        op.create_index("ix_file_chunks_version_id", "file_chunks", ["version_id"], unique=False)
        op.create_index("ix_file_chunks_user_id", "file_chunks", ["user_id"], unique=False)
        op.create_index("ix_file_chunks_file_part", "file_chunks", ["file_id", "part_number"], unique=False)
        op.create_index("ix_file_chunks_version_part", "file_chunks", ["version_id", "part_number"], unique=False)

    if not _has_table("share_envelopes"):
        op.create_table(
            "share_envelopes",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("share_id", sa.String(length=36), nullable=False),
            sa.Column("recipient_device_key_id", sa.String(length=36), nullable=True),
            sa.Column("recipient_user_key_id", sa.String(length=36), nullable=True),
            sa.Column("encrypted_file_key", sa.JSON(), nullable=False),
            sa.Column("key_version", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["recipient_device_key_id"], ["device_keys.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["recipient_user_key_id"], ["user_keys.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["share_id"], ["shared_files.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("share_id", "recipient_device_key_id", "key_version", name="uq_share_device_envelope"),
        )
        op.create_index("ix_share_envelopes_share_id", "share_envelopes", ["share_id"], unique=False)
        op.create_index("ix_share_envelopes_share_active", "share_envelopes", ["share_id", "revoked_at"], unique=False)


def downgrade() -> None:
    if _has_table("share_envelopes"):
        op.drop_table("share_envelopes")
    if _has_table("file_chunks"):
        op.drop_table("file_chunks")
    if _has_table("file_upload_sessions"):
        op.drop_table("file_upload_sessions")
    if _has_table("device_keys"):
        op.drop_table("device_keys")
    if _has_column("file_versions", "chunk_manifest"):
        op.drop_column("file_versions", "chunk_manifest")
    if _has_column("file_versions", "storage_mode"):
        op.drop_column("file_versions", "storage_mode")
    if _has_column("files", "chunk_manifest"):
        op.drop_column("files", "chunk_manifest")
    if _has_column("files", "storage_mode"):
        op.drop_column("files", "storage_mode")
