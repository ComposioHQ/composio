"""Tests for auth configs management."""

from unittest.mock import Mock

import httpx
import pytest
from composio.client import HttpClient
from composio.client.types import (
    auth_config_create_response,
    auth_config_delete_response,
    auth_config_list_response,
    auth_config_retrieve_response,
    auth_config_update_response,
    auth_config_update_status_response,
)
from composio.core.models.auth_configs import AuthConfigs
from pydantic import BaseModel


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

    # Update tests
    def test_update_custom_auth_config_with_credentials(
        self, auth_configs, mock_client
    ):
        """Test updating custom auth config with credentials."""
        mock_response = auth_config_update_response.AuthConfigUpdateResponse(
            success=True, message="Successfully updated auth config"
        )
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

    def test_update_with_is_enabled_for_tool_router(self, auth_configs, mock_client):
        """Test updating auth config with isEnabledForToolRouter."""
        mock_response = auth_config_update_response.AuthConfigUpdateResponse(
            success=True, message="Successfully updated auth config"
        )
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
        mock_response = auth_config_update_response.AuthConfigUpdateResponse(
            success=True, message="Successfully updated auth config"
        )
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
        mock_response = auth_config_delete_response.AuthConfigDeleteResponse(
            success=True, message="Successfully deleted auth config"
        )
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
        mock_response = (
            auth_config_update_status_response.AuthConfigUpdateStatusResponse(
                success=True, message="Successfully updated auth config status"
            )
        )
        mock_client.auth_configs.update_status.return_value = mock_response

        result = auth_configs.enable("auth_12345")

        mock_client.auth_configs.update_status.assert_called_once_with(
            "ENABLED", nanoid="auth_12345"
        )
        assert result == mock_response

    def test_disable_auth_config(self, auth_configs, mock_client):
        """Test disabling auth config."""
        mock_response = (
            auth_config_update_status_response.AuthConfigUpdateStatusResponse(
                success=True, message="Successfully updated auth config status"
            )
        )
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
        mock_response = auth_config_update_response.AuthConfigUpdateResponse(
            success=True, message="Successfully updated auth config"
        )
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


@pytest.mark.parametrize(
    ("operation", "method", "path", "response_type"),
    [
        (
            "update_custom",
            "PATCH",
            "/api/v3.1/auth_configs/ac_test",
            auth_config_update_response.AuthConfigUpdateResponse,
        ),
        (
            "update_default",
            "PATCH",
            "/api/v3.1/auth_configs/ac_test",
            auth_config_update_response.AuthConfigUpdateResponse,
        ),
        (
            "delete",
            "DELETE",
            "/api/v3.1/auth_configs/ac_test",
            auth_config_delete_response.AuthConfigDeleteResponse,
        ),
        (
            "enable",
            "PATCH",
            "/api/v3.1/auth_configs/ac_test/ENABLED",
            auth_config_update_status_response.AuthConfigUpdateStatusResponse,
        ),
        (
            "disable",
            "PATCH",
            "/api/v3.1/auth_configs/ac_test/DISABLED",
            auth_config_update_status_response.AuthConfigUpdateStatusResponse,
        ),
    ],
)
def test_mutation_response_through_generated_client(
    operation, method, path, response_type
):
    """Parse HTTP through the real client instead of mocking its return value."""
    payload = {"success": True, "message": "Successfully updated auth config"}
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=payload)

    with HttpClient(
        provider="test",
        api_key="test",
        _environment_variables={},
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    ) as client:
        auth_configs = AuthConfigs(client)
        calls = {
            "update_custom": lambda: auth_configs.update(
                "ac_test",
                options={"type": "custom", "credentials": {"scopes": "read:user"}},
            ),
            "update_default": lambda: auth_configs.update(
                "ac_test",
                options={"type": "default", "is_enabled_for_tool_router": True},
            ),
            "delete": lambda: auth_configs.delete("ac_test"),
            "enable": lambda: auth_configs.enable("ac_test"),
            "disable": lambda: auth_configs.disable("ac_test"),
        }
        result = calls[operation]()

    assert len(requests) == 1
    assert requests[0].method == method
    assert requests[0].url.path == path
    assert isinstance(result, response_type)
    assert isinstance(result, BaseModel)
    assert result.success is True
    assert result.message == payload["message"]
    assert result.model_dump(exclude_unset=True) == payload
