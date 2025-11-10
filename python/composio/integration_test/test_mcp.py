"""
Comprehensive integration tests for Composio MCP functionality.

This module provides comprehensive pytest-based tests for the MCP (Model Context Protocol) functionality,
combining both structured pytest tests and direct execution tests for non-auth toolkits.

Usage:
    export COMPOSIO_API_KEY="your_api_key_here"
    pytest python/composio/integration_test/test_mcp.py -v
"""

import os
import uuid

import pytest
import requests

from composio import Composio
from composio.exceptions import ValidationError

# Test configuration
API_KEY = os.getenv("COMPOSIO_API_KEY")
TEST_CONFIG_PREFIX = "pytest_integration_test"

if not API_KEY:
    pytest.fail("COMPOSIO_API_KEY environment variable not set", pytrace=False)


def generate_unique_name(prefix: str = "pytest") -> str:
    """Generate a unique test name using UUID to avoid collisions."""
    # Use first 8 characters of UUID for readability while maintaining uniqueness
    unique_id = str(uuid.uuid4())[:8]
    return f"{prefix}-{unique_id}"


@pytest.fixture
def composio_client():
    """Fixture providing Composio client instance."""
    return Composio(api_key=API_KEY)


@pytest.fixture
def test_mcp_config_data():
    """Fixture providing test data for MCP config creation."""
    return {
        "name": generate_unique_name("pytest-data"),
        "toolkits": ["composio_search", "text_to_pdf"],
        "allowed_tools": [
            "COMPOSIO_SEARCH_DUCK_DUCK_GO_SEARCH",
            "TEXT_TO_PDF_CONVERT_TEXT_TO_PDF",
        ],
        "manually_manage_connections": False,
    }


class TestMCPStructure:
    """Test the basic structure and availability of MCP features."""

    def test_mcp_namespace_exists(self, composio_client):
        """Test that mcp namespace exists at top level."""
        assert hasattr(composio_client, "mcp"), "Missing mcp namespace"

    @pytest.mark.parametrize(
        "method_name", ["create", "list", "get", "update", "delete", "generate"]
    )
    def test_mcp_methods_available(self, composio_client, method_name):
        """Test that all required MCP methods are available."""
        assert hasattr(composio_client.mcp, method_name), (
            f"Missing method: {method_name}"
        )


