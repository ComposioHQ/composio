"""
Pytest configuration and shared fixtures for Composio integration tests.
"""

import os
import sys
from pathlib import Path

import pytest

# Add the python directory to the path for imports
python_dir = Path(__file__).parent.parent.parent
sys.path.insert(0, str(python_dir))

# Test configuration
API_KEY = os.getenv("COMPOSIO_API_KEY")

if not API_KEY:
    pytest.skip(
        "COMPOSIO_API_KEY environment variable not set", allow_module_level=True
    )


@pytest.fixture(scope="session", autouse=True)
def setup_environment():
    """Set up the test environment for all tests."""
    os.environ["COMPOSIO_API_KEY"] = API_KEY
    yield


@pytest.fixture(scope="session")
def composio_client():
    """Provide a Composio client instance for all tests."""
    from composio import Composio

    return Composio()


@pytest.fixture(scope="session")
def auth_configs(composio_client):
    """Get available auth configurations for testing."""
    try:
        configs_response = composio_client.auth_configs.list()

        # Debug what we get
        print(f"Raw response type: {type(configs_response)}")

        # Handle different response formats
        if hasattr(configs_response, "items"):
            # Direct access to items
            items = configs_response.items
            print(f"Found items directly: {len(items) if items else 0}")
            return list(items) if items else []
        elif hasattr(configs_response, "__iter__"):
            # If it's being converted to an iterable of tuples, find the items tuple
            items_tuple = None
            for item in configs_response:
                if isinstance(item, tuple) and len(item) == 2 and item[0] == "items":
                    items_tuple = item[1]
                    break

            if items_tuple:
                print(f"Found items in tuple: {len(items_tuple)}")
                return list(items_tuple)

        return []

    except Exception as e:
        print(f"Exception in auth_configs fixture: {e}")
        import traceback

        traceback.print_exc()
        return []


@pytest.fixture
def sample_mcp_config_data():
    """Provide sample data for MCP configuration testing."""
    import time

    return {
        "name": f"pytest_test_{int(time.time())}",
        "server_config": [
            {"auth_config_id": "test_auth_id", "allowed_tools": ["GMAIL_FETCH_EMAILS"]}
        ],
        "options": {"is_chat_auth": True},
    }


@pytest.fixture
def test_user_id():
    """Provide a consistent test user ID."""
    return "pytest_integration_user_123"


# Track created resources for cleanup
_created_mcp_servers = []


@pytest.fixture
def mcp_server_cleanup(composio_client):
    """Fixture to track and cleanup MCP servers created during tests."""
    created_servers = []

    yield created_servers

    # Cleanup after test
    for server_id in created_servers:
        try:
            composio_client.mcp.delete(server_id)
            print(f"✅ Cleaned up MCP server: {server_id}")
        except Exception as e:
            print(f"⚠️  Failed to cleanup MCP server {server_id}: {e}")


def pytest_configure(config):
    """Configure pytest with custom settings."""
    # Add timeout marker
    config.addinivalue_line(
        "markers", "timeout: mark test to run with a specific timeout"
    )
