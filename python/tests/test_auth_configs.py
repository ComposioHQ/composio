"""Tests for auth configs management."""

import pytest
from unittest.mock import Mock

from composio.core.models.auth_configs import AuthConfigs
from composio.client.types import (
    auth_config_list_response,
    auth_config_create_response,
    auth_config_retrieve_response,
)


class TestAuthConfigs:
    """Test suite for AuthConfigs class."""

    @pytest.fixture
    def mock_client(self):
        """Create a mock client for testing."""
        client = Mock()
        client.auth_configs = Mock()
        client.auth_configs.list = Mock()
        client.auth_configs.create = Mock()
        client.auth_configs.retrieve = Mock()
        client.auth_configs.update = Mock()
        client.auth_configs.delete = Mock()
        client.auth_configs.update_status = Mock()
        client.not_given = object()  # Sentinel value for optional params
        return client

    @pytest.fixture
    def auth_configs(self, mock_client):
        """Create an AuthConfigs instance with mock client."""
        return AuthConfigs(client=mock_client)

    @pytest.fixture
    def mock_auth_config_response(self):
        """Mock auth config retrieve response."""
        response = Mock(spec=auth_config_retrieve_response.AuthConfigRetrieveResponse)
        response.id = "auth_12345"
        response.name = "Test Auth Config"
        response.no_of_connections = 5
        response.status = "ENABLED"
        response.toolkit = Mock()
        response.toolkit.logo = "https://example.com/logo.png"
        response.toolkit.slug = "github"
        response.uuid = "uuid-12345"
        response.auth_scheme = "OAUTH2"
        response.credentials = {
            "client_id": "test_client_id",
            "client_secret": "test_client_secret",
        }
        response.expected_input_fields = [
            {"name": "client_id", "type": "string"},
            {"name": "client_secret", "type": "string"},
        ]
        response.is_composio_managed = True
        response.created_by = "user_123"
        response.created_at = "2023-01-01T00:00:00Z"
        response.last_updated_at = "2023-01-01T00:00:00Z"
        return response

    def test_constructor_creates_instance(self, auth_configs, mock_client):
        """Test that AuthConfigs instance is created successfully."""
        assert isinstance(auth_configs, AuthConfigs)
        assert auth_configs._client is mock_client

    # List tests
    def test_list_without_params(self, auth_configs, mock_client):
        """Test listing auth configs without query parameters."""
        mock_response = Mock(spec=auth_config_list_response.AuthConfigListResponse)
        mock_response.items = []
        mock_response.next_cursor = None
        mock_response.total_pages = 0
        mock_client.auth_configs.list.return_value = mock_response

        result = auth_configs.list()

        mock_client.auth_configs.list.assert_called_once_with()
        assert result == mock_response

    def test_list_with_params(self, auth_configs, mock_client):
        """Test listing auth configs with query parameters."""
        mock_response = Mock(spec=auth_config_list_response.AuthConfigListResponse)
        mock_response.items = []
        mock_client.auth_configs.list.return_value = mock_response

        result = auth_configs.list(
            cursor="cursor_123",
            is_composio_managed=True,
            limit=10,
            toolkit_slug="github",
        )

        mock_client.auth_configs.list.assert_called_once_with(
            cursor="cursor_123",
            is_composio_managed=True,
            limit=10,
            toolkit_slug="github",
        )
        assert result == mock_response

    def test_list_with_empty_result(self, auth_configs, mock_client):
        """Test listing auth configs returns empty list."""
        mock_response = Mock(spec=auth_config_list_response.AuthConfigListResponse)
        mock_response.items = []
        mock_response.next_cursor = None
        mock_response.total_pages = 0
        mock_client.auth_configs.list.return_value = mock_response

        result = auth_configs.list()

        assert len(result.items) == 0
        assert result.next_cursor is None
        assert result.total_pages == 0

    # Create tests
    def test_create_with_default_composio_managed_auth(self, auth_configs, mock_client):
        """Test creating auth config with default Composio managed type."""
        mock_auth_config = Mock(spec=auth_config_create_response.AuthConfig)
        mock_auth_config.id = "auth_12345"
        mock_auth_config.auth_scheme = "OAUTH2"
        mock_auth_config.is_composio_managed = True

        mock_response = Mock(spec=auth_config_create_response.AuthConfigCreateResponse)
        mock_response.auth_config = mock_auth_config

        mock_client.auth_configs.create.return_value = mock_response

        options = {
            "type": "use_composio_managed_auth",
            "name": "My GitHub Config",
        }

        result = auth_configs.create("github", options)

        mock_client.auth_configs.create.assert_called_once()
        call_args = mock_client.auth_configs.create.call_args
        assert call_args.kwargs["toolkit"] == {"slug": "github"}
        assert call_args.kwargs["auth_config"] == options
        assert result == mock_auth_config

    def test_create_with_custom_auth_and_credentials(self, auth_configs, mock_client):
        """Test creating custom auth config with credentials."""
        mock_auth_config = Mock(spec=auth_config_create_response.AuthConfig)
        mock_auth_config.id = "auth_12345"
        mock_auth_config.auth_scheme = "OAUTH2"
        mock_auth_config.is_composio_managed = False

        mock_response = Mock(spec=auth_config_create_response.AuthConfigCreateResponse)
        mock_response.auth_config = mock_auth_config

        mock_client.auth_configs.create.return_value = mock_response

        options = {
            "type": "use_custom_auth",
            "name": "Custom GitHub Auth",
            "auth_scheme": "OAUTH2",
            "credentials": {
                "client_id": "test_client_id",
                "client_secret": "test_client_secret",
            },
        }

        result = auth_configs.create("github", options)

        mock_client.auth_configs.create.assert_called_once()
        call_args = mock_client.auth_configs.create.call_args
        assert call_args.kwargs["toolkit"] == {"slug": "github"}
        assert call_args.kwargs["auth_config"] == options
        assert result.is_composio_managed is False
        assert result.auth_scheme == "OAUTH2"

    def test_create_with_tool_access_config(self, auth_configs, mock_client):
        """Test creating auth config with tool access configuration."""
        mock_auth_config = Mock(spec=auth_config_create_response.AuthConfig)
        mock_auth_config.id = "auth_12345"

        mock_response = Mock(spec=auth_config_create_response.AuthConfigCreateResponse)
        mock_response.auth_config = mock_auth_config

        mock_client.auth_configs.create.return_value = mock_response

        options = {
            "type": "use_composio_managed_auth",
            "name": "Config with Tool Access",
            "tool_access_config": {
                "tools_for_connected_account_creation": ["GITHUB_CREATE_ISSUE"]
            },
        }

        result = auth_configs.create("github", options)

        mock_client.auth_configs.create.assert_called_once()
        assert result == mock_auth_config

    # Get tests
    def test_get_retrieves_auth_config_by_id(
        self, auth_configs, mock_client, mock_auth_config_response
    ):
        """Test retrieving auth config by ID."""
        mock_client.auth_configs.retrieve.return_value = mock_auth_config_response

        result = auth_configs.get("auth_12345")

        mock_client.auth_configs.retrieve.assert_called_once_with("auth_12345")
        assert result == mock_auth_config_response
        assert result.id == "auth_12345"
        assert result.name == "Test Auth Config"

    def test_get_handles_not_found_error(self, auth_configs, mock_client):
        """Test get handles API error when auth config not found."""
        mock_client.auth_configs.retrieve.side_effect = Exception(
            "Auth config not found"
        )

        with pytest.raises(Exception) as exc_info:
            auth_configs.get("nonexistent_auth")

        assert "Auth config not found" in str(exc_info.value)

    def test_get_with_is_enabled_for_tool_router_true(
        self, auth_configs, mock_client, mock_auth_config_response
    ):
        """Test retrieving auth config with isEnabledForToolRouter set to true."""
        mock_auth_config_response.is_enabled_for_tool_router = True
        mock_client.auth_configs.retrieve.return_value = mock_auth_config_response

        result = auth_configs.get("auth_12345")

        assert hasattr(result, "is_enabled_for_tool_router")
        assert result.is_enabled_for_tool_router is True

    def test_get_with_is_enabled_for_tool_router_false(
        self, auth_configs, mock_client, mock_auth_config_response
    ):
        """Test retrieving auth config with isEnabledForToolRouter set to false."""
        mock_auth_config_response.is_enabled_for_tool_router = False
        mock_client.auth_configs.retrieve.return_value = mock_auth_config_response

        result = auth_configs.get("auth_12345")

        assert hasattr(result, "is_enabled_for_tool_router")
        assert result.is_enabled_for_tool_router is False

    def test_get_with_is_enabled_for_tool_router_undefined(
        self, auth_configs, mock_client, mock_auth_config_response
    ):
        """Test retrieving auth config with isEnabledForToolRouter undefined."""
        # Don't set the attribute at all to simulate undefined
        if hasattr(mock_auth_config_response, "is_enabled_for_tool_router"):
            delattr(mock_auth_config_response, "is_enabled_for_tool_router")
        mock_client.auth_configs.retrieve.return_value = mock_auth_config_response

        result = auth_configs.get("auth_12345")

        # Should not have the attribute or it should be None
        assert (
            not hasattr(result, "is_enabled_for_tool_router")
            or result.is_enabled_for_tool_router is None
        )

    # Update tests
    def test_update_custom_auth_config_with_credentials(
        self, auth_configs, mock_client
    ):
        """Test updating custom auth config with credentials."""
        mock_response = {"id": "auth_12345", "status": "success"}
        mock_client.auth_configs.update.return_value = mock_response

        options = {
            "type": "custom",
            "credentials": {
                "client_id": "new_client_id",
                "client_secret": "new_client_secret",
            },
        }

        result = auth_configs.update("auth_12345", options=options)

        mock_client.auth_configs.update.assert_called_once()
        call_args = mock_client.auth_configs.update.call_args
        assert call_args.kwargs["nanoid"] == "auth_12345"
        assert call_args.kwargs["type"] == "custom"
        assert call_args.kwargs["credentials"] == options["credentials"]
        assert result == mock_response

    def test_update_default_auth_config_with_scopes(self, auth_configs, mock_client):
        """Test updating default auth config with scopes."""
        mock_response = {"id": "auth_12345", "status": "success"}
        mock_client.auth_configs.update.return_value = mock_response

        options = {
            "type": "default",
            "scopes": "read:user,repo",
        }

        result = auth_configs.update("auth_12345", options=options)

        mock_client.auth_configs.update.assert_called_once()
        # Check that scopes are not directly passed but other fields are
        call_args = mock_client.auth_configs.update.call_args
        assert call_args.kwargs["nanoid"] == "auth_12345"
        assert call_args.kwargs["type"] == "default"
        assert result == mock_response

    def test_update_with_is_enabled_for_tool_router(self, auth_configs, mock_client):
        """Test updating auth config with isEnabledForToolRouter."""
        mock_response = {"id": "auth_12345", "status": "success"}
        mock_client.auth_configs.update.return_value = mock_response

        options = {
            "type": "custom",
            "credentials": {"api_key": "new_key"},
            "is_enabled_for_tool_router": True,
        }

        result = auth_configs.update("auth_12345", options=options)

        call_args = mock_client.auth_configs.update.call_args
        assert call_args.kwargs["is_enabled_for_tool_router"] is True
        assert result == mock_response

    def test_update_with_tool_access_config(self, auth_configs, mock_client):
        """Test updating auth config with tool access configuration."""
        mock_response = {"id": "auth_12345", "status": "success"}
        mock_client.auth_configs.update.return_value = mock_response

        options = {
            "type": "custom",
            "credentials": {"api_key": "new_key"},
            "tool_access_config": {
                "tools_for_connected_account_creation": ["GITHUB_CREATE_ISSUE"]
            },
        }

        result = auth_configs.update("auth_12345", options=options)

        call_args = mock_client.auth_configs.update.call_args
        assert call_args.kwargs["tool_access_config"] == options["tool_access_config"]
        assert result == mock_response

    def test_update_with_large_credential_object(self, auth_configs, mock_client):
        """Test updating auth config with large credential object."""
        mock_response = {"id": "auth_12345", "status": "success"}
        mock_client.auth_configs.update.return_value = mock_response

        large_credentials = {
            "field1": "value1",
            "field2": "value2",
            "field3": {"nested": "object"},
            "field4": ["array", "values"],
            "field5": 12345,
            "field6": True,
        }

        options = {
            "type": "custom",
            "credentials": large_credentials,
        }

        result = auth_configs.update("auth_12345", options=options)

        call_args = mock_client.auth_configs.update.call_args
        assert call_args.kwargs["credentials"] == large_credentials
        assert result == mock_response

    def test_update_handles_api_error(self, auth_configs, mock_client):
        """Test update handles API errors."""
        mock_client.auth_configs.update.side_effect = Exception("Update failed")

        options = {
            "type": "custom",
            "credentials": {"api_key": "key"},
        }

        with pytest.raises(Exception) as exc_info:
            auth_configs.update("auth_12345", options=options)

        assert "Update failed" in str(exc_info.value)

    # Delete tests
    def test_delete_auth_config_by_id(self, auth_configs, mock_client):
        """Test deleting auth config by ID."""
        mock_response = {"id": "auth_12345", "status": "deleted"}
        mock_client.auth_configs.delete.return_value = mock_response

        result = auth_configs.delete("auth_12345")

        mock_client.auth_configs.delete.assert_called_once_with("auth_12345")
        assert result == mock_response

    def test_delete_handles_api_error(self, auth_configs, mock_client):
        """Test delete handles API errors."""
        mock_client.auth_configs.delete.side_effect = Exception("Delete failed")

        with pytest.raises(Exception) as exc_info:
            auth_configs.delete("auth_12345")

        assert "Delete failed" in str(exc_info.value)

    # Enable/Disable tests
    def test_enable_auth_config(self, auth_configs, mock_client):
        """Test enabling auth config."""
        mock_response = {"id": "auth_12345", "status": "ENABLED"}
        mock_client.auth_configs.update_status.return_value = mock_response

        result = auth_configs.enable("auth_12345")

        mock_client.auth_configs.update_status.assert_called_once_with(
            "ENABLED", nanoid="auth_12345"
        )
        assert result == mock_response

    def test_disable_auth_config(self, auth_configs, mock_client):
        """Test disabling auth config."""
        mock_response = {"id": "auth_12345", "status": "DISABLED"}
        mock_client.auth_configs.update_status.return_value = mock_response

        result = auth_configs.disable("auth_12345")

        mock_client.auth_configs.update_status.assert_called_once_with(
            "DISABLED", nanoid="auth_12345"
        )
        assert result == mock_response

    def test_enable_handles_api_error(self, auth_configs, mock_client):
        """Test enable handles API errors."""
        mock_client.auth_configs.update_status.side_effect = Exception("Enable failed")

        with pytest.raises(Exception) as exc_info:
            auth_configs.enable("auth_12345")

        assert "Enable failed" in str(exc_info.value)

    def test_disable_handles_api_error(self, auth_configs, mock_client):
        """Test disable handles API errors."""
        mock_client.auth_configs.update_status.side_effect = Exception("Disable failed")

        with pytest.raises(Exception) as exc_info:
            auth_configs.disable("auth_12345")

        assert "Disable failed" in str(exc_info.value)

    # Edge cases
    def test_update_with_missing_optional_fields(self, auth_configs, mock_client):
        """Test update works with only required fields."""
        mock_response = {"id": "auth_12345", "status": "success"}
        mock_client.auth_configs.update.return_value = mock_response

        options = {
            "type": "custom",
            "credentials": {"api_key": "key"},
        }

        result = auth_configs.update("auth_12345", options=options)

        call_args = mock_client.auth_configs.update.call_args
        # Verify that optional fields use the sentinel value
        assert call_args.kwargs["is_enabled_for_tool_router"] == mock_client.not_given
        assert call_args.kwargs["tool_access_config"] == mock_client.not_given
        assert result == mock_response

    def test_create_with_minimal_options(self, auth_configs, mock_client):
        """Test creating auth config with minimal options."""
        mock_auth_config = Mock(spec=auth_config_create_response.AuthConfig)
        mock_auth_config.id = "auth_12345"

        mock_response = Mock(spec=auth_config_create_response.AuthConfigCreateResponse)
        mock_response.auth_config = mock_auth_config

        mock_client.auth_configs.create.return_value = mock_response

        # Just the toolkit, using default type
        result = auth_configs.create("github", {"type": "use_composio_managed_auth"})

        mock_client.auth_configs.create.assert_called_once()
        assert result == mock_auth_config

    def test_list_with_pagination(self, auth_configs, mock_client):
        """Test listing auth configs with pagination."""
        mock_response = Mock(spec=auth_config_list_response.AuthConfigListResponse)
        mock_response.items = [Mock(), Mock(), Mock()]
        mock_response.next_cursor = "next_page_cursor"
        mock_response.total_pages = 5
        mock_client.auth_configs.list.return_value = mock_response

        result = auth_configs.list(cursor="current_cursor", limit=3)

        mock_client.auth_configs.list.assert_called_once()
        assert len(result.items) == 3
        assert result.next_cursor == "next_page_cursor"
        assert result.total_pages == 5

    def test_get_minimal_auth_config(self, auth_configs, mock_client):
        """Test retrieving auth config with minimal fields."""
        minimal_response = Mock(
            spec=auth_config_retrieve_response.AuthConfigRetrieveResponse
        )
        minimal_response.id = "auth_minimal"
        minimal_response.name = "Minimal Config"
        minimal_response.no_of_connections = 0
        minimal_response.status = "DISABLED"
        minimal_response.toolkit = Mock()
        minimal_response.toolkit.logo = ""
        minimal_response.toolkit.slug = "minimal-toolkit"
        minimal_response.uuid = "uuid-minimal"

        mock_client.auth_configs.retrieve.return_value = minimal_response

        result = auth_configs.get("auth_minimal")

        assert result.id == "auth_minimal"
        assert result.name == "Minimal Config"
        assert result.no_of_connections == 0
        assert result.status == "DISABLED"