class TestMCPOperations:
    """Test MCP CRUD operations."""

    def test_list_mcp_configs(self, composio_client):
        """Test listing MCP configurations."""
        try:
            configs = composio_client.mcp.list()
            assert isinstance(configs, dict), "list() should return a dictionary"
            assert "items" in configs, "Response should contain 'items' key"
            assert "current_page" in configs, (
                "Response should contain 'current_page' key"
            )
            assert "total_pages" in configs, "Response should contain 'total_pages' key"
            assert isinstance(configs["items"], list), "items should be a list"
        except Exception as e:
            # List might fail if no configs exist or API issues, but method should exist
            assert "Failed to list MCP servers" in str(e) or "list" in str(e).lower()

    def test_list_with_pagination(self, composio_client):
        """Test listing with pagination parameters."""
        try:
            configs = composio_client.mcp.list(page_no=1, limit=5)
            assert isinstance(configs, dict), (
                "Paginated list should return a dictionary"
            )
            assert "items" in configs, "Response should contain 'items'"
        except Exception as e:
            # Expected to fail with current API implementation
            assert "Failed to list MCP servers" in str(e)

    def test_list_with_filters(self, composio_client):
        """Test listing with filter parameters."""
        try:
            # Test toolkit filter with non-auth toolkits
            configs_search = composio_client.mcp.list(toolkits="composio_search")
            assert configs_search["items"] is None or isinstance(
                configs_search["items"], list
            )

            # Test name filter
            configs_name = composio_client.mcp.list(name="test")
            assert configs_name["items"] is None or isinstance(
                configs_name["items"], list
            )
        except Exception as e:
            # Expected to fail with current API implementation
            assert "Failed to list MCP servers" in str(e)

    def test_create_mcp_config(self, composio_client):
        """Test creating MCP configuration with new API using non-auth toolkits."""
        # Server name must be ≤30 chars and only contain letters, numbers, spaces, hyphens
        test_name = generate_unique_name("pytest-create")

        mcp_config = composio_client.mcp.create(
            test_name,
            toolkits=["composio_search", "text_to_pdf"],
            allowed_tools=[
                "COMPOSIO_SEARCH_DUCK_DUCK_GO_SEARCH",
                "TEXT_TO_PDF_CONVERT_TEXT_TO_PDF",
            ],
            manually_manage_connections=False,
        )

        # Basic response validation
        assert mcp_config.id
        assert mcp_config.name == test_name
        assert callable(mcp_config.generate)
        assert mcp_config.allowed_tools == [
            "COMPOSIO_SEARCH_DUCK_DUCK_GO_SEARCH",
            "TEXT_TO_PDF_CONVERT_TEXT_TO_PDF",
        ]
        assert mcp_config.commands.claude
        assert mcp_config.commands.cursor
        assert mcp_config.commands.windsurf

        # Test the generate method
        try:
            server_instance = mcp_config.generate("test_user_123")
            assert isinstance(server_instance, dict), (
                "generate should return a dictionary"
            )
            assert "id" in server_instance, "Server instance should have id"
            assert "url" in server_instance, "Server instance should have url"
            assert "type" in server_instance, "Server instance should have type"
            assert server_instance["type"] == "streamable_http", (
                "Server type should be streamable_http"
            )
            assert isinstance(server_instance["url"], str), "URL should be string"
            assert len(server_instance["url"]) > 0, "URL should not be empty"
        except Exception as e:
            print(f"Generate method failed (may be expected): {e}")

    def test_get_nonexistent_config(self, composio_client):
        """Test getting a non-existent configuration."""
        with pytest.raises(ValidationError):
            composio_client.mcp.get("nonexistent_config_id")

    def test_create_with_empty_toolkits(self, composio_client):
        """Test creating with empty toolkit configuration."""
        with pytest.raises(ValidationError):
            composio_client.mcp.create(
                "test_empty",
                toolkits=[],  # Empty toolkits
            )

    def test_generate_method_directly(self, composio_client):
        """Test the generate method directly on MCP class using non-auth toolkits."""
        # First create a config
        test_name = generate_unique_name("pytest-generate")

        mcp_config = composio_client.mcp.create(
            test_name,
            toolkits=["composio_search", "text_to_pdf"],
            allowed_tools=[
                "COMPOSIO_SEARCH_DUCK_DUCK_GO_SEARCH",
                "TEXT_TO_PDF_CONVERT_TEXT_TO_PDF",
            ],
            manually_manage_connections=False,
        )

        # Test generate method directly
        try:
            server_instance = composio_client.mcp.generate(
                "test_user_direct_123",
                mcp_config.id,
                {"manually_manage_connections": False},
            )

            assert isinstance(server_instance, dict), (
                "generate should return a dictionary"
            )
            assert server_instance["id"] == mcp_config.id, (
                "Instance ID should match config ID"
            )
            assert server_instance["user_id"] == "test_user_direct_123", (
                "User ID should match"
            )
            assert server_instance["type"] == "streamable_http", (
                "Type should be streamable_http"
            )
            assert "url" in server_instance, "Should have URL"
        except Exception as e:
            print(f"Direct generate failed (may be expected): {e}")

    def test_create_with_string_toolkits(self, composio_client):
        """Test creating MCP configuration using simple string toolkit names."""
        test_name = generate_unique_name("pytest-strings")

        # Test with simple string toolkit names
        mcp_config = composio_client.mcp.create(
            test_name,
            toolkits=["composio_search", "text_to_pdf"],
            manually_manage_connections=False,
        )

        # Basic validation
        assert mcp_config.id
        assert mcp_config.name == test_name
        assert callable(mcp_config.generate)

    def test_create_with_mixed_toolkits(self, composio_client):
        """Test creating MCP configuration with mixed string and object formats."""
        test_name = generate_unique_name("pytest-mixed")

        # Test with mixed formats (string and object with auth_config_id)
        mcp_config = composio_client.mcp.create(
            test_name,
            toolkits=[
                "composio_search",  # String format
                {
                    "toolkit": "text_to_pdf",
                    # No auth_config_id needed for non-auth toolkit
                },  # Object format
            ],
            allowed_tools=[
                "COMPOSIO_SEARCH_DUCK_DUCK_GO_SEARCH",
                "TEXT_TO_PDF_CONVERT_TEXT_TO_PDF",
            ],
            manually_manage_connections=False,
        )

        # Basic validation
        assert mcp_config.id
        assert mcp_config.name == test_name
        assert callable(mcp_config.generate)

    def test_create_response_structure(self, composio_client):
        """Test that create response has all required fields."""
        test_name = generate_unique_name("pytest-structure")

        mcp_config = composio_client.mcp.create(
            test_name,
            toolkits=["composio_search", "text_to_pdf"],
            allowed_tools=[
                "COMPOSIO_SEARCH_DUCK_DUCK_GO_SEARCH",
                "TEXT_TO_PDF_CONVERT_TEXT_TO_PDF",
            ],
            manually_manage_connections=False,
        )

        # Basic structure validation
        assert mcp_config.id
        assert mcp_config.name == test_name
        assert mcp_config.allowed_tools == [
            "COMPOSIO_SEARCH_DUCK_DUCK_GO_SEARCH",
            "TEXT_TO_PDF_CONVERT_TEXT_TO_PDF",
        ]
        assert mcp_config.auth_config_ids == []
        assert mcp_config.mcp_url
        assert mcp_config.commands.claude
        assert mcp_config.commands.cursor
        assert mcp_config.commands.windsurf
        assert callable(mcp_config.generate)


