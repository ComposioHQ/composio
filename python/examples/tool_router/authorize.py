"""
Tool Router - Authorization Example

This example demonstrates how to authorize a toolkit connection
within a Tool Router session.
"""

import os
from composio import Composio

# Initialize Composio
# Set COMPOSIO_API_KEY environment variable or pass api_key parameter
api_key = os.environ.get("COMPOSIO_API_KEY")
if not api_key:
    print("Error: COMPOSIO_API_KEY environment variable not set")
    print("Please set it using: export COMPOSIO_API_KEY='your_api_key'")
    exit(1)

composio = Composio(api_key=api_key)

# Create a tool router session
session = composio.create(
    user_id="user_123",
    toolkits=["github", "gmail"],
)

print(f"Session created: {session.session_id}")

# Authorize a toolkit connection
# This initiates the OAuth flow and returns a connection request
connection_request = session.authorize("github")

print(f"\nConnection Request ID: {connection_request.id}")
print(f"Status: {connection_request.status}")
print(f"Redirect URL: {connection_request.redirect_url}")
print("\nPlease visit the URL above to authorize the connection.")

# Wait for the user to complete the authorization
# This will poll the API until the connection is active or timeout occurs
try:
    connected_account = connection_request.wait_for_connection()
    print("\n✅ Connection successful!")
    print(f"Connected Account ID: {connected_account.id}")
    print(f"Status: {connected_account.status}")
except Exception as e:
    print(f"\n❌ Connection failed: {e}")
