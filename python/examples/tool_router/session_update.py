"""
Tool Router - Session Update Example

Demonstrates using session.update() to modify a session's configuration
after creation — e.g. adding toolkits, changing workbench settings, or
updating preload config without creating a new session.
"""

import os

from composio import Composio

composio = Composio(base_url=os.environ.get("COMPOSIO_BASE_URL"))

# Create a session with gmail only
session = composio.create(
    user_id="session-update-demo",
    toolkits=["gmail"],
    manage_connections=False,
)

print(f"Session created: {session.session_id}")
print(f"Preload: {session.preload}")

# Update: add github toolkit, enable workbench, and preload a tool
session.update(
    toolkits={"enable": ["gmail", "github"]},
    workbench={"enable": True, "sandbox_size": "medium"},
    preload={"tools": ["GITHUB_CREATE_AN_ISSUE"]},
)

print("\nAfter update:")
print(f"Preload: {session.preload}")

# Update: disable workbench entirely
session.update(
    workbench={"enable": False},
)

print("\nAfter disabling workbench: done")

# Update: clear manage_connections by passing None
session.update(
    manage_connections=None,
)

print("\nAfter clearing manage_connections: done")
