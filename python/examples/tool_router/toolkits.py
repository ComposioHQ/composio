"""
Tool Router - Toolkits Example

This example demonstrates how to retrieve available toolkits
and their connection status in a Tool Router session.
"""

from composio import Composio

composio = Composio()

# Create a tool router session
# When manage_connections is enabled, tools for managing connections are included
session = composio.create(
    user_id="pg-test-37ee710c-d5be-4775-91f2-a8e06b937d9b",
    manage_connections=True,
)

print(f"Session created: {session.session_id}")
print(f"MCP Server: {session.mcp.url}")

# Get available toolkits for the session
# This returns information about all toolkits available to the user
toolkits = session.toolkits()

print("\nAvailable toolkits:")
print(toolkits)
