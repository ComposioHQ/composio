"""
Tool Router - Toolkits Example

This example demonstrates how to retrieve available toolkits
and their connection status in a Tool Router session.
"""

import os

from composio import Composio

composio = Composio()

# Create a tool router session
# When manage_connections is enabled, tools for managing connections are included
session = composio.create(
    # The provisioned examples user (raises KeyError when unset)
    user_id=os.environ["COMPOSIO_EXAMPLES_USER_ID"],
    manage_connections=True,
    # mcp=True surfaces session.mcp on the returned type
    mcp=True,
)

print(f"Session created: {session.session_id}")
print(f"MCP Server: {session.mcp.url}")

# Get available toolkits for the session
# This returns information about all toolkits available to the user
toolkits = session.toolkits()

print("\nAvailable toolkits:")
print(toolkits)
