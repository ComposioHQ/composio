"""
Advanced examples demonstrating the ToolRouter with all configuration options.

This example shows various ways to configure tool router sessions with
different parameters matching the TypeScript implementation.
"""

import os

from composio import Composio

# Initialize Composio SDK
composio = Composio()

# Provisioned project state (raise KeyError when unset). Auth config and
# connected account ids are validated by the backend, so real ids are required.
user_id = os.environ["COMPOSIO_EXAMPLES_USER_ID"]
github_auth_config_id = os.environ["COMPOSIO_EXAMPLES_GITHUB_AUTH_CONFIG_ID"]
slack_auth_config_id = os.environ["COMPOSIO_EXAMPLES_SLACK_AUTH_CONFIG_ID"]
github_connected_account_id = os.environ[
    "COMPOSIO_EXAMPLES_GITHUB_CONNECTED_ACCOUNT_ID"
]
slack_connected_account_id = os.environ["COMPOSIO_EXAMPLES_SLACK_CONNECTED_ACCOUNT_ID"]


def example_with_specific_toolkits():
    """Create a session with specific toolkits enabled."""
    print("=== Specific Toolkits Example ===")

    session = composio.tool_router.create(
        user_id=user_id, toolkits=["github", "slack", "linear"]
    )

    print(f"Session ID: {session.session_id}")
    print("Available toolkits: github, slack, linear")
    return session


def example_with_disabled_toolkits():
    """Create a session with specific toolkits disabled."""
    print("\n=== Disabled Toolkits Example ===")

    session = composio.tool_router.create(
        user_id=user_id, toolkits={"disable": ["linear", "jira"]}
    )

    print(f"Session ID: {session.session_id}")
    print("Disabled toolkits: linear, jira")
    return session


def example_with_connection_management_config():
    """Create a session with connection management and callback URL."""
    print("\n=== Connection Management with Callback Example ===")

    session = composio.tool_router.create(
        user_id=user_id,
        manage_connections={
            "enable": True,
            "callback_url": "https://myapp.com/oauth/callback",
        },
    )

    print(f"Session ID: {session.session_id}")
    print("Connection management enabled with custom callback")
    return session


def example_with_auth_configs():
    """Create a session with specific auth configs for toolkits."""
    print("\n=== Auth Configs Example ===")

    session = composio.tool_router.create(
        user_id=user_id,
        toolkits=["github", "slack"],
        auth_configs={"github": github_auth_config_id, "slack": slack_auth_config_id},
    )

    print(f"Session ID: {session.session_id}")
    print(
        f"Auth configs: github → {github_auth_config_id}, slack → {slack_auth_config_id}"
    )
    return session


def example_with_connected_accounts():
    """Create a session with pre-configured connected accounts."""
    print("\n=== Connected Accounts Example ===")

    session = composio.tool_router.create(
        user_id=user_id,
        toolkits=["github", "slack"],
        connected_accounts={
            "github": github_connected_account_id,
            "slack": slack_connected_account_id,
        },
    )

    print(f"Session ID: {session.session_id}")
    print(
        f"Connected accounts: github → {github_connected_account_id}, "
        f"slack → {slack_connected_account_id}"
    )
    return session


def example_with_all_parameters():
    """Create a session with all parameters configured."""
    print("\n=== All Parameters Example ===")

    session = composio.tool_router.create(
        user_id=user_id,
        toolkits=["github", "slack"],
        manage_connections={
            "enable": True,
            "callback_url": "https://myapp.com/callback",
        },
        auth_configs={
            "github": github_auth_config_id,
            "slack": slack_auth_config_id,
        },
        connected_accounts={
            "github": github_connected_account_id,
            "slack": slack_connected_account_id,
        },
    )

    print(f"✓ Session ID: {session.session_id}")
    print("✓ Toolkits: github, slack")
    print("✓ Connection management: enabled with callback")
    print("✓ Auth configs: configured for 2 toolkits")
    print("✓ Connected accounts: 2 pre-configured")

    return session


def example_minimal_vs_maximal():
    """Compare minimal and maximal configurations."""
    print("\n=== Minimal vs Maximal Example ===")

    # Minimal - just user ID
    minimal_session = composio.tool_router.create(user_id=user_id)
    print(f"Minimal session: {minimal_session.session_id}")

    # Maximal - all options
    maximal_session = composio.tool_router.create(
        user_id=user_id,
        toolkits=["github", "slack"],
        manage_connections={"enable": True, "callback_url": "https://app.com/cb"},
        auth_configs={"github": github_auth_config_id, "slack": slack_auth_config_id},
        connected_accounts={"github": github_connected_account_id},
    )
    print(f"Maximal session: {maximal_session.session_id}")

    return minimal_session, maximal_session


def example_type_safe_configuration():
    """Demonstrate type-safe configuration using TypedDict."""
    print("\n=== Type-Safe Configuration Example ===")

    from composio.core.models.tool_router import (
        ToolRouterManageConnectionsConfig,
        ToolRouterToolkitsDisableConfig,
    )

    # Type-safe toolkit config
    toolkit_config: ToolRouterToolkitsDisableConfig = {"disable": ["linear", "asana"]}

    # Type-safe connection management config
    connection_config: ToolRouterManageConnectionsConfig = {
        "enable": True,
        "callback_url": "https://secure.app.com/oauth",
    }

    session = composio.tool_router.create(
        user_id=user_id,
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
        raise
