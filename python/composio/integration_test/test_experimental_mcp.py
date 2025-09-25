"""
Pytest-based integration tests for Composio Experimental MCP.

This module provides comprehensive pytest-based tests for the experimental MCP functionality,
including fixtures, parameterized tests, and proper test organization.

Usage:
    pytest python/composio/integration_test/test_experimental_mcp_pytest.py -v
    pytest python/composio/integration_test/test_experimental_mcp_pytest.py::test_mcp_config_create -v
"""

import os
import time

import pytest

from composio import Composio
from composio.exceptions import ValidationError


# Test configuration
API_KEY = os.getenv('COMPOSIO_API_KEY')
TEST_CONFIG_PREFIX = 'pytest_integration_test'

if not API_KEY:
    pytest.skip("COMPOSIO_API_KEY environment variable not set", allow_module_level=True)


@pytest.fixture
def test_mcp_config_data():
    """Fixture providing test data for MCP config creation."""
    return {
        'name': f'pytest-data-{int(time.time()) % 1000000}',
        'server_config': [
            {
                "auth_config_id": "test_auth_config",
                "allowed_tools": ["GMAIL_FETCH_EMAILS", "SLACK_SEND_MESSAGE"]
            }
        ],
        'options': {"is_chat_auth": True}
    }


class TestExperimentalMCPStructure:
    """Test the basic structure and availability of experimental MCP features."""
    
    def test_experimental_namespace_exists(self, composio_client):
        """Test that experimental namespace exists."""
        assert hasattr(composio_client, 'experimental'), "Missing experimental namespace"
    
    def test_experimental_mcp_exists(self, composio_client):
        """Test that experimental.mcp exists."""
        assert hasattr(composio_client.experimental, 'mcp'), "Missing experimental.mcp"
    
    def test_experimental_mcp_config_exists(self, composio_client):
        """Test that experimental.mcp_config exists."""
        assert hasattr(composio_client.experimental, 'mcp_config'), "Missing experimental.mcp_config"
    
    @pytest.mark.parametrize("method_name", [
        "create",
        "get", 
        "get_by_name",
        "list"
    ])
    def test_mcp_config_methods_available(self, composio_client, method_name):
        """Test that all required mcp_config methods are available."""
        assert hasattr(composio_client.experimental.mcp_config, method_name), \
            f"Missing mcp_config.{method_name}"
    
    @pytest.mark.parametrize("method_name", ["get"])
    def test_mcp_methods_available(self, composio_client, method_name):
        """Test that all required mcp methods are available."""
        assert hasattr(composio_client.experimental.mcp, method_name), \
            f"Missing mcp.{method_name}"


