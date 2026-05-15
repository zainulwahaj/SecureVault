"""initial secure vault schema

Revision ID: 0000_initial_schema
Revises:
Create Date: 2026-05-06
"""

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "0000_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if not context.is_offline_mode():
        inspector = sa.inspect(op.get_bind())
        if inspector.has_table("users"):
            return

    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=True),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column("salt", sa.Text(), nullable=False),
        sa.Column("kdf_params", sa.JSON(), nullable=False),
        sa.Column("encrypted_vault_key", sa.JSON(), nullable=False),
        sa.Column("login_proof", sa.String(length=64), nullable=False),
        sa.Column("public_key", sa.Text(), nullable=True),
        sa.Column("encrypted_private_key", sa.JSON(), nullable=True),
        sa.Column("mfa_enabled", sa.Boolean(), nullable=False),
        sa.Column("encrypted_mfa_secret", sa.JSON(), nullable=True),
        sa.Column("recovery_codes_hash", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "folders",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("parent_id", sa.String(length=36), nullable=True),
        sa.Column("encrypted_name", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["folders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_folders_parent_id"), "folders", ["parent_id"], unique=False)
    op.create_index(op.f("ix_folders_user_id"), "folders", ["user_id"], unique=False)
    op.create_index("ix_folders_user_parent", "folders", ["user_id", "parent_id"], unique=False)

    op.create_table(
        "files",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("encrypted_file_key", sa.JSON(), nullable=False),
        sa.Column("encrypted_filename", sa.JSON(), nullable=False),
        sa.Column("encrypted_mime_type", sa.JSON(), nullable=True),
        sa.Column("storage_path", sa.String(length=255), nullable=False),
        sa.Column("encrypted_size", sa.Integer(), nullable=False),
        sa.Column("folder_id", sa.String(length=36), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["folder_id"], ["folders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_path"),
    )
    op.create_index(op.f("ix_files_folder_id"), "files", ["folder_id"], unique=False)
    op.create_index(op.f("ix_files_user_id"), "files", ["user_id"], unique=False)

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("resource_type", sa.String(length=30), nullable=True),
        sa.Column("resource_id", sa.String(length=36), nullable=True),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_user_created", "audit_logs", ["user_id", "created_at"], unique=False)

    op.create_table(
        "file_versions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("file_id", sa.String(length=36), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("storage_path", sa.String(length=255), nullable=False),
        sa.Column("encrypted_file_key", sa.JSON(), nullable=False),
        sa.Column("encrypted_size", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["file_id"], ["files.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_path"),
    )
    op.create_index(op.f("ix_file_versions_file_id"), "file_versions", ["file_id"], unique=False)
    op.create_index("ix_file_versions_file_version", "file_versions", ["file_id", "version_number"], unique=False)

    op.create_table(
        "shared_files",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("file_id", sa.String(length=36), nullable=False),
        sa.Column("owner_id", sa.String(length=36), nullable=False),
        sa.Column("recipient_id", sa.String(length=36), nullable=False),
        sa.Column("encrypted_file_key_for_recipient", sa.JSON(), nullable=False),
        sa.Column("shared_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["file_id"], ["files.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recipient_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("file_id", "recipient_id", name="unique_file_recipient"),
    )
    op.create_index(op.f("ix_shared_files_file_id"), "shared_files", ["file_id"], unique=False)
    op.create_index(op.f("ix_shared_files_owner_id"), "shared_files", ["owner_id"], unique=False)
    op.create_index(op.f("ix_shared_files_recipient_id"), "shared_files", ["recipient_id"], unique=False)

    op.create_table(
        "shared_links",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("file_id", sa.String(length=36), nullable=False),
        sa.Column("owner_id", sa.String(length=36), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("encrypted_file_key", sa.JSON(), nullable=False),
        sa.Column("encrypted_filename", sa.JSON(), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("max_downloads", sa.Integer(), nullable=True),
        sa.Column("download_count", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["file_id"], ["files.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_shared_links_file_id"), "shared_links", ["file_id"], unique=False)
    op.create_index(op.f("ix_shared_links_owner_id"), "shared_links", ["owner_id"], unique=False)
    op.create_index(op.f("ix_shared_links_token"), "shared_links", ["token"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_shared_links_token"), table_name="shared_links")
    op.drop_index(op.f("ix_shared_links_owner_id"), table_name="shared_links")
    op.drop_index(op.f("ix_shared_links_file_id"), table_name="shared_links")
    op.drop_table("shared_links")

    op.drop_index(op.f("ix_shared_files_recipient_id"), table_name="shared_files")
    op.drop_index(op.f("ix_shared_files_owner_id"), table_name="shared_files")
    op.drop_index(op.f("ix_shared_files_file_id"), table_name="shared_files")
    op.drop_table("shared_files")

    op.drop_index("ix_file_versions_file_version", table_name="file_versions")
    op.drop_index(op.f("ix_file_versions_file_id"), table_name="file_versions")
    op.drop_table("file_versions")

    op.drop_index("ix_audit_user_created", table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_index(op.f("ix_files_user_id"), table_name="files")
    op.drop_index(op.f("ix_files_folder_id"), table_name="files")
    op.drop_table("files")

    op.drop_index("ix_folders_user_parent", table_name="folders")
    op.drop_index(op.f("ix_folders_user_id"), table_name="folders")
    op.drop_index(op.f("ix_folders_parent_id"), table_name="folders")
    op.drop_table("folders")

    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
