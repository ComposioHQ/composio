"""
One-time setup: connect your GitHub, Slack, Gmail, and Notion accounts.
Run this once before using the search agent.
"""

import os

from composio import Composio

composio = Composio()

# Set USER_ID in your .env file
user_id = os.environ["USER_ID"]

session = composio.create(
    user_id=user_id,
    toolkits=["github", "slack", "gmail", "notion"],
)

# Authorize each toolkit one at a time
for toolkit in ["github", "slack", "gmail", "notion"]:
    print(f"\n--- {toolkit.upper()} ---")

    # Check if already connected
    status = session.toolkits(toolkits=[toolkit])
    if status.items and status.items[0].connection and status.items[0].connection.is_active:
        print(f"Already connected.")
        continue

    connection = session.authorize(toolkit)
    print(f"Open this URL to connect:\n{connection.redirect_url}")

    connected = connection.wait_for_connection()
    print(f"Connected: {connected.id}")

print("\nAll done. Run agent.py to start searching.")
