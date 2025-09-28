"""Test SDK functionality."""

import os
from unittest.mock import patch

import pytest

from composio import Composio, exceptions
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

    def test_sdk_config_types(self):
        """Test SDK configuration types."""
        from composio.sdk import SDKConfig

        # Test that SDKConfig is a TypedDict
        assert hasattr(SDKConfig, "__annotations__")

        # Test that all expected fields are present
        expected_fields = {
            "environment",
            "api_key",
            "base_url",
            "timeout",
            "max_retries",
            "allow_tracking",
            "file_download_dir",
            "toolkit_versions",
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
