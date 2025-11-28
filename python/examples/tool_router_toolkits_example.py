"""
Example demonstrating how to access toolkit connection states with dot notation.

This example shows the improved DX using dataclass models instead of dictionaries.
"""

from composio import Composio

# Initialize Composio and create a session
composio = Composio()
session = composio.tool_router.create(
    user_id="user_123", toolkits=["github", "slack", "gmail"], manage_connections=True
)


def basic_access_example():
    """Basic example showing dot notation access."""
    print("=== Basic Dot Notation Access ===\n")

    # Get toolkit connection states
    toolkits_result = session.toolkits()

    # Access top-level fields using dot notation
    print(f"Total pages: {toolkits_result.total_pages}")
    print(f"Next cursor: {toolkits_result.next_cursor}")
    print(f"Number of toolkits: {len(toolkits_result.items)}")

    # Iterate through each toolkit
    for toolkit in toolkits_result.items:
        print(f"\n=== {toolkit.name} ===")
        print(f"Slug: {toolkit.slug}")
        print(f"Logo URL: {toolkit.logo}")
        print(f"No Auth Required: {toolkit.is_no_auth}")

        # Access connection information using dot notation
        print(f"Is Active: {toolkit.connection.is_active}")

        # Access auth config if available
        if toolkit.connection.auth_config:
            auth_config = toolkit.connection.auth_config
            print(f"Auth Config ID: {auth_config.id}")
            print(f"Auth Mode: {auth_config.mode}")
            print(f"Composio Managed: {auth_config.is_composio_managed}")
        else:
            print("No auth config configured")

        # Access connected account if available
        if toolkit.connection.connected_account:
            account = toolkit.connection.connected_account
            print(f"Connected Account ID: {account.id}")
            print(f"Account Status: {account.status}")
        else:
            print("No connected account")


def check_authorization_status():
    """Check which toolkits need authorization."""
    print("\n=== Toolkits Needing Authorization ===\n")

    toolkits_result = session.toolkits()

    for toolkit in toolkits_result.items:
        if not toolkit.connection.is_active:
            print(f"❌ {toolkit.name} ({toolkit.slug}) - Not connected")

            # Authorize the toolkit
            connection_request = session.authorize(toolkit.slug)
            print(f"   Redirect to: {connection_request.redirect_url}")
        else:
            print(f"✅ {toolkit.name} ({toolkit.slug}) - Connected")


def filter_by_auth_mode():
    """Filter toolkits by auth mode."""
    print("\n=== OAuth2 Toolkits ===\n")

    toolkits_result = session.toolkits()

    oauth2_toolkits = [
        toolkit
        for toolkit in toolkits_result.items
        if toolkit.connection.auth_config
        and toolkit.connection.auth_config.mode == "OAUTH2"
    ]

    for toolkit in oauth2_toolkits:
        print(f"- {toolkit.name} ({toolkit.slug})")
        print(f"  Auth Config: {toolkit.connection.auth_config.id}")
        print(
            f"  Composio Managed: {toolkit.connection.auth_config.is_composio_managed}"
        )


def get_active_toolkits():
    """Get only active (connected) toolkits."""
    print("\n=== Active Toolkits ===\n")

    toolkits_result = session.toolkits()

    active_toolkits = [
        toolkit for toolkit in toolkits_result.items if toolkit.connection.is_active
    ]

    print(f"Total active toolkits: {len(active_toolkits)}")
    for toolkit in active_toolkits:
        print(f"✓ {toolkit.name}")
        if toolkit.connection.connected_account:
            print(f"  Account: {toolkit.connection.connected_account.id}")
            print(f"  Status: {toolkit.connection.connected_account.status}")


def pagination_example():
    """Get all toolkits with pagination."""
    print("\n=== Pagination Example ===\n")

    def get_all_toolkits(session, limit=10):
        """Get all toolkits with pagination."""
        all_toolkits = []
        next_cursor = None

        while True:
            result = session.toolkits(
                options={"limit": limit, "next_cursor": next_cursor}
            )
            all_toolkits.extend(result.items)

            print(f"Fetched {len(result.items)} toolkits (page {result.total_pages})")

            next_cursor = result.next_cursor
            if not next_cursor:
                break

        return all_toolkits

    # Usage with pagination
    all_toolkits = get_all_toolkits(session, limit=5)
    print(f"\nTotal toolkits retrieved: {len(all_toolkits)}")


def build_ui_data():
    """Example: Build data structure for UI display."""
    print("\n=== Building UI Data ===\n")

    toolkits_result = session.toolkits()

    # Build a clean data structure for UI
    ui_data = []
    for toolkit in toolkits_result.items:
        toolkit_data = {
            "name": toolkit.name,
            "slug": toolkit.slug,
            "logo": toolkit.logo,
            "status": "connected" if toolkit.connection.is_active else "disconnected",
            "auth_mode": (
                toolkit.connection.auth_config.mode
                if toolkit.connection.auth_config
                else "N/A"
            ),
            "account_id": (
                toolkit.connection.connected_account.id
                if toolkit.connection.connected_account
                else None
            ),
        }
        ui_data.append(toolkit_data)

    # Display UI data
    import json

    print(json.dumps(ui_data, indent=2))


if __name__ == "__main__":
    """Run all examples."""
    print("Composio ToolRouter - Toolkit Access Examples\n")
    print("=" * 60)

    try:
        basic_access_example()
        check_authorization_status()
        filter_by_auth_mode()
        get_active_toolkits()
        pagination_example()
        build_ui_data()

        print("\n" + "=" * 60)
        print("✓ All examples completed successfully!")

    except Exception as e:
        print(f"\n✗ Error running examples: {e}")
        import traceback

        traceback.print_exc()