class TestMCPConfigOperations:
    """Test MCP configuration CRUD operations."""
    
    def test_list_mcp_configs(self, composio_client):
        """Test listing MCP configurations."""
        configs = composio_client.experimental.mcp_config.list()
        
        assert isinstance(configs, dict), "List should return a dictionary"
        assert "items" in configs, "Response should contain 'items' key"
        assert isinstance(configs["items"], list), "Items should be a list"
    
    def test_list_with_pagination(self, composio_client):
        """Test listing with pagination parameters."""
        configs = composio_client.experimental.mcp_config.list({
            "page": 1,
            "limit": 5
        })
        
        assert len(configs["items"]) <= 5
    
    def test_list_with_filters(self, composio_client):
        """Test listing with various filters."""
        # Test toolkit filter
        configs_gmail = composio_client.experimental.mcp_config.list({
            "toolkits": ["GMAIL"]
        })
        assert configs_gmail["items"] is None or isinstance(configs_gmail["items"], list)
        
        # Test name filter
        configs_name = composio_client.experimental.mcp_config.list({
            "name": "test"
        })
        assert configs_name["items"] is None or isinstance(configs_name["items"], list)
    
    # @pytest.mark.skipif(
    #     condition=lambda: len(os.getenv('SKIP_CREATE_TESTS', '')) > 0,
    #     reason="Create tests skipped - no auth configs available"
    # )
    def test_create_mcp_config(self, composio_client, auth_configs):
        """Test creating MCP configuration."""
        if not auth_configs:
            pytest.skip("No auth configurations available for testing")
        first_auth = auth_configs[0]
        # Server name must be ≤30 chars and only contain letters, numbers, spaces, hyphens
        test_name = f'pytest-create-{int(time.time()) % 1000000}'
        
        mcp_config = composio_client.experimental.mcp_config.create(
            test_name,
            [
                {
                    "auth_config_id": first_auth.id,
                    "allowed_tools": ["*"]
                }
            ],
            {"is_chat_auth": True}
        )
        
        # Verify response structure
        assert hasattr(mcp_config, 'id'), "Response should have id"
        assert hasattr(mcp_config, 'name'), "Response should have name"
        assert hasattr(mcp_config, 'toolkits'), "Response should have toolkits"
        assert hasattr(mcp_config, 'get_server'), "Response should have get_server method"
        
        assert mcp_config.name == test_name
        assert isinstance(mcp_config.toolkits, list)
        
        # Test the getServer method
        server_instance = mcp_config.get_server({"user_id": "pytest_user_123"})
        
        # Verify server instance structure
        required_fields = ['id', 'name', 'type', 'url', 'user_id', 'allowed_tools', 'auth_configs']
        for field in required_fields:
            assert field in server_instance, f"Missing field {field} in server instance"
        
        assert server_instance['user_id'] == "pytest_user_123"
        assert server_instance['type'] == "sse"
        assert server_instance['url'].startswith('http')
    
    def test_get_nonexistent_config(self, composio_client):
        """Test getting a non-existent configuration."""
        with pytest.raises(ValidationError, match="not found"):
            composio_client.experimental.mcp_config.get("nonexistent_config_id")
    
    def test_get_by_name_nonexistent(self, composio_client):
        """Test getting by name for non-existent configuration."""
        with pytest.raises(ValidationError, match="not found"):
            composio_client.experimental.mcp_config.get_by_name("nonexistent_config_name")
    
    def test_create_with_empty_server_config(self, composio_client):
        """Test creating config with empty server configuration."""
        with pytest.raises(ValidationError, match="At least one auth config is required"):
            composio_client.experimental.mcp_config.create(
                "test_empty",
                [],  # Empty server config
                {"is_chat_auth": True}
            )


class TestExperimentalMCPOperations:
    """Test experimental MCP server operations."""
    
    def test_mcp_get_invalid_config(self, composio_client):
        """Test mcp.get() with invalid configuration."""
        with pytest.raises(ValidationError):
            composio_client.experimental.mcp.get(
                "test_user",
                "invalid_config_id",
                {"is_chat_auth": True}
            )
    
    def test_mcp_get_with_existing_config(self, composio_client):
        """Test mcp.get() with existing configuration (if available)."""
        # First, try to find an existing config
        configs = composio_client.experimental.mcp_config.list({"limit": 1})
        
        if not configs["items"]:
            pytest.skip("No existing MCP configurations to test with")
        
        existing_config = configs["items"][0]
        
        server_instance = composio_client.experimental.mcp.get(
            "pytest_test_user",
            existing_config["id"],
            {"is_chat_auth": True}
        )
        
        # Verify server instance structure
        required_fields = ['id', 'name', 'type', 'url', 'user_id', 'allowed_tools', 'auth_configs']
        for field in required_fields:
            assert field in server_instance, f"Missing field {field} in server instance"
        
        assert server_instance['user_id'] == "pytest_test_user"
        assert server_instance['type'] == "sse"
        assert isinstance(server_instance['url'], str)
        assert len(server_instance['url']) > 0


