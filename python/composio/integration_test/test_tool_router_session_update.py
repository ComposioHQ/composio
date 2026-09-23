"""
Live regression test for ``session.update()`` with default options.

``composio`` sent ``expected_config_version`` on every ``update()`` call, and
the API rejected that field with a 400, so no default update could succeed.
Unit tests mock the transport and cannot catch a payload the API refuses, so
this test sends a default update to the real API.
"""

import time

import pytest


@pytest.mark.integration
def test_default_update_applies_and_persists(composio_client):
    session = composio_client.sessions.create(
        user_id=f"pytest-session-update-{int(time.time())}",
        toolkits=["github", "gmail"],
    )
    try:
        version_before = session.config_version
        assert isinstance(version_before, int)

        # Default options: no precondition, so this must succeed on any project.
        config = session.update(toolkits={"enable": ["github"]})

        assert config.toolkits.enabled == ["github"]
        assert session.config_version > version_before

        reread = composio_client.sessions.use(session_id=session.session_id)
        assert reread.config.toolkits.enabled == ["github"]
        assert reread.config_version == session.config_version
    finally:
        composio_client.sessions.delete(session.session_id)
