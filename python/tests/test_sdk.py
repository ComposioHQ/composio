"""Test SDK functionality."""

import os
import typing as t
from unittest.mock import patch

import composio_client
import httpx
import pytest

from composio import Composio, exceptions
from composio.core.provider._openai import OpenAIProvider
from composio.core.types import ToolkitVersionParam


class TestComposioSDK:
    """Test cases for Composio SDK."""

    def test_sdk_requires_api_key(self):
        """Test that SDK requires an API key."""
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(exceptions.ApiKeyNotProvidedError):
                Composio()

    def test_sdk_accepts_api_key_from_env(self):
        """Test that SDK accepts API key from environment."""
        with patch.dict(os.environ, {"COMPOSIO_API_KEY": "test-key"}):
            with patch("composio.core.models.Tools"):
                with patch("composio.core.models.Toolkits"):
                    with patch("composio.core.models.Triggers"):
                        with patch("composio.core.models.AuthConfigs"):
                            with patch("composio.core.models.ConnectedAccounts"):
                                sdk = Composio()
                                assert sdk is not None

    def test_sdk_accepts_api_key_as_parameter(self):
        """Test that SDK accepts API key as parameter."""
        with patch("composio.core.models.Tools"):
            with patch("composio.core.models.Toolkits"):
                with patch("composio.core.models.Triggers"):
                    with patch("composio.core.models.AuthConfigs"):
                        with patch("composio.core.models.ConnectedAccounts"):
                            sdk = Composio(api_key="test-key")
                            assert sdk is not None

    def test_sdk_forwards_user_and_org_api_keys_to_client(self):
        """User and org keys reach the API client, which selects them per operation."""
        sdk = Composio(
            api_key="ak_test", user_api_key="uak_test", org_api_key="oak_test"
        )
        assert sdk.client.api_key == "ak_test"
        assert sdk.client.user_api_key == "uak_test"
        assert sdk.client.org_api_key == "oak_test"

    def test_sdk_reads_user_and_org_api_keys_from_env(self):
        """The client resolves COMPOSIO_USER_API_KEY / COMPOSIO_ORG_API_KEY itself."""
        with patch.dict(
            os.environ,
            {
                "COMPOSIO_API_KEY": "ak_env",
                "COMPOSIO_USER_API_KEY": "uak_env",
                "COMPOSIO_ORG_API_KEY": "oak_env",
            },
        ):
            sdk = Composio()
        assert sdk.client.user_api_key == "uak_env"
        assert sdk.client.org_api_key == "oak_env"

    def test_sdk_config_types(self):
        """Test SDK configuration types."""
        from composio.sdk import SDKConfig

        # Test that SDKConfig is a TypedDict
        assert hasattr(SDKConfig, "__annotations__")

        # Test that all expected fields are present
        expected_fields = {
            "environment",
            "api_key",
            "disable_api_key",
            "user_api_key",
            "org_api_key",
            "org_id",
            "project_id",
            "base_url",
            "timeout",
            "max_retries",
            "allow_tracking",
            "file_download_dir",
            "toolkit_versions",
            "dangerously_allow_auto_upload_download_files",
            "sensitive_file_upload_protection",
            "file_upload_path_deny_segments",
            "file_upload_dirs",
            "http_client",
            "logger",
            "logging_level",
        }
        assert set(SDKConfig.__annotations__.keys()) == expected_fields

    def test_toolkit_version_param_types(self):
        """Test toolkit version parameter types."""
        from composio.core.types import (
            ToolkitLatestVersion,
            ToolkitVersion,
            ToolkitVersions,
        )

        # Test that types are defined correctly
        assert ToolkitLatestVersion is not None
        assert ToolkitVersion is not None
        assert ToolkitVersions is not None
        assert ToolkitVersionParam is not None

    def test_sdk_mounts_webhooks_and_logs(self):
        from composio.core.models import Logs, Webhooks

        composio = Composio(api_key="test-key")

        assert isinstance(composio.webhooks, Webhooks)
        assert isinstance(composio.logs, Logs)
        assert composio.webhooks._client is composio._client
        assert composio.logs._client is composio._client

    def test_sdk_mounts_keyring_and_custom_toolkits(self):
        from composio.core.models import ExperimentalCustomToolkits, Keyring

        composio = Composio(api_key="test-key")

        assert isinstance(composio.keyring, Keyring)
        assert composio.keyring._client is composio._client
        assert isinstance(
            composio.experimental.custom_toolkits, ExperimentalCustomToolkits
        )
        assert composio.experimental.custom_toolkits._client is composio._client

    def test_sdk_has_required_attributes(self):
        """Test that SDK has required attributes after initialization."""
        with patch.dict(os.environ, {"COMPOSIO_API_KEY": "test-key"}):
            with patch("composio.core.models.Tools"):
                with patch("composio.core.models.Toolkits"):
                    with patch("composio.core.models.Triggers"):
                        with patch("composio.core.models.AuthConfigs"):
                            with patch("composio.core.models.ConnectedAccounts"):
                                sdk = Composio()

                                # Check that all required attributes are present
                                assert hasattr(sdk, "tools")
                                assert hasattr(sdk, "toolkits")
                                assert hasattr(sdk, "triggers")
                                assert hasattr(sdk, "auth_configs")
                                assert hasattr(sdk, "connected_accounts")
                                assert hasattr(sdk, "provider")
                                assert hasattr(sdk, "client")

    def test_sdk_default_provider(self):
        """Test that SDK uses default provider."""
        with patch.dict(os.environ, {"COMPOSIO_API_KEY": "test-key"}):
            with patch("composio.core.models.Tools"):
                with patch("composio.core.models.Toolkits"):
                    with patch("composio.core.models.Triggers"):
                        with patch("composio.core.models.AuthConfigs"):
                            with patch("composio.core.models.ConnectedAccounts"):
                                sdk = Composio()

                                # Check that provider is set
                                assert sdk.provider is not None
                                assert hasattr(sdk.provider, "name")

    def test_default_provider_is_isolated_per_instance(self):
        """Regression test for #4369.

        The default provider used to be a module-level singleton. Because every
        ``Tools`` instance rebinds ``provider.execute_tool`` to itself, the last
        constructed ``Composio()`` silently took over tool execution for every
        other instance, routing calls through the wrong API key.
        """
        sdk_a = Composio(api_key="key-a")
        sdk_b = Composio(api_key="key-b")

        assert isinstance(sdk_a.provider, OpenAIProvider)
        assert isinstance(sdk_b.provider, OpenAIProvider)
        assert sdk_a.provider is not sdk_b.provider

        # execute_tool is a functools.partial over Tools.execute; each provider
        # must stay bound to the Tools of the instance that created it.
        assert sdk_a.provider.execute_tool.func.__self__ is sdk_a.tools
        assert sdk_b.provider.execute_tool.func.__self__ is sdk_b.tools

    def test_explicit_provider_is_used_unchanged(self):
        """An explicitly passed provider instance is used as-is."""
        provider = OpenAIProvider()
        sdk = Composio(provider=provider, api_key="key-a")
        assert sdk.provider is provider

    def test_toolkit_versions_processing(self):
        """Test toolkit versions parameter processing."""
        with patch.dict(os.environ, {"COMPOSIO_API_KEY": "test-key"}):
            with patch("composio.core.models.Tools"):
                with patch("composio.core.models.Toolkits"):
                    with patch("composio.core.models.Triggers"):
                        with patch("composio.core.models.AuthConfigs"):
                            with patch("composio.core.models.ConnectedAccounts"):
                                with patch(
                                    "composio.sdk.get_toolkit_versions"
                                ) as mock_get_versions:
                                    mock_get_versions.return_value = "latest"

                                    # Test with string version
                                    Composio(toolkit_versions="v1.0.0")
                                    mock_get_versions.assert_called_once()

                                    # Reset mock for next test
                                    mock_get_versions.reset_mock()

                                    # Test with dict version
                                    versions_dict = {
                                        "github": "v1.0.0",
                                        "slack": "latest",
                                    }
                                    Composio(toolkit_versions=versions_dict)
                                    mock_get_versions.assert_called_once()

                                    # Reset mock for next test
                                    mock_get_versions.reset_mock()

                                    # Test with None (default)
                                    Composio()
                                    mock_get_versions.assert_called_once()

    def test_sdk_env_var_integration(self):
        """Test that SDK properly integrates with environment variables for toolkit versions."""
        with patch.dict(
            os.environ,
            {
                "COMPOSIO_API_KEY": "test-key",
                "COMPOSIO_TOOLKIT_VERSION_GITHUB": "v1.0.0",
                "COMPOSIO_TOOLKIT_VERSION_SLACK": "v2.0.0",
            },
        ):
            with patch("composio.sdk.Tools") as mock_tools_class:
                with patch("composio.sdk.Toolkits"):
                    with patch("composio.sdk.Triggers"):
                        with patch("composio.sdk.AuthConfigs"):
                            with patch("composio.sdk.ConnectedAccounts"):
                                # Create SDK instance without explicit toolkit versions
                                Composio()

                                # Verify that Tools was initialized with processed versions
                                mock_tools_class.assert_called_once()
                                call_args = mock_tools_class.call_args

                                # The toolkit_versions should be a dict from env vars
                                toolkit_versions = call_args.kwargs.get(
                                    "toolkit_versions"
                                )
                                expected = {"github": "v1.0.0", "slack": "v2.0.0"}
                                assert toolkit_versions == expected

    def test_sdk_user_override_env_vars(self):
        """Test that user-provided toolkit versions override environment variables."""
        with patch.dict(
            os.environ,
            {
                "COMPOSIO_API_KEY": "test-key",
                "COMPOSIO_TOOLKIT_VERSION_GITHUB": "env_version",
                "COMPOSIO_TOOLKIT_VERSION_SLACK": "env_slack",
            },
        ):
            with patch("composio.sdk.Tools") as mock_tools_class:
                with patch("composio.sdk.Toolkits"):
                    with patch("composio.sdk.Triggers"):
                        with patch("composio.sdk.AuthConfigs"):
                            with patch("composio.sdk.ConnectedAccounts"):
                                # User provides override
                                user_versions = {
                                    "github": "user_override",
                                    "jira": "user_jira",
                                }
                                Composio(toolkit_versions=user_versions)

                                # Verify Tools was initialized with merged versions
                                mock_tools_class.assert_called_once()
                                call_args = mock_tools_class.call_args

                                toolkit_versions = call_args.kwargs.get(
                                    "toolkit_versions"
                                )
                                expected = {
                                    "github": "user_override",  # User override
                                    "slack": "env_slack",  # From env
                                    "jira": "user_jira",  # User provided
                                }
                                assert toolkit_versions == expected