class TestAuthConfigsOverloads:
    """Test type overloads for create and update methods."""

    @pytest.fixture
    def mock_client(self):
        """Create a mock client for testing."""
        client = Mock()
        client.auth_configs = Mock()
        client.auth_configs.create = Mock()
        client.auth_configs.update = Mock()
        client.not_given = object()
        return client

    @pytest.fixture
    def auth_configs(self, mock_client):
        """Create an AuthConfigs instance with mock client."""
        return AuthConfigs(client=mock_client)

    def test_create_overload_use_composio_managed_auth(self, auth_configs, mock_client):
        """Test create with use_composio_managed_auth type."""
        mock_auth_config = Mock(spec=auth_config_create_response.AuthConfig)
        mock_response = Mock(spec=auth_config_create_response.AuthConfigCreateResponse)
        mock_response.auth_config = mock_auth_config
        mock_client.auth_configs.create.return_value = mock_response

        options = {"type": "use_composio_managed_auth"}
        result = auth_configs.create("github", options)

        assert result == mock_auth_config

    def test_create_overload_use_custom_auth(self, auth_configs, mock_client):
        """Test create with use_custom_auth type."""
        mock_auth_config = Mock(spec=auth_config_create_response.AuthConfig)
        mock_response = Mock(spec=auth_config_create_response.AuthConfigCreateResponse)
        mock_response.auth_config = mock_auth_config
        mock_client.auth_configs.create.return_value = mock_response

        options = {
            "type": "use_custom_auth",
            "auth_scheme": "API_KEY",
            "credentials": {"api_key": "test_key"},
        }
        result = auth_configs.create("github", options)

        assert result == mock_auth_config

    def test_update_overload_custom_type(self, auth_configs, mock_client):
        """Test update with custom type."""
        mock_response = {"id": "auth_12345", "status": "success"}
        mock_client.auth_configs.update.return_value = mock_response

        options = {
            "type": "custom",
            "credentials": {"api_key": "new_key"},
        }
        result = auth_configs.update("auth_12345", options=options)

        assert result == mock_response

    def test_update_overload_default_type(self, auth_configs, mock_client):
        """Test update with default type."""
        mock_response = {"id": "auth_12345", "status": "success"}
        mock_client.auth_configs.update.return_value = mock_response

        options = {
            "type": "default",
            "scopes": "read:user",
        }
        result = auth_configs.update("auth_12345", options=options)

        assert result == mock_response
