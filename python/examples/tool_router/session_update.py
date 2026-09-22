"""
Tool Router - Session Update Example

Demonstrates session.update(): what omitted fields, replaced maps, None,
an empty toolkit allowlist, and expected_config_version do to a stored
session, without creating a new one.
"""

import os

from composio import Composio
from composio.exceptions import SessionConfigConflictError

composio = Composio()

# Create a session with a per-toolkit tools map and a stored callback URL
session = composio.create(
    # The provisioned examples user (raises KeyError when unset)
    user_id=os.environ["COMPOSIO_EXAMPLES_USER_ID"],
    toolkits=["gmail", "slack"],
    tools={
        "gmail": {"enable": ["GMAIL_FETCH_EMAILS"]},
        "slack": {"enable": ["SLACK_SEND_MESSAGE"]},
    },
    manage_connections={"enable": True, "callback_url": "https://example.com/callback"},
)

print(f"Session created: {session.session_id}")
print(f"Config version: {session.config_version}")
print(f"Tools: {session.config.tools}")

# 1. Maps replace, they don't merge: a slack-only tools map removes the gmail entry
session.update(
    tools={"slack": {"enable": ["SLACK_SEND_MESSAGE", "SLACK_LIST_CHANNELS"]}},
)

print("\nAfter the slack-only tools map (gmail entry is gone):")
print(f"Tools: {session.config.tools}")

# 2. Remove only the stored callback URL; `enable` and the other settings stay as stored
session.update(manage_connections={"callback_url": None})

print("\nAfter clearing the callback URL:")
print(f"Manage connections: {session.config.manage_connections}")

# 3. Narrow the policy and fix preload in the same update. A preloaded tool that
#    falls outside the new policy would be rejected with a 400.
session.update(
    toolkits={"enable": ["slack"]},
    preload={"tools": ["SLACK_SEND_MESSAGE"]},
)

print("\nAfter narrowing to slack:")
print(f"Config version: {session.config_version}")
print(f"Preload: {session.preload}")

# 4. Concurrent updates. Every update sends the config version this handle last
#    observed as its precondition; a stale value is a 409 and nothing is written.
#    A second handle on the same session plays the concurrent writer.
observed_version = session.config_version
other_client = composio.sessions.use(session.session_id)
other_client.update(workbench={"enable": False})

try:
    session.update(toolkits={"enable": ["gmail", "slack"]}, preload={"tools": []})
except SessionConfigConflictError as error:
    print(f"\nConflict at version {observed_version}: {error}")
    # Recover: re-read the session, then retry against the fresh version
    session = composio.sessions.use(session.session_id)
    session.update(toolkits={"enable": ["gmail", "slack"]}, preload={"tools": []})
    print(f"Retried at version {session.config_version}")

# 5. Deny every app toolkit. The empty allowlist is sent as-is; an omitted
#    `toolkits` would have left the policy unchanged instead.
session.update(toolkits={"enable": []}, preload={"tools": []})

print("\nAfter denying every app toolkit:")
print(f"Toolkits: {session.config.toolkits}")

# 6. Clear a whole block with None: manage_connections falls back to its default.
#    expected_config_version=False skips the precondition, so this write applies
#    whatever version the session is at (last writer wins).
session.update(manage_connections=None, expected_config_version=False)

print("\nAfter clearing manage_connections:")
print(f"Config version: {session.config_version}")