MCP_URL = "https://backend.composio.dev/api/v3/tool_router/session/session_123/mcp"


def _session_transport() -> t.Tuple[httpx.Client, t.List[httpx.Request]]:
    requests: t.List[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "session_id": "session_123",
                "mcp": {"type": "http", "url": MCP_URL},
                "config": {
                    "user_id": "user_123",
                    "execute": {},
                    "search": {},
                    "preload": {"tools": []},
                },
                "config_version": 3,
                "warnings": [],
            },
        )

    return httpx.Client(transport=httpx.MockTransport(handler)), requests


class TestUserOnlyInitialization:
    """``disable_api_key`` turns the project key off and keeps one credential."""

    def test_user_key_session_carries_only_the_user_key(self):
        http_client, requests = _session_transport()
        with patch.dict(os.environ, {"COMPOSIO_API_KEY": "ak_foreign_env_key"}):
            sdk = Composio(
                disable_api_key=True,
                user_api_key="uak_user_key",
                base_url="https://backend.composio.dev",
                http_client=http_client,
            )
            assert sdk.client.api_key is None
            session = sdk.sessions.create(user_id="user_123", mcp=True)

        assert "x-api-key" not in requests[0].headers
        assert requests[0].headers["x-user-api-key"] == "uak_user_key"
        assert "x-org-id" not in requests[0].headers
        assert "x-project-id" not in requests[0].headers
        assert session.mcp.headers == {"x-user-api-key": "uak_user_key"}

    def test_user_key_session_carries_the_org_and_project_scope(self):
        http_client, requests = _session_transport()
        with patch.dict(os.environ, {"COMPOSIO_API_KEY": "ak_foreign_env_key"}):
            sdk = Composio(
                disable_api_key=True,
                user_api_key="uak_user_key",
                org_id="org_nano_abc",
                project_id="proj_nano_xyz",
                base_url="https://backend.composio.dev",
                http_client=http_client,
            )
            session = sdk.sessions.create(user_id="user_123", mcp=True)

        assert "x-api-key" not in requests[0].headers
        assert requests[0].headers["x-user-api-key"] == "uak_user_key"
        assert requests[0].headers["x-org-id"] == "org_nano_abc"
        assert requests[0].headers["x-project-id"] == "proj_nano_xyz"
        assert session.mcp.headers == {
            "x-user-api-key": "uak_user_key",
            "x-org-id": "org_nano_abc",
            "x-project-id": "proj_nano_xyz",
        }

    def test_user_key_is_read_from_the_environment_when_disabled(self):
        with patch.dict(
            os.environ,
            {
                "COMPOSIO_API_KEY": "ak_foreign_env_key",
                "COMPOSIO_USER_API_KEY": "uak_env",
            },
        ):
            sdk = Composio(disable_api_key=True)

        assert sdk.client.api_key is None
        assert sdk.client.user_api_key == "uak_env"

    def test_disable_without_a_user_key_raises(self):
        with patch.dict(
            os.environ, {"COMPOSIO_API_KEY": "ak_foreign_env_key"}, clear=True
        ):
            with pytest.raises(exceptions.UserApiKeyNotProvidedError):
                Composio(disable_api_key=True)

    def test_disable_beside_an_explicit_project_key_raises(self):
        with pytest.raises(exceptions.InvalidParams):
            Composio(disable_api_key=True, api_key="ak_explicit", user_api_key="uak")

    def test_half_scope_raises(self):
        with pytest.raises(exceptions.InvalidParams):
            Composio(api_key="ak_test", org_id="org_nano_abc")
        with pytest.raises(exceptions.InvalidParams):
            Composio(api_key="ak_test", project_id="proj_nano_xyz")

    def test_empty_scope_id_counts_as_unset(self):
        with pytest.raises(exceptions.InvalidParams):
            Composio(api_key="ak_test", org_id="org_nano_abc", project_id="")
        with pytest.raises(exceptions.InvalidParams):
            Composio(api_key="ak_test", org_id="", project_id="proj_nano_xyz")

        sdk = Composio(api_key="ak_test", org_id="", project_id="")
        assert "x-org-id" not in sdk.client.default_headers
        assert "x-project-id" not in sdk.client.default_headers

    def test_omitted_api_key_keeps_the_environment_fallback(self):
        with patch.dict(os.environ, {"COMPOSIO_API_KEY": "ak_env"}):
            sdk = Composio(user_api_key="uak")
        assert sdk.client.api_key == "ak_env"

    def test_sync_and_async_owned_clients_agree_on_user_only_auth(self):
        with patch.dict(os.environ, {"COMPOSIO_API_KEY": "ak_foreign_env_key"}):
            sync_client = composio_client.Composio(
                disable_api_key=True, user_api_key="uak_user_key"
            )
            async_client = composio_client.AsyncComposio(
                disable_api_key=True, user_api_key="uak_user_key"
            )

        assert (sync_client.api_key, sync_client.user_api_key) == (None, "uak_user_key")
        assert (async_client.api_key, async_client.user_api_key) == (
            sync_client.api_key,
            sync_client.user_api_key,
        )
