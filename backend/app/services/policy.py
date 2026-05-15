"""Per-account policy layer.

Resolves the effective limits for a user by combining their plan defaults
with any per-user overrides stored on the User row. Callers query this
service from enforcement points (file save, link create, version cap, etc.)
instead of reading globals directly so policies can be swapped per-account
without touching the call sites.
"""

from dataclasses import dataclass
from typing import Optional
from app.config import get_settings
from app.models.user import User


settings = get_settings()


@dataclass(frozen=True)
class PlanPolicy:
    """Effective per-account limits."""
    plan: str
    storage_bytes: int
    max_file_bytes: int
    max_file_count: int
    max_versions_per_file: int
    max_links_per_file: int
    max_link_expiry_days: int
    max_trash_days: int


def _global_default() -> PlanPolicy:
    return PlanPolicy(
        plan="free",
        storage_bytes=settings.MAX_STORAGE_BYTES,
        max_file_bytes=settings.MAX_FILE_SIZE,
        max_file_count=settings.MAX_FILE_COUNT,
        max_versions_per_file=20,
        max_links_per_file=10,
        max_link_expiry_days=30,
        max_trash_days=settings.TRASH_RETENTION_DAYS,
    )


# Plan presets. Per-user overrides on the User row take precedence; an
# admin can also override individual fields without changing the plan.
PLAN_DEFAULTS: dict[str, PlanPolicy] = {
    "free": _global_default(),
    "pro": PlanPolicy(
        plan="pro",
        storage_bytes=100 * 1024 * 1024 * 1024,            # 100 GB
        max_file_bytes=5 * 1024 * 1024 * 1024,             # 5 GB / file
        max_file_count=100_000,
        max_versions_per_file=100,
        max_links_per_file=50,
        max_link_expiry_days=365,
        max_trash_days=90,
    ),
    "team": PlanPolicy(
        plan="team",
        storage_bytes=1024 * 1024 * 1024 * 1024,           # 1 TB
        max_file_bytes=20 * 1024 * 1024 * 1024,            # 20 GB / file
        max_file_count=1_000_000,
        max_versions_per_file=500,
        max_links_per_file=200,
        max_link_expiry_days=730,
        max_trash_days=180,
    ),
}


def _coalesce(value: Optional[int], fallback: int) -> int:
    return value if value is not None and value > 0 else fallback


def policy_for(user: User) -> PlanPolicy:
    """Return the effective policy for a user (plan + per-user overrides)."""
    plan_name = (user.plan or "free").lower()
    base = PLAN_DEFAULTS.get(plan_name, PLAN_DEFAULTS["free"])
    return PlanPolicy(
        plan=base.plan,
        storage_bytes=_coalesce(user.plan_storage_bytes, base.storage_bytes),
        max_file_bytes=_coalesce(user.plan_max_file_bytes, base.max_file_bytes),
        max_file_count=_coalesce(user.plan_max_file_count, base.max_file_count),
        max_versions_per_file=_coalesce(user.plan_max_versions_per_file, base.max_versions_per_file),
        max_links_per_file=_coalesce(user.plan_max_links_per_file, base.max_links_per_file),
        max_link_expiry_days=_coalesce(user.plan_max_link_expiry_days, base.max_link_expiry_days),
        max_trash_days=_coalesce(user.plan_max_trash_days, base.max_trash_days),
    )
