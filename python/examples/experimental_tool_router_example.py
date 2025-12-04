"""
Example demonstrating the use of ToolRouter in Composio SDK.

This example shows how to create a tool router session for a user,
get provider-wrapped tools, and authorize toolkits.
"""

from composio import Composio

# Initialize Composio SDK
composio = Composio()


# Example 1: Create a basic tool router session
def basic_session_example():
    """Create a basic tool router session."""
    print("=== Basic Session Example ===")

    user_id = "user_123"

    # Create a tool router session
    session = composio.tool_router.create(user_id=user_id)

    print(f"Session ID: {session.session_id}")
    print(f"MCP Server Type: {session.mcp.type}")
    print(f"MCP Server URL: {session.mcp.url}")

    # Get tools wrapped for the provider
    tools = session.tools()
    print(
        f"Number of tools available: {len(tools) if isinstance(tools, list) else 'N/A'}"
    )

    return session


# Example 2: Create a session with connection management
def session_with_connections_example():
    """Create a session with connection management enabled."""
    print("\n=== Session with Connection Management ===")

    user_id = "user_456"

    # Create a tool router session with connection management
    session = composio.tool_router.create(user_id=user_id, manage_connections=True)

    print(f"Session ID: {session.session_id}")
    print("Connection management enabled")

    # Get tools (now includes COMPOSIO_MANAGE_CONNECTIONS)
    tools = session.tools()
    print(
        f"Number of tools available: {len(tools) if isinstance(tools, list) else 'N/A'}"
    )

    return session


# Example 3: Authorize a toolkit
def authorize_toolkit_example():
    """Demonstrate toolkit authorization."""
    print("\n=== Authorize Toolkit Example ===")

    user_id = "user_789"

    # Create a session
    session = composio.tool_router.create(user_id=user_id)

    # Authorize GitHub toolkit for the user
    try:
        connection_request = session.authorize("github")

        print(f"Connection Request ID: {connection_request.id}")
        print(f"Connection Status: {connection_request.status}")

        if connection_request.redirect_url:
            print(f"Redirect URL: {connection_request.redirect_url}")
            print("User should visit this URL to complete authorization")

        return connection_request
    except Exception as e:
        print(f"Error authorizing toolkit: {e}")
        return None


# Example 4: Get toolkit connection states
def get_toolkits_example():
    """Get toolkit connection states for a session."""
    print("\n=== Get Toolkits Example ===")

    user_id = "user_101"

    # Create a session
    session = composio.tool_router.create(user_id=user_id)

    # Get toolkit connection states
    toolkits = session.toolkits()

    print(f"Current toolkits: {toolkits}")

    return toolkits


# Example 5: Full workflow with advanced configuration
def full_workflow_example():
    """Complete workflow with session, tools, and authorization."""
    print("\n=== Full Workflow Example ===")

    user_id = "user_full"

    # 1. Create session with multiple configurations
    session = composio.tool_router.create(
        user_id=user_id,
        toolkits=["github", "slack"],
        manage_connections=True,
        auth_configs={"github": "ac_demo_123"},
    )

    print(f"✓ Created session: {session.session_id}")

    # 2. Get tools for the session
    tools = session.tools()
    print(f"✓ Retrieved {len(tools) if isinstance(tools, list) else 'N/A'} tools")

    # 3. Check toolkits
    toolkits_result = session.toolkits()
    print(f"✓ Current toolkits: {len(toolkits_result.items)} toolkit(s)")

    # 4. Authorize a toolkit if needed
    try:
        connection_request = session.authorize("slack")
        print("✓ Initiated authorization for Slack")

        if connection_request.redirect_url:
            print(f"  → Redirect URL: {connection_request.redirect_url}")
    except Exception as e:
        print(f"✗ Authorization error: {e}")

    return session


# Example 6: Using with custom modifiers
def session_with_modifiers_example():
    """Create a session and use tools with custom modifiers."""
    print("\n=== Session with Modifiers Example ===")

    user_id = "user_modifiers"

    # Create session
    session = composio.tool_router.create(user_id=user_id)

    # Get tools with custom modifiers
    modifiers = {
        # Add any custom modifiers here
        # Example: timeout, custom headers, etc.
    }

    tools = session.tools(modifiers=modifiers if modifiers else None)
    print(
        f"✓ Retrieved {len(tools) if isinstance(tools, list) else 'N/A'} tools with modifiers"
    )

    return session


if __name__ == "__main__":
    """Run all examples."""
    print("Composio ToolRouter Examples\n")
    print("=" * 50)

    # Run examples
    try:
        basic_session_example()
        session_with_connections_example()
        authorize_toolkit_example()
        get_toolkits_example()
        full_workflow_example()
        session_with_modifiers_example()

        print("\n" + "=" * 50)
        print("✓ All examples completed successfully!")

    except Exception as e:
        print(f"\n✗ Error running examples: {e}")
        import traceback

        traceback.print_exc()