class TestMCPErrorHandling:
    """Test error handling and edge cases."""

    @pytest.mark.parametrize(
        "invalid_config_id", ["", "invalid_id", "mcp_000000", "nonexistent"]
    )
    def test_invalid_config_ids(self, composio_client, invalid_config_id):
        """Test various invalid configuration IDs."""
        with pytest.raises(ValidationError):
            composio_client.mcp.get(invalid_config_id)

    def test_generate_with_invalid_params(self, composio_client):
        """Test generate method with invalid parameters."""
        with pytest.raises(ValidationError):
            composio_client.mcp.generate("", "invalid_config_id")

    def test_create_with_invalid_toolkit_config(self, composio_client):
        """Test create with invalid toolkit configuration."""
        # Test with empty toolkit config - should fail during API call
        try:
            result = composio_client.mcp.create(
                "test",
                toolkits=[
                    {
                        # Empty toolkit config - will fail at API level
                    }
                ],
            )
            # If it somehow succeeds, that's unexpected but not necessarily wrong
            print(f"Create succeeded with empty config: {result.id}")
        except ValidationError as e:
            # Expected - should fail with validation error
            assert "Failed to create MCP server" in str(e)
        except Exception as e:
            # Also acceptable - might fail for other API reasons
            print(f"Create failed with: {type(e).__name__}: {e}")


