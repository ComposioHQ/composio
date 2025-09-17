"""Test toolkit version utilities."""

import pytest

from composio.core.types import ToolkitVersionParam
from composio.utils.toolkit_version import get_toolkit_version, get_toolkit_versions


class TestToolkitVersion:
    """Test cases for toolkit version utilities."""

    def test_get_toolkit_version_with_string(self):
        """Test get_toolkit_version with string parameter."""
        result = get_toolkit_version("github", "v1.0.0")
        assert result == "v1.0.0"

    def test_get_toolkit_version_with_dict(self):
        """Test get_toolkit_version with dict parameter."""
        versions = {"github": "v1.0.0", "slack": "v2.0.0"}
        result = get_toolkit_version("github", versions)
        assert result == "v1.0.0"

    def test_get_toolkit_version_with_dict_missing_key(self):
        """Test get_toolkit_version with dict parameter missing key."""
        versions = {"slack": "v2.0.0"}
        result = get_toolkit_version("github", versions)
        assert result == "latest"

    def test_get_toolkit_version_with_none(self):
        """Test get_toolkit_version with None parameter."""
        result = get_toolkit_version("github", None)
        assert result == "latest"

    def test_get_toolkit_version_with_env_var(self):
        """Test get_toolkit_version with environment variable."""
        with pytest.MonkeyPatch().context():
            # The function doesn't directly use COMPOSIO_TOOLKIT_VERSION env var
            # It only looks at the toolkit_versions parameter
            result = get_toolkit_version("github", None)
            assert result == "latest"

    def test_get_toolkit_versions_with_string(self):
        """Test get_toolkit_versions with string parameter."""
        result = get_toolkit_versions("v1.0.0")
        assert result == "v1.0.0"

    def test_get_toolkit_versions_with_dict(self):
        """Test get_toolkit_versions with dict parameter."""
        versions = {"github": "v1.0.0", "slack": "v2.0.0"}
        result = get_toolkit_versions(versions)
        assert result == versions

    def test_get_toolkit_versions_with_none(self):
        """Test get_toolkit_versions with None parameter."""
        result = get_toolkit_versions(None)
        assert result == "latest"

    def test_get_toolkit_versions_with_env_toolkit_specific(self):
        """Test get_toolkit_versions with toolkit-specific environment variables."""
        with pytest.MonkeyPatch().context() as m:
            m.setenv("COMPOSIO_TOOLKIT_VERSION_GITHUB", "v2.0.0")
            m.setenv("COMPOSIO_TOOLKIT_VERSION_SLACK", "v1.5.0")
            result = get_toolkit_versions(None)
            expected = {"github": "v2.0.0", "slack": "v1.5.0"}
            assert result == expected

    def test_get_toolkit_versions_env_and_user_override(self):
        """Test that user-provided versions override environment variables."""
        with pytest.MonkeyPatch().context() as m:
            # Set environment variables
            m.setenv("COMPOSIO_TOOLKIT_VERSION_GITHUB", "v1.0.0")
            m.setenv("COMPOSIO_TOOLKIT_VERSION_SLACK", "v2.0.0")

            # User overrides should take precedence
            user_versions = {"github": "v3.0.0", "jira": "v4.0.0"}
            result = get_toolkit_versions(user_versions)

            expected = {
                "github": "v3.0.0",  # User override
                "slack": "v2.0.0",  # From env
                "jira": "v4.0.0",  # User provided
            }
            assert result == expected

    def test_get_toolkit_version_with_env_specific_toolkit(self):
        """Test get_toolkit_version works with environment-configured versions."""
        with pytest.MonkeyPatch().context() as m:
            m.setenv("COMPOSIO_TOOLKIT_VERSION_GITHUB", "v2.5.0")
            m.setenv("COMPOSIO_TOOLKIT_VERSION_SLACK", "v1.8.0")

            # Get versions from environment
            env_versions = get_toolkit_versions(None)

            # Test specific toolkit version retrieval
            github_version = get_toolkit_version("github", env_versions)
            slack_version = get_toolkit_version("slack", env_versions)
            unknown_version = get_toolkit_version("unknown", env_versions)

            assert github_version == "v2.5.0"
            assert slack_version == "v1.8.0"
            assert unknown_version == "latest"

    def test_mixed_case_env_vars_normalized(self):
        """Test that mixed case environment variable names are normalized."""
        with pytest.MonkeyPatch().context() as m:
            # Environment variables are typically uppercase
            m.setenv("COMPOSIO_TOOLKIT_VERSION_GITHUB", "v1.0.0")
            m.setenv("COMPOSIO_TOOLKIT_VERSION_OPENAI", "v2.0.0")

            result = get_toolkit_versions(None)

            # Should be normalized to lowercase
            assert "github" in result
            assert "openai" in result
            assert result["github"] == "v1.0.0"
            assert result["openai"] == "v2.0.0"

    def test_user_dict_case_normalization(self):
        """Test that user-provided dictionary keys are normalized to lowercase."""
        user_versions = {"GitHub": "v1.0.0", "SLACK": "v2.0.0", "OpenAI": "v3.0.0"}

        result = get_toolkit_versions(user_versions)

        expected = {"github": "v1.0.0", "slack": "v2.0.0", "openai": "v3.0.0"}
        assert result == expected

    def test_priority_order_matches_typescript(self):
        """Test that priority order matches TypeScript implementation.

        Priority order should be:
        1. String global version (overrides everything)
        2. User-provided dict overrides env vars
        3. Environment variables
        4. Fallback to 'latest'
        """
        with pytest.MonkeyPatch().context() as m:
            # Test 1: String global version overrides everything
            m.setenv("COMPOSIO_TOOLKIT_VERSION_GITHUB", "env_version")
            result = get_toolkit_versions("global_version")
            assert result == "global_version"

            # Test 2: User dict overrides env vars
            m.setenv("COMPOSIO_TOOLKIT_VERSION_GITHUB", "env_version")
            m.setenv("COMPOSIO_TOOLKIT_VERSION_SLACK", "env_slack")
            user_dict = {"github": "user_override"}
            result = get_toolkit_versions(user_dict)
            expected = {
                "github": "user_override",  # User override
                "slack": "env_slack",  # From env
            }
            assert result == expected

            # Test 3: Environment variables when no user input
            result = get_toolkit_versions(None)
            expected = {"github": "env_version", "slack": "env_slack"}
            assert result == expected

    def test_empty_user_dict_uses_env_vars(self):
        """Test that empty user dict still uses environment variables."""
        with pytest.MonkeyPatch().context() as m:
            m.setenv("COMPOSIO_TOOLKIT_VERSION_GITHUB", "v1.0.0")

            # Empty dict should still use env vars
            result = get_toolkit_versions({})
            expected = {"github": "v1.0.0"}
            assert result == expected

    def test_toolkit_version_param_type_annotation(self):
        """Test ToolkitVersionParam type annotation."""
        import typing

        # Test that ToolkitVersionParam is a Union type
        assert hasattr(ToolkitVersionParam, "__origin__")
        assert ToolkitVersionParam.__origin__ is typing.Union
