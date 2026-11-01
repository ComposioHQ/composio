"""
Live test for the ``proxy_execute`` session option.

Unit tests mock the transport, so they cannot tell whether the API accepts
the ``proxy_execute`` block, stores it, or lists the ``COMPOSIO_PROXY_EXECUTE``
meta tool. This test sends the real requests.
"""

import time

import pytest

META_TOOL = "COMPOSIO_PROXY_EXECUTE"


def _enable_of(config):
    block = getattr(config, "proxy_execute", None)
    return None if block is None else block.enable


def _lists_meta_tool(session) -> bool:
    return META_TOOL in {tool["function"]["name"] for tool in session.tools()}


@pytest.mark.integration
def test_proxy_execute_option_round_trip(composio_client):
    user_id = f"pytest-session-proxy-execute-{int(time.time())}"
    sessions = []
    try:
        on = composio_client.sessions.create(
            user_id=user_id, toolkits=["github"], proxy_execute=True
        )
        sessions.append(on)
        assert _enable_of(on.config) is True
        assert _lists_meta_tool(on)

        assert _enable_of(on.update(proxy_execute=False)) is False
        assert not _lists_meta_tool(on)

        assert _enable_of(on.update(proxy_execute={"enable": True})) is True
        assert _enable_of(on.update(proxy_execute=None)) is None
        reread = composio_client.sessions.use(session_id=on.session_id)
        assert _enable_of(reread.config) is None

        off = composio_client.sessions.create(user_id=user_id, toolkits=["github"])
        sessions.append(off)
        assert _enable_of(off.config) is None
        assert not _lists_meta_tool(off)
    finally:
        for session in sessions:
            composio_client.sessions.delete(session.session_id)


@pytest.mark.integration
def test_proxy_execute_false_conflicts_with_sandbox_helper(composio_client):
    user_id = f"pytest-session-proxy-execute-conflict-{int(time.time())}"
    with pytest.raises(Exception):  # noqa: B017 - the API returns a 400
        session = composio_client.sessions.create(
            user_id=user_id,
            toolkits=["github"],
            proxy_execute=False,
            sandbox={"enable_proxy_execution": True},
        )
        composio_client.sessions.delete(session.session_id)
