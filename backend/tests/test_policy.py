"""Tests for the per-account policy resolution layer."""

from app.services.policy import policy_for, PLAN_DEFAULTS


def test_default_plan_is_free(fake_user):
    policy = policy_for(fake_user)
    assert policy.plan == "free"
    assert policy.storage_bytes == PLAN_DEFAULTS["free"].storage_bytes


def test_per_user_override_takes_precedence(fake_user, db_session):
    fake_user.plan = "pro"
    fake_user.plan_storage_bytes = 5 * 1024 * 1024 * 1024
    fake_user.plan_max_links_per_file = 3
    db_session.commit()
    policy = policy_for(fake_user)
    assert policy.plan == "pro"
    assert policy.storage_bytes == 5 * 1024 * 1024 * 1024
    assert policy.max_links_per_file == 3
    # Fields without overrides fall back to the plan defaults.
    assert policy.max_versions_per_file == PLAN_DEFAULTS["pro"].max_versions_per_file


def test_unknown_plan_falls_back_to_free(fake_user, db_session):
    fake_user.plan = "phantom"
    db_session.commit()
    assert policy_for(fake_user).plan == "free"


def test_zero_overrides_are_ignored(fake_user, db_session):
    """A zero/None override must not collapse the limit to zero."""
    fake_user.plan_max_versions_per_file = 0
    db_session.commit()
    assert policy_for(fake_user).max_versions_per_file > 0