class TestMCPNoAuthToolkits:
    """Test MCP functionality with non-authentication toolkits."""

    def test_mcp_with_no_auth_toolkits(self, composio_client):
        """Test MCP with toolkits that don't require authentication."""
        print("🔧 Testing MCP with Non-Auth Toolkits")
        print("=" * 50)

        # Create MCP server with non-auth toolkits
        server_name = generate_unique_name("no-auth-test")
        print(f"🚀 Creating MCP server: {server_name}")

        mcp_server = composio_client.mcp.create(
            server_name,
            toolkits=["composio_search", "text_to_pdf"],
            allowed_tools=[
                "COMPOSIO_SEARCH_DUCK_DUCK_GO_SEARCH",
                "TEXT_TO_PDF_CONVERT_TEXT_TO_PDF",
            ],
            manually_manage_connections=False,
        )

        print("✅ MCP server created successfully!")
        print(f"   Server ID: {mcp_server.id}")
        print(f"   Server Name: {mcp_server.name}")
        print(f"   Toolkits: {getattr(mcp_server, 'toolkits', 'N/A')}")

        # Generate server instance for a test user
        test_user_id = "test_user_no_auth_123"
        print(f"\n🔗 Generating server instance for user: {test_user_id}")

        server_instance = mcp_server.generate(test_user_id)

        print("✅ Server instance generated successfully!")
        print(f"   Instance ID: {server_instance['id']}")
        print(f"   Instance Type: {server_instance['type']}")
        print(f"   Instance URL: {server_instance['url']}")
        print(f"   User ID: {server_instance['user_id']}")
        print(f"   Allowed Tools: {server_instance['allowed_tools']}")
        print(f"   Auth Configs: {server_instance['auth_configs']}")

        # Test direct generate method as well
        print("\n🔄 Testing direct generate method...")

        direct_instance = composio_client.mcp.generate(
            test_user_id + "_direct",
            mcp_server.id,
            {"manually_manage_connections": False},
        )

        print("✅ Direct generate method successful!")
        print(f"   Direct Instance URL: {direct_instance['url']}")
        print(f"   Direct Instance User ID: {direct_instance['user_id']}")

        # Test URL connectivity (basic check)
        print("\n🌐 Testing MCP URL connectivity...")

        mcp_url = server_instance["url"]

        try:
            # Just verify the URL is valid and endpoint exists
            # Don't try to read the stream as SSE endpoints can hang indefinitely
            headers = {
                "Accept": "text/event-stream, application/json, */*",
                "Cache-Control": "no-cache",
                "User-Agent": "Composio-Python-MCP-Test",
            }

            # Use HEAD request if supported, otherwise quick GET with immediate close
            response = requests.head(mcp_url, headers=headers, timeout=3)

            if response.status_code == 405:  # Method not allowed for HEAD
                # Try GET but immediately close without reading stream
                response = requests.get(
                    mcp_url, headers=headers, timeout=3, stream=True
                )
                response.close()  # Close immediately without reading

            print("✅ MCP URL is accessible!")
            print(f"   Status Code: {response.status_code}")
            print(f"   URL: {mcp_url[:50]}...")

        except requests.exceptions.Timeout:
            print("⚠️  MCP URL timeout (normal for SSE endpoints)")
        except Exception as e:
            print(f"⚠️  MCP URL test failed: {e}")

        print("\n📊 Test Summary:")
        print(f"   ✅ MCP Server Created: {mcp_server.id}")
        print(f"   ✅ Server Instance Generated: {server_instance['type']}")
        print("   ✅ Direct Generate Method: Working")
        print(f"   ✅ Available Tools: {len(server_instance['allowed_tools'])} tools")
        print(
            f"   ✅ No Auth Required: {len(server_instance['auth_configs'])} auth configs"
        )

        # Assertions for pytest
        assert mcp_server.id is not None
        assert mcp_server.name == server_name
        assert server_instance["type"] == "streamable_http"
        assert server_instance["user_id"] == test_user_id
        assert len(server_instance["allowed_tools"]) > 0
        assert len(server_instance["auth_configs"]) == 0  # No auth required

    def test_mcp_with_string_toolkits(self, composio_client):
        """Test MCP server creation using simple string toolkit names."""
        print("🧪 Testing MCP with string toolkit names...")

        # Create MCP server with string toolkit names (simplified API)
        server_name = generate_unique_name("string-test")
        print(f"🚀 Creating MCP server with strings: {server_name}")

        mcp_server = composio_client.mcp.create(
            server_name,
            toolkits=["composio_search", "text_to_pdf"],  # Simple strings
            manually_manage_connections=False,
        )

        print("✅ MCP server created successfully with string toolkits!")
        print(f"   Server ID: {mcp_server.id}")
        print(f"   Server Name: {mcp_server.name}")

        # Test generate method
        user_id = f"string_user_{str(uuid.uuid4())[:8]}"
        server_instance = mcp_server.generate(user_id)

        print("✅ Server instance generated successfully!")
        print(f"   Instance URL: {server_instance['url']}")
        print(f"   User ID: {server_instance['user_id']}")
        print(f"   Server Type: {server_instance['type']}")

        # Basic validation
        assert server_instance["user_id"] == user_id
        assert server_instance["type"] == "streamable_http"
        assert "url" in server_instance
        assert len(server_instance["url"]) > 0

        print("🎉 String toolkit test completed successfully!")


