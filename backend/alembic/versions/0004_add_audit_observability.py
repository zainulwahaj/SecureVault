"""add audit observability metadata

Revision ID: 0004_add_audit_observability
Revises: 0003_add_storage_integrity
Create Date: 2026-05-07
"""

from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa


revision: str = "0004_add_audit_observability"
down_revision: Union[str, None] = "0003_add_storage_integrity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


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
    if not _has_column("audit_logs", "category"):
        op.add_column(
            "audit_logs",
            sa.Column("category", sa.String(length=30), nullable=False, server_default="application"),
        )
    if not _has_column("audit_logs", "outcome"):
        op.add_column(
            "audit_logs",
            sa.Column("outcome", sa.String(length=20), nullable=False, server_default="success"),
        )
    if not _has_column("audit_logs", "severity"):
        op.add_column(
            "audit_logs",
            sa.Column("severity", sa.String(length=20), nullable=False, server_default="info"),
        )
    if not _has_column("audit_logs", "request_id"):
        op.add_column("audit_logs", sa.Column("request_id", sa.String(length=128), nullable=True))
    if not _has_column("audit_logs", "session_id_hash"):
        op.add_column("audit_logs", sa.Column("session_id_hash", sa.String(length=64), nullable=True))
    if not _has_column("audit_logs", "sequence_number"):
        op.add_column("audit_logs", sa.Column("sequence_number", sa.Integer(), nullable=True))
    if not _has_column("audit_logs", "prev_hash"):
        op.add_column("audit_logs", sa.Column("prev_hash", sa.String(length=64), nullable=True))
    if not _has_column("audit_logs", "event_hash"):
        op.add_column("audit_logs", sa.Column("event_hash", sa.String(length=64), nullable=True))
    if not _has_column("audit_logs", "hash_version"):
        op.add_column(
            "audit_logs",
            sa.Column("hash_version", sa.String(length=20), nullable=False, server_default="legacy-unsealed"),
        )

    if not _has_index("audit_logs", "ix_audit_user_action_created"):
        op.create_index(
            "ix_audit_user_action_created",
            "audit_logs",
            ["user_id", "action", "created_at"],
            unique=False,
        )
    if not _has_index("audit_logs", "ix_audit_user_sequence"):
        op.create_index(
            "ix_audit_user_sequence",
            "audit_logs",
            ["user_id", "sequence_number"],
            unique=True,
        )
    if not _has_index("audit_logs", "ix_audit_request_id"):
        op.create_index("ix_audit_request_id", "audit_logs", ["request_id"], unique=False)
    if not _has_index("audit_logs", "ix_audit_event_hash"):
        op.create_index("ix_audit_event_hash", "audit_logs", ["event_hash"], unique=False)


def downgrade() -> None:
    if _has_index("audit_logs", "ix_audit_event_hash"):
        op.drop_index("ix_audit_event_hash", table_name="audit_logs")
    if _has_index("audit_logs", "ix_audit_request_id"):
        op.drop_index("ix_audit_request_id", table_name="audit_logs")
    if _has_index("audit_logs", "ix_audit_user_action_created"):
        op.drop_index("ix_audit_user_action_created", table_name="audit_logs")
    if _has_index("audit_logs", "ix_audit_user_sequence"):
        op.drop_index("ix_audit_user_sequence", table_name="audit_logs")

    for column_name in (
        "hash_version",
        "event_hash",
        "prev_hash",
        "sequence_number",
        "session_id_hash",
        "request_id",
        "severity",
        "outcome",
        "category",
    ):
        if _has_column("audit_logs", column_name):
            op.drop_column("audit_logs", column_name)