class TestMCPErrorHandling:
    """Test error handling and edge cases."""
    
    @pytest.mark.parametrize("invalid_config_id", [
        "",
        "invalid_id",
        "mcp_000000",
        "nonexistent"
    ])
    def test_invalid_config_ids(self, composio_client, invalid_config_id):
        """Test handling of various invalid configuration IDs."""
        with pytest.raises(ValidationError):
            composio_client.experimental.mcp_config.get(invalid_config_id)
    
    @pytest.mark.parametrize("invalid_name", [
        "",
        "nonexistent_config",
        "invalid-name-12345"
    ])
    def test_invalid_config_names(self, composio_client, invalid_name):
        """Test handling of various invalid configuration names."""
        with pytest.raises(ValidationError):
            composio_client.experimental.mcp_config.get_by_name(invalid_name)
    
    def test_mcp_get_with_invalid_params(self, composio_client):
        """Test mcp.get() with various invalid parameters."""
        with pytest.raises(ValidationError):
            composio_client.experimental.mcp.get("", "", {})
        
        with pytest.raises(ValidationError):
            composio_client.experimental.mcp.get("user", "invalid_config", {})


class TestMCPRealWorldScenarios:
    """Test real-world usage scenarios."""
    
    def test_full_workflow_if_auth_available(self, composio_client, auth_configs):
        """Test complete workflow: create -> get -> use getServer."""
        if not auth_configs:
            pytest.skip("No auth configurations available for full workflow test")
        
        first_auth = auth_configs[0]
        # Server name must be ≤30 chars and only contain letters, numbers, spaces, hyphens
        test_name = f'pytest-work-{int(time.time()) % 1000000}'
        
        # Step 1: Create
        mcp_config = composio_client.experimental.mcp_config.create(
            test_name,
            [{"auth_config_id": first_auth.id, "allowed_tools": ["*"]}],
            {"is_chat_auth": True}
        )
        
        # Step 2: Verify it appears in list
        configs = composio_client.experimental.mcp_config.list({"name": test_name})
        config_found = any(config["name"] == test_name for config in configs["items"])
        assert config_found, "Created config should appear in list"
        
        # Step 3: Get by ID
        retrieved_config = composio_client.experimental.mcp_config.get(mcp_config.id)
        assert retrieved_config["name"] == test_name
        
        # Step 4: Get by name
        retrieved_by_name = composio_client.experimental.mcp_config.get_by_name(test_name)
        assert retrieved_by_name["id"] == mcp_config.id
        
        # Step 5: Use getServer
        server_instance = mcp_config.get_server({"user_id": "workflow_test_user"})
        assert server_instance["user_id"] == "workflow_test_user"
        
        # Step 6: Direct experimental.mcp.get
        direct_server = composio_client.experimental.mcp.get(
            "direct_test_user",
            mcp_config.id,
            {"is_chat_auth": True}
        )
        assert direct_server["user_id"] == "direct_test_user"
    
    def test_list_pagination_and_filtering(self, composio_client):
        """Test advanced list functionality."""
        # Test different page sizes
        for page_size in [1, 5, 10]:
            configs = composio_client.experimental.mcp_config.list({
                "page": 1,
                "limit": page_size
            })
            assert len(configs["items"]) <= page_size
        
        # Test filtering by toolkit
        gmail_configs = composio_client.experimental.mcp_config.list({
            "toolkits": ["GMAIL"]
        })
        assert gmail_configs["items"] is None or isinstance(gmail_configs["items"], list)
        
        # Test filtering by name pattern
        test_configs = composio_client.experimental.mcp_config.list({
            "name": "test"
        })
        assert test_configs["items"] is None or isinstance(test_configs["items"], list)


# No need for custom markers - pytest handles everything we need


# All configuration is handled in conftest.py - keep this file focused on tests only


# This file should be run with pytest, not as a script
# Usage: python -m pytest python/composio/integration_test/test_experimental_mcp.py -v