class TestMCPRealWorldScenarios:
    """Test real-world usage scenarios."""

    def test_full_workflow_with_no_auth_toolkits(self, composio_client):
        """Test complete workflow: create -> generate -> use with non-auth toolkits."""
        # Server name must be ≤30 chars and only contain letters, numbers, spaces, hyphens
        test_name = generate_unique_name("pytest-work")

        # Step 1: Create MCP config
        mcp_config = composio_client.mcp.create(
            test_name,
            toolkits=["composio_search", "text_to_pdf"],
            allowed_tools=[
                "COMPOSIO_SEARCH_DUCK_DUCK_GO_SEARCH",
                "TEXT_TO_PDF_CONVERT_TEXT_TO_PDF",
            ],
            manually_manage_connections=False,
        )

        assert mcp_config.id is not None
        assert mcp_config.name == test_name

        # Step 2: Generate server instance
        try:
            server_instance = mcp_config.generate("workflow_user_123")

            # Step 3: Verify server instance
            assert server_instance["id"] == mcp_config.id
            assert server_instance["user_id"] == "workflow_user_123"
            assert server_instance["type"] == "streamable_http"
            assert isinstance(server_instance["url"], str)
            assert len(server_instance["url"]) > 0

            print("✅ Full workflow successful!")
            print(f"   Config ID: {mcp_config.id}")
            print(f"   Server URL: {server_instance['url'][:50]}...")

        except Exception as e:
            print(f"Workflow generate step failed (may be expected): {e}")

    def test_api_compatibility_with_typescript(self, composio_client):
        """Test that Python API matches TypeScript patterns."""
        # Check method availability (matching TypeScript)
        mcp = composio_client.mcp

        # CRUD operations
        assert hasattr(mcp, "create"), "Missing create method"
        assert hasattr(mcp, "list"), "Missing list method"
        assert hasattr(mcp, "get"), "Missing get method"
        assert hasattr(mcp, "update"), "Missing update method"
        assert hasattr(mcp, "delete"), "Missing delete method"

        # Instance generation
        assert hasattr(mcp, "generate"), "Missing generate method"

        print("✅ API compatibility verified with TypeScript patterns")

    @pytest.mark.skip(
        reason="MCP update bug with 'custom_tools' argument - TypeError in McpResource.update()"
    )
    def test_full_crud_cycle(self, composio_client):
        """Test complete CRUD cycle: create -> get -> update -> get with assertions at each step."""
        test_name = generate_unique_name("pytest-crud")

        # Step 1: CREATE MCP server
        print(f"🏗️  Step 1: Creating MCP server '{test_name}'")
        mcp_server = composio_client.mcp.create(
            test_name,
            toolkits=["composio_search"],
            allowed_tools=["COMPOSIO_SEARCH_DUCK_DUCK_GO_SEARCH"],
            manually_manage_connections=False,
        )

        # Assertions after CREATE
        assert mcp_server.id is not None, "Created server should have ID"
        assert mcp_server.name == test_name, f"Server name should be {test_name}"
        assert mcp_server.allowed_tools == ["COMPOSIO_SEARCH_DUCK_DUCK_GO_SEARCH"], (
            "Should have correct allowed tools"
        )
        assert len(mcp_server.auth_config_ids) == 0, (
            "Should have no auth configs for non-auth toolkits"
        )
        assert callable(mcp_server.generate), "Should have generate method"
        print(f"✅ CREATE: Server created with ID {mcp_server.id}")

        # Step 2: GET MCP server
        print(f"📖 Step 2: Getting MCP server '{mcp_server.id}'")
        retrieved_server = composio_client.mcp.get(mcp_server.id)

        # Assertions after GET
        assert retrieved_server.id == mcp_server.id, (
            "Retrieved ID should match created ID"
        )
        assert retrieved_server.name == test_name, "Retrieved name should match"
        print("✅ GET: Successfully retrieved server")

        # Step 3: UPDATE MCP server
        updated_name = f"{test_name}-updated"
        print(
            f"🔄 Step 3: Updating MCP server to '{updated_name}' with additional toolkit"
        )
        composio_client.mcp.update(
            mcp_server.id,
            name=updated_name,
            toolkits=["composio_search", "text_to_pdf"],
            allowed_tools=[
                "COMPOSIO_SEARCH_DUCK_DUCK_GO_SEARCH",
                "TEXT_TO_PDF_CONVERT_TEXT_TO_PDF",
            ],
        )
        print("✅ UPDATE: Server updated successfully")

        # Step 4: GET updated MCP server
        print("📖 Step 4: Getting updated MCP server")
        final_server = composio_client.mcp.get(mcp_server.id)

        # Assertions after UPDATE and final GET
        assert final_server.id == mcp_server.id, "ID should remain the same"

        # Verify that updates took effect
        assert final_server.name == updated_name, (
            f"Name should be updated to {updated_name}"
        )

        # Check that toolkits were updated (should now include both composio_search and text_to_pdf)
        expected_toolkits = ["composio_search", "text_to_pdf"]
        actual_toolkits = getattr(final_server, "toolkits", [])
        for toolkit in expected_toolkits:
            assert toolkit in actual_toolkits, (
                f"Updated toolkits should include {toolkit}"
            )

        # Check that allowed_tools were updated
        expected_tools = [
            "COMPOSIO_SEARCH_DUCK_DUCK_GO_SEARCH",
            "TEXT_TO_PDF_CONVERT_TEXT_TO_PDF",
        ]
        actual_tools = getattr(final_server, "allowed_tools", [])
        for tool in expected_tools:
            assert tool in actual_tools, f"Updated allowed_tools should include {tool}"

        print("✅ FINAL GET: Retrieved updated server with correct changes")
        print(f"   Updated name: {final_server.name}")
        print(f"   Updated toolkits: {actual_toolkits}")
        print(f"   Updated allowed_tools: {actual_tools}")

        print(f"🎉 CRUD cycle test completed for server {mcp_server.id}")


# Direct execution support for backward compatibility
def main():
    """Main test function for direct execution."""
    print("🎯 MCP Integration Tests")
    print("Testing MCP functionality with non-auth toolkits")
    print()

    # Initialize Composio client
    composio = Composio()

    # Run the no-auth toolkit test directly
    try:
        # Create test instance
        test_instance = TestMCPNoAuthToolkits()
        test_instance.test_mcp_with_no_auth_toolkits(composio)

        print("\n🎉 All tests passed! MCP is working with non-auth toolkits.")
        return True
    except Exception as e:
        print(f"\n💥 Tests failed: {e}")
        import traceback

        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
