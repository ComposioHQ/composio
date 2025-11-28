"""
Advanced examples demonstrating the ToolRouter with all configuration options.

This example shows various ways to configure tool router sessions with
different parameters matching the TypeScript implementation.
"""

from composio import Composio

# Initialize Composio SDK
composio = Composio()


def example_with_specific_toolkits():
    """Create a session with specific toolkits enabled."""
    print("=== Specific Toolkits Example ===")

    session = composio.tool_router.create(
        user_id="user_toolkit", toolkits=["github", "slack", "linear"]
    )

    print(f"Session ID: {session.session_id}")
    print("Available toolkits: github, slack, linear")
    return session


def example_with_disabled_toolkits():
    """Create a session with specific toolkits disabled."""
    print("\n=== Disabled Toolkits Example ===")

    session = composio.tool_router.create(
        user_id="user_disabled", toolkits={"disabled": ["linear", "jira"]}
    )

    print(f"Session ID: {session.session_id}")
    print("Disabled toolkits: linear, jira")
    return session


def example_with_connection_management_config():
    """Create a session with connection management and callback URL."""
    print("\n=== Connection Management with Callback Example ===")

    session = composio.tool_router.create(
        user_id="user_callback",
        manage_connections={
            "enabled": True,
            "callback_uri": "https://myapp.com/oauth/callback",
        },
    )

    print(f"Session ID: {session.session_id}")
    print("Connection management enabled with custom callback")
    return session


def example_with_auth_configs():
    """Create a session with specific auth configs for toolkits."""
    print("\n=== Auth Configs Example ===")

    session = composio.tool_router.create(
        user_id="user_auth",
        toolkits=["github", "slack"],
        auth_configs={"github": "ac_github_123", "slack": "ac_slack_456"},
    )

    print(f"Session ID: {session.session_id}")
    print("Auth configs: github → ac_github_123, slack → ac_slack_456")
    return session


def example_with_connected_accounts():
    """Create a session with pre-configured connected accounts."""
    print("\n=== Connected Accounts Example ===")

    session = composio.tool_router.create(
        user_id="user_connected",
        toolkits=["github", "slack"],
        connected_accounts={"github": "ca_github_789", "slack": "ca_slack_012"},
    )

    print(f"Session ID: {session.session_id}")
    print("Connected accounts: github → ca_github_789, slack → ca_slack_012")
    return session


def example_with_all_parameters():
    """Create a session with all parameters configured."""
    print("\n=== All Parameters Example ===")

    session = composio.tool_router.create(
        user_id="user_complete",
        toolkits=["github", "slack", "notion"],
        manage_connections={
            "enabled": True,
            "callback_uri": "https://myapp.com/callback",
        },
        auth_configs={
            "github": "ac_github_xyz",
            "slack": "ac_slack_abc",
            "notion": "ac_notion_def",
        },
        connected_accounts={"github": "ca_github_111", "slack": "ca_slack_222"},
    )

    print(f"✓ Session ID: {session.session_id}")
    print("✓ Toolkits: github, slack, notion")
    print("✓ Connection management: enabled with callback")
    print("✓ Auth configs: configured for 3 toolkits")
    print("✓ Connected accounts: 2 pre-configured")

    return session


def example_minimal_vs_maximal():
    """Compare minimal and maximal configurations."""
    print("\n=== Minimal vs Maximal Example ===")

    # Minimal - just user ID
    minimal_session = composio.tool_router.create(user_id="user_minimal")
    print(f"Minimal session: {minimal_session.session_id}")

    # Maximal - all options
    maximal_session = composio.tool_router.create(
        user_id="user_maximal",
        toolkits=["github", "slack"],
        manage_connections={"enabled": True, "callback_uri": "https://app.com/cb"},
        auth_configs={"github": "ac_1", "slack": "ac_2"},
        connected_accounts={"github": "ca_1"},
    )
    print(f"Maximal session: {maximal_session.session_id}")

    return minimal_session, maximal_session


def example_type_safe_configuration():
    """Demonstrate type-safe configuration using TypedDict."""
    print("\n=== Type-Safe Configuration Example ===")

    from composio.core.models.tool_router import (
        ToolRouterToolkitsDisabledConfig,
        ToolRouterManageConnectionsConfig,
    )

    # Type-safe toolkit config
    toolkit_config: ToolRouterToolkitsDisabledConfig = {"disabled": ["linear", "asana"]}

    # Type-safe connection management config
    connection_config: ToolRouterManageConnectionsConfig = {
        "enabled": True,
        "callback_uri": "https://secure.app.com/oauth",
        "infer_scopes_from_tools": False,
    }

    session = composio.tool_router.create(
        user_id="user_typesafe",
        toolkits=toolkit_config,
        manage_connections=connection_config,
    )

    print(f"Session ID: {session.session_id}")
    print("✓ Type-safe configuration applied")

    return session


if __name__ == "__main__":
    """Run all advanced examples."""
    print("Composio ToolRouter Advanced Examples\n")
    print("=" * 60)

    try:
        example_with_specific_toolkits()
        example_with_disabled_toolkits()
        example_with_connection_management_config()
        example_with_auth_configs()
        example_with_connected_accounts()
        example_with_all_parameters()
        example_minimal_vs_maximal()
        example_type_safe_configuration()

        print("\n" + "=" * 60)
        print("✓ All advanced examples completed successfully!")

    except Exception as e:
        print(f"\n✗ Error running examples: {e}")
        import traceback

        traceback.print_exc()
