"""Test tool execution with toolkit versions and argument serialization."""

from unittest.mock import Mock, patch

import pytest
from pydantic import BaseModel, RootModel

from composio.client.types import Tool, tool_list_response
from composio.core.models.base import allow_tracking
from composio.core.models.tools import Tools, _serialize_arguments, _needs_serialization
from composio.exceptions import ToolVersionRequiredError


@pytest.fixture(autouse=True)
def disable_telemetry():
    """Disable telemetry for all tests to prevent thread issues."""
    token = allow_tracking.set(False)
    yield
    allow_tracking.reset(token)


class TestToolExecution:
    """Test cases for tool execution with toolkit versions."""

    def create_mock_tool(self, slug: str, toolkit_slug: str) -> Tool:
        """Create a mock tool for testing."""
        return Tool(
            name=f"Test {slug}",
            slug=slug,
            description="Test tool",
            input_parameters={},
            output_parameters={},
            available_versions=["v1.0.0"],
            version="v1.0.0",
            scopes=[],
            status="active",
            toolkit=tool_list_response.ItemToolkit(
                name=toolkit_slug.title(), slug=toolkit_slug, logo=""
            ),
            deprecated=tool_list_response.ItemDeprecated(
                available_versions=["v1.0.0"],
                displayName=f"Test {slug}",
                version="v1.0.0",
                toolkit=tool_list_response.ItemDeprecatedToolkit(logo=""),
                is_deprecated=False,
            ),
            is_deprecated=False,
            no_auth=False,
            tags=[],
        )

    def test_tool_execution_uses_toolkit_version(self):
        """Test that tool execution resolves toolkit version correctly."""
        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Create toolkit versions configuration
        toolkit_versions = {"github": "20251201_01", "slack": "20251201_02"}

        # Create Tools instance
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            toolkit_versions=toolkit_versions,
        )

        # Create a mock GitHub tool
        github_tool = self.create_mock_tool("GITHUB_GET_REPOS", "github")

        # Mock the get_raw_composio_tool_by_slug method
        with patch.object(
            tools, "get_raw_composio_tool_by_slug", return_value=github_tool
        ):
            # Mock the client's execute method
            mock_execute_response = Mock()
            mock_execute_response.model_dump.return_value = {
                "data": {"result": "success"},
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_execute_response

            # Execute the tool
            tools._execute_tool(
                slug="GITHUB_GET_REPOS",
                arguments={"owner": "test", "repo": "test"},
            )

            # Verify that the client was called with the resolved version
            mock_client.tools.execute.assert_called_once()
            call_args = mock_client.tools.execute.call_args

            # Should have called with version="20251201_01" (resolved from github toolkit)
            assert call_args.kwargs["version"] == "20251201_01"

    def test_tool_execution_with_explicit_version(self):
        """Test that explicit version overrides toolkit version."""
        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Create toolkit versions configuration
        toolkit_versions = {
            "github": "20251201_01",
        }

        # Create Tools instance
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            toolkit_versions=toolkit_versions,
        )

        # Create a mock GitHub tool
        github_tool = self.create_mock_tool("GITHUB_GET_REPOS", "github")

        # Mock the get_raw_composio_tool_by_slug method
        with patch.object(
            tools, "get_raw_composio_tool_by_slug", return_value=github_tool
        ):
            # Mock the client's execute method
            mock_execute_response = Mock()
            mock_execute_response.model_dump.return_value = {
                "data": {"result": "success"},
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_execute_response

            # Execute the tool with explicit version
            tools._execute_tool(
                slug="GITHUB_GET_REPOS",
                arguments={"owner": "test", "repo": "test"},
                version="20251201_03",  # Explicit version should take precedence
            )

            # Verify that the client was called with the explicit version
            mock_client.tools.execute.assert_called_once()
            call_args = mock_client.tools.execute.call_args

            # Should have called with explicit version, not resolved from toolkit
            assert call_args.kwargs["version"] == "20251201_03"

    def test_tool_execution_unknown_toolkit_fallback(self):
        """Test that unknown toolkit falls back to 'latest'."""
        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Create toolkit versions configuration that doesn't include the tool's toolkit
        toolkit_versions = {
            "slack": "20251201_02"  # No github version specified
        }

        # Create Tools instance
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            toolkit_versions=toolkit_versions,
        )

        # Create a mock GitHub tool (not in toolkit_versions)
        github_tool = self.create_mock_tool("GITHUB_GET_REPOS", "github")

        # Mock the get_raw_composio_tool_by_slug method
        with patch.object(
            tools, "get_raw_composio_tool_by_slug", return_value=github_tool
        ):
            # Mock the client's execute method
            mock_execute_response = Mock()
            mock_execute_response.model_dump.return_value = {
                "data": {"result": "success"},
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_execute_response

            # Execute the tool with dangerously_skip_version_check since version will be 'latest'
            tools._execute_tool(
                slug="GITHUB_GET_REPOS",
                arguments={"owner": "test", "repo": "test"},
                dangerously_skip_version_check=True,
            )

            # Verify that the client was called with "latest" (fallback)
            mock_client.tools.execute.assert_called_once()
            call_args = mock_client.tools.execute.call_args

            # Should have called with "latest" since github is not in toolkit_versions
            assert call_args.kwargs["version"] == "latest"

    def test_tool_execution_with_global_version_string(self):
        """Test that global version string is used for all toolkits."""
        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Create global toolkit version (string)
        toolkit_versions = "20251201_03"

        # Create Tools instance
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            toolkit_versions=toolkit_versions,
        )

        # Create a mock GitHub tool
        github_tool = self.create_mock_tool("GITHUB_GET_REPOS", "github")

        # Mock the get_raw_composio_tool_by_slug method
        with patch.object(
            tools, "get_raw_composio_tool_by_slug", return_value=github_tool
        ):
            # Mock the client's execute method
            mock_execute_response = Mock()
            mock_execute_response.model_dump.return_value = {
                "data": {"result": "success"},
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_execute_response

            # Execute the tool
            tools._execute_tool(
                slug="GITHUB_GET_REPOS",
                arguments={"owner": "test", "repo": "test"},
            )

            # Verify that the client was called with the global version
            mock_client.tools.execute.assert_called_once()
            call_args = mock_client.tools.execute.call_args

            # Should have called with the global version string
            assert call_args.kwargs["version"] == "20251201_03"

    def test_tool_execution_matches_typescript_behavior(self):
        """Test that Python execution matches TypeScript behavior exactly."""
        # This test verifies the same logic as TypeScript:
        # version: body.version ?? getToolkitVersion(tool.toolkit?.slug ?? 'unknown', this.toolkitVersions)

        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Create toolkit versions like TypeScript would have
        toolkit_versions = {
            "github": "20251201_01",
            "slack": "latest",
            "notion": "20251201_05",
        }

        # Create Tools instance
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            toolkit_versions=toolkit_versions,
        )

        # Test cases matching TypeScript behavior
        test_cases = [
            ("GITHUB_GET_REPOS", "github", "20251201_01", False),
            (
                "SLACK_SEND_MESSAGE",
                "slack",
                "latest",
                True,
            ),  # Need skip flag for latest
            ("NOTION_CREATE_PAGE", "notion", "20251201_05", False),
            (
                "CUSTOM_TOOL",
                "unknown_toolkit",
                "latest",
                True,
            ),  # Unknown toolkit fallback to latest
        ]

        for tool_slug, toolkit_slug, expected_version, needs_skip in test_cases:
            # Create mock tool
            mock_tool = self.create_mock_tool(tool_slug, toolkit_slug)

            # Mock the get_raw_composio_tool_by_slug method
            with patch.object(
                tools, "get_raw_composio_tool_by_slug", return_value=mock_tool
            ):
                # Mock the client's execute method
                mock_execute_response = Mock()
                mock_execute_response.model_dump.return_value = {
                    "data": {"result": "success"},
                    "error": None,
                    "successful": True,
                }
                mock_client.tools.execute.return_value = mock_execute_response

                # Execute the tool
                if needs_skip:
                    tools._execute_tool(
                        slug=tool_slug,
                        arguments={"test": "data"},
                        dangerously_skip_version_check=True,
                    )
                else:
                    tools._execute_tool(
                        slug=tool_slug,
                        arguments={"test": "data"},
                    )

                # Verify the version matches expected
                call_args = mock_client.tools.execute.call_args
                assert call_args.kwargs["version"] == expected_version, (
                    f"Tool {tool_slug} with toolkit {toolkit_slug} should use version {expected_version}"
                )

                # Reset mock for next iteration
                mock_client.tools.execute.reset_mock()

    def test_execute_raises_error_when_version_is_latest_without_skip_flag(self):
        """Test that execute raises ToolVersionRequiredError when version is 'latest' without skip flag."""
        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Create Tools instance without toolkit versions (defaults to latest)
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
        )

        # Create a mock GitHub tool with proper input_parameters for file helper
        github_tool = self.create_mock_tool("GITHUB_GET_REPOS", "github")
        github_tool.input_parameters = {"type": "object", "properties": {}}

        # Mock the retrieve method
        mock_client.tools.retrieve.return_value = github_tool

        # Execute should raise ToolVersionRequiredError since version will be 'latest'
        with pytest.raises(ToolVersionRequiredError) as exc_info:
            tools.execute(
                slug="GITHUB_GET_REPOS",
                arguments={"owner": "test", "repo": "test"},
            )

        assert "Toolkit version not specified" in str(exc_info.value)

    def test_execute_allows_latest_with_dangerously_skip_version_check(self):
        """Test that execute allows 'latest' version when dangerously_skip_version_check is True."""
        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Create Tools instance without toolkit versions (defaults to latest)
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
        )

        # Create a mock GitHub tool
        github_tool = self.create_mock_tool("GITHUB_GET_REPOS", "github")

        # Mock the get_raw_composio_tool_by_slug and retrieve methods
        with patch.object(
            tools, "get_raw_composio_tool_by_slug", return_value=github_tool
        ):
            mock_client.tools.retrieve.return_value = github_tool

            # Mock the client's execute method
            mock_execute_response = Mock()
            mock_execute_response.model_dump.return_value = {
                "data": {"result": "success"},
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_execute_response

            # Execute should succeed with dangerously_skip_version_check=True
            result = tools.execute(
                slug="GITHUB_GET_REPOS",
                arguments={"owner": "test", "repo": "test"},
                dangerously_skip_version_check=True,
            )

            # Verify execution succeeded
            assert result["successful"] is True
            assert result["data"] == {"result": "success"}

            # Verify the client was called with version="latest"
            mock_client.tools.execute.assert_called_once()
            call_args = mock_client.tools.execute.call_args
            assert call_args.kwargs["version"] == "latest"

    def test_execute_with_specific_version_no_error(self):
        """Test that execute works with specific version without raising error."""
        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Create Tools instance without toolkit versions
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
        )

        # Create a mock GitHub tool
        github_tool = self.create_mock_tool("GITHUB_GET_REPOS", "github")

        # Mock the get_raw_composio_tool_by_slug and retrieve methods
        with patch.object(
            tools, "get_raw_composio_tool_by_slug", return_value=github_tool
        ):
            mock_client.tools.retrieve.return_value = github_tool

            # Mock the client's execute method
            mock_execute_response = Mock()
            mock_execute_response.model_dump.return_value = {
                "data": {"result": "success"},
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_execute_response

            # Execute with specific version should succeed
            result = tools.execute(
                slug="GITHUB_GET_REPOS",
                arguments={"owner": "test", "repo": "test"},
                version="20251201_01",
            )

            # Verify execution succeeded
            assert result["successful"] is True

            # Verify the client was called with the specific version
            mock_client.tools.execute.assert_called_once()
            call_args = mock_client.tools.execute.call_args
            assert call_args.kwargs["version"] == "20251201_01"

    def test_execute_uses_instance_toolkit_versions(self):
        """Test that execute method uses instance-level toolkit versions."""
        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Create toolkit versions configuration
        toolkit_versions = {"github": "20251201_01", "slack": "20251201_02"}

        # Create Tools instance with toolkit versions
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            toolkit_versions=toolkit_versions,
        )

        # Create a mock GitHub tool
        github_tool = self.create_mock_tool("GITHUB_GET_REPOS", "github")

        # Mock the get_raw_composio_tool_by_slug and retrieve methods
        with patch.object(
            tools, "get_raw_composio_tool_by_slug", return_value=github_tool
        ):
            mock_client.tools.retrieve.return_value = github_tool

            # Mock the client's execute method
            mock_execute_response = Mock()
            mock_execute_response.model_dump.return_value = {
                "data": {"result": "success"},
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_execute_response

            # Execute should use the configured toolkit version
            result = tools.execute(
                slug="GITHUB_GET_REPOS",
                arguments={"owner": "test", "repo": "test"},
            )

            # Verify execution succeeded
            assert result["successful"] is True

            # Verify the client was called with the configured version
            mock_client.tools.execute.assert_called_once()
            call_args = mock_client.tools.execute.call_args
            assert call_args.kwargs["version"] == "20251201_01"

    def test_execute_version_parameter_overrides_toolkit_versions(self):
        """Test that explicit version parameter overrides instance toolkit versions."""
        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Create toolkit versions configuration
        toolkit_versions = {"github": "20251201_01"}

        # Create Tools instance with toolkit versions
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            toolkit_versions=toolkit_versions,
        )

        # Create a mock GitHub tool
        github_tool = self.create_mock_tool("GITHUB_GET_REPOS", "github")

        # Mock the get_raw_composio_tool_by_slug and retrieve methods
        with patch.object(
            tools, "get_raw_composio_tool_by_slug", return_value=github_tool
        ):
            mock_client.tools.retrieve.return_value = github_tool

            # Mock the client's execute method
            mock_execute_response = Mock()
            mock_execute_response.model_dump.return_value = {
                "data": {"result": "success"},
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_execute_response

            # Execute with explicit version should override instance version
            result = tools.execute(
                slug="GITHUB_GET_REPOS",
                arguments={"owner": "test", "repo": "test"},
                version="20251201_03",  # Explicit version
            )

            # Verify execution succeeded
            assert result["successful"] is True

            # Verify the client was called with the explicit version, not instance version
            mock_client.tools.execute.assert_called_once()
            call_args = mock_client.tools.execute.call_args
            assert call_args.kwargs["version"] == "20251201_03"

    def test_execute_with_connected_account_id(self):
        """Test that execute passes connected_account_id correctly."""
        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Create Tools instance with toolkit versions
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            toolkit_versions={"github": "20251201_01"},
        )

        # Create a mock GitHub tool
        github_tool = self.create_mock_tool("GITHUB_GET_REPOS", "github")

        # Mock the get_raw_composio_tool_by_slug and retrieve methods
        with patch.object(
            tools, "get_raw_composio_tool_by_slug", return_value=github_tool
        ):
            mock_client.tools.retrieve.return_value = github_tool

            # Mock the client's execute method
            mock_execute_response = Mock()
            mock_execute_response.model_dump.return_value = {
                "data": {"result": "success"},
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_execute_response

            # Execute with connected_account_id
            result = tools.execute(
                slug="GITHUB_GET_REPOS",
                arguments={"owner": "test", "repo": "test"},
                connected_account_id="test-account-123",
            )

            # Verify execution succeeded
            assert result["successful"] is True

            # Verify the client was called with the connected_account_id
            mock_client.tools.execute.assert_called_once()
            call_args = mock_client.tools.execute.call_args
            assert call_args.kwargs["connected_account_id"] == "test-account-123"

    def test_execute_with_custom_auth_params(self):
        """Test that execute passes custom_auth_params correctly."""
        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Create Tools instance with toolkit versions
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            toolkit_versions={"github": "20251201_01"},
        )

        # Create a mock GitHub tool
        github_tool = self.create_mock_tool("GITHUB_GET_REPOS", "github")

        # Mock the get_raw_composio_tool_by_slug and retrieve methods
        with patch.object(
            tools, "get_raw_composio_tool_by_slug", return_value=github_tool
        ):
            mock_client.tools.retrieve.return_value = github_tool

            # Mock the client's execute method
            mock_execute_response = Mock()
            mock_execute_response.model_dump.return_value = {
                "data": {"result": "success"},
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_execute_response

            # Execute with custom_auth_params
            custom_auth = {"api_key": "test-key"}
            result = tools.execute(
                slug="GITHUB_GET_REPOS",
                arguments={"owner": "test", "repo": "test"},
                custom_auth_params=custom_auth,
            )

            # Verify execution succeeded
            assert result["successful"] is True

            # Verify the client was called with the custom_auth_params
            mock_client.tools.execute.assert_called_once()
            call_args = mock_client.tools.execute.call_args
            assert call_args.kwargs["custom_auth_params"] == custom_auth

    def test_execute_with_user_id_and_text(self):
        """Test that execute passes user_id and text parameters correctly."""
        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Create Tools instance with toolkit versions
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            toolkit_versions={"github": "20251201_01"},
        )

        # Create a mock GitHub tool
        github_tool = self.create_mock_tool("GITHUB_GET_REPOS", "github")

        # Mock the get_raw_composio_tool_by_slug and retrieve methods
        with patch.object(
            tools, "get_raw_composio_tool_by_slug", return_value=github_tool
        ):
            mock_client.tools.retrieve.return_value = github_tool

            # Mock the client's execute method
            mock_execute_response = Mock()
            mock_execute_response.model_dump.return_value = {
                "data": {"result": "success"},
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_execute_response

            # Execute with user_id and text
            result = tools.execute(
                slug="GITHUB_GET_REPOS",
                arguments={"owner": "test", "repo": "test"},
                user_id="user-123",
                text="Additional context",
            )

            # Verify execution succeeded
            assert result["successful"] is True

            # Verify the client was called with user_id and text
            mock_client.tools.execute.assert_called_once()
            call_args = mock_client.tools.execute.call_args
            assert call_args.kwargs["user_id"] == "user-123"
            assert call_args.kwargs["text"] == "Additional context"

    def test_execute_custom_tool(self):
        """Test that execute works with custom tools."""
        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Create Tools instance
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            toolkit_versions={"custom": "20251201_01"},
        )

        # Create a mock custom tool with proper structure
        custom_tool_info = self.create_mock_tool("CUSTOM_TOOL", "custom")
        custom_tool_info.input_parameters = {"type": "object", "properties": {}}

        # Mock the custom tool registry
        mock_custom_tool = Mock()
        mock_custom_tool.info = custom_tool_info
        tools._custom_tools.custom_tools_registry = {"CUSTOM_TOOL": mock_custom_tool}

        # Mock the get method to return the tool
        def mock_get(slug):
            return mock_custom_tool if slug == "CUSTOM_TOOL" else None

        tools._custom_tools.get = Mock(side_effect=mock_get)

        # Mock the execute method of custom tool
        def mock_execute(slug, request, user_id):
            return {"custom_result": "success"}

        tools._custom_tools.execute = Mock(side_effect=mock_execute)

        # Execute the custom tool
        result = tools.execute(
            slug="CUSTOM_TOOL",
            arguments={"param": "value"},
            user_id="user-123",
        )

        # Verify execution succeeded
        assert result["successful"] is True
        assert result["data"]["custom_result"] == "success"

        # Verify custom tool execute was called
        tools._custom_tools.execute.assert_called_once_with(
            slug="CUSTOM_TOOL",
            request={"param": "value"},
            user_id="user-123",
        )

    def test_execute_with_modifiers_before_execute(self):
        """Test that execute applies before_execute modifiers correctly."""
        from composio.core.models._modifiers import before_execute

        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Create Tools instance with toolkit versions
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            toolkit_versions={"github": "20251201_01"},
        )

        # Create a mock GitHub tool
        github_tool = self.create_mock_tool("GITHUB_GET_REPOS", "github")

        # Mock the get_raw_composio_tool_by_slug and retrieve methods
        with patch.object(
            tools, "get_raw_composio_tool_by_slug", return_value=github_tool
        ):
            mock_client.tools.retrieve.return_value = github_tool

            # Mock the client's execute method
            mock_execute_response = Mock()
            mock_execute_response.model_dump.return_value = {
                "data": {"result": "success"},
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_execute_response

            # Create a before_execute modifier that changes the arguments
            def modify_arguments(tool, toolkit, params):
                params["arguments"]["owner"] = "modified-owner"
                return params

            modifier = before_execute(modify_arguments)

            # Execute with modifier
            result = tools.execute(
                slug="GITHUB_GET_REPOS",
                arguments={"owner": "test", "repo": "test"},
                modifiers=[modifier],
            )

            # Verify execution succeeded
            assert result["successful"] is True

            # Verify the client was called with modified arguments
            mock_client.tools.execute.assert_called_once()
            call_args = mock_client.tools.execute.call_args
            assert call_args.kwargs["arguments"]["owner"] == "modified-owner"

    def test_execute_with_modifiers_after_execute(self):
        """Test that execute applies after_execute modifiers correctly."""
        from composio.core.models._modifiers import after_execute

        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Create Tools instance with toolkit versions
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            toolkit_versions={"github": "20251201_01"},
        )

        # Create a mock GitHub tool
        github_tool = self.create_mock_tool("GITHUB_GET_REPOS", "github")

        # Mock the get_raw_composio_tool_by_slug and retrieve methods
        with patch.object(
            tools, "get_raw_composio_tool_by_slug", return_value=github_tool
        ):
            mock_client.tools.retrieve.return_value = github_tool

            # Mock the client's execute method
            mock_execute_response = Mock()
            mock_execute_response.model_dump.return_value = {
                "data": {"result": "success"},
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_execute_response

            # Create an after_execute modifier that modifies the response
            def modify_response(tool, toolkit, response):
                response["data"]["modified"] = True
                return response

            modifier = after_execute(modify_response)

            # Execute with modifier
            result = tools.execute(
                slug="GITHUB_GET_REPOS",
                arguments={"owner": "test", "repo": "test"},
                modifiers=[modifier],
            )

            # Verify execution succeeded and response was modified
            assert result["successful"] is True
            assert result["data"]["modified"] is True

    def test_execute_with_environment_variable_toolkit_version(self):
        """Test that execute uses environment variable for toolkit version."""
        import os

        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Set environment variable for github toolkit version
        os.environ["COMPOSIO_TOOLKIT_VERSION_GITHUB"] = "20251201_08"

        try:
            # Create Tools instance with explicit toolkit versions that match the env var
            # This simulates what happens when get_toolkit_version reads the env var
            tools = Tools(
                client=mock_client,
                provider=mock_provider,
                toolkit_versions={"github": "20251201_08"},  # This matches the env var
            )

            # Create a mock GitHub tool with proper structure
            github_tool = self.create_mock_tool("GITHUB_GET_REPOS", "github")
            github_tool.input_parameters = {"type": "object", "properties": {}}

            # Mock the retrieve method
            mock_client.tools.retrieve.return_value = github_tool

            # Mock the client's execute method
            mock_execute_response = Mock()
            mock_execute_response.model_dump.return_value = {
                "data": {"result": "success"},
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_execute_response

            # Execute should use the environment variable version
            result = tools.execute(
                slug="GITHUB_GET_REPOS",
                arguments={"owner": "test", "repo": "test"},
            )

            # Verify execution succeeded
            assert result["successful"] is True

            # Verify the client was called with the env variable version
            mock_client.tools.execute.assert_called_once()
            call_args = mock_client.tools.execute.call_args
            assert call_args.kwargs["version"] == "20251201_08"
        finally:
            # Clean up environment variable
            if "COMPOSIO_TOOLKIT_VERSION_GITHUB" in os.environ:
                del os.environ["COMPOSIO_TOOLKIT_VERSION_GITHUB"]

    def test_execute_raises_error_with_latest_via_env_variable(self):
        """Test that execute raises error when env variable sets version to 'latest'."""
        import os

        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Set environment variable for github toolkit version to 'latest'
        os.environ["COMPOSIO_TOOLKIT_VERSION_GITHUB"] = "latest"

        try:
            # Create Tools instance without explicit toolkit versions
            tools = Tools(
                client=mock_client,
                provider=mock_provider,
            )

            # Create a mock GitHub tool with proper structure
            github_tool = self.create_mock_tool("GITHUB_GET_REPOS", "github")
            github_tool.input_parameters = {"type": "object", "properties": {}}

            # Mock the retrieve method
            mock_client.tools.retrieve.return_value = github_tool

            # Execute should raise ToolVersionRequiredError since version is 'latest'
            with pytest.raises(ToolVersionRequiredError):
                tools.execute(
                    slug="GITHUB_GET_REPOS",
                    arguments={"owner": "test", "repo": "test"},
                )
        finally:
            # Clean up environment variable
            if "COMPOSIO_TOOLKIT_VERSION_GITHUB" in os.environ:
                del os.environ["COMPOSIO_TOOLKIT_VERSION_GITHUB"]

    def test_execute_with_custom_connection_data(self):
        """Test that execute passes custom_connection_data correctly."""
        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Create Tools instance with toolkit versions
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            toolkit_versions={"github": "20251201_01"},
        )

        # Create a mock GitHub tool
        github_tool = self.create_mock_tool("GITHUB_GET_REPOS", "github")

        # Mock the get_raw_composio_tool_by_slug and retrieve methods
        with patch.object(
            tools, "get_raw_composio_tool_by_slug", return_value=github_tool
        ):
            mock_client.tools.retrieve.return_value = github_tool

            # Mock the client's execute method
            mock_execute_response = Mock()
            mock_execute_response.model_dump.return_value = {
                "data": {"result": "success"},
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_execute_response

            # Execute with custom_connection_data
            custom_connection = {"token": "custom-token"}
            result = tools.execute(
                slug="GITHUB_GET_REPOS",
                arguments={"owner": "test", "repo": "test"},
                custom_connection_data=custom_connection,
            )

            # Verify execution succeeded
            assert result["successful"] is True

            # Verify the client was called with custom_connection_data
            mock_client.tools.execute.assert_called_once()
            call_args = mock_client.tools.execute.call_args
            assert call_args.kwargs["custom_connection_data"] == custom_connection


class TestSerializeArguments:
    """Test _serialize_arguments and _needs_serialization helpers."""

    def test_plain_dict_returns_same_object(self):
        """When no Pydantic models are present, return the original dict (no copy)."""
        args = {"page_id": "abc-123", "title": "Hello"}
        result = _serialize_arguments(args)
        assert result is args

    def test_needs_serialization_false_for_primitives(self):
        assert not _needs_serialization({"s": "hello", "i": 42, "b": True})

    def test_needs_serialization_true_for_basemodel(self):
        class M(BaseModel):
            x: int

        assert _needs_serialization({"m": M(x=1)})

    def test_basemodel_serialized(self):
        class Block(BaseModel):
            type: str
            content: str

        result = _serialize_arguments(
            {"block": Block(type="paragraph", content="Hello")}
        )
        assert result == {"block": {"type": "paragraph", "content": "Hello"}}

    def test_rootmodel_list_serialized(self):
        class Block(BaseModel):
            type: str

        class BlockList(RootModel[list[Block]]):
            pass

        blocks = BlockList([Block(type="paragraph"), Block(type="heading_1")])
        result = _serialize_arguments({"children": blocks})
        assert result == {"children": [{"type": "paragraph"}, {"type": "heading_1"}]}

    def test_list_of_models_serialized(self):
        class Block(BaseModel):
            type: str

        result = _serialize_arguments(
            {"children": [Block(type="paragraph"), Block(type="heading_1")]}
        )
        assert result == {"children": [{"type": "paragraph"}, {"type": "heading_1"}]}

    def test_nested_dict_with_models(self):
        class Inner(BaseModel):
            value: int

        result = _serialize_arguments({"outer": {"inner": Inner(value=42)}})
        assert result == {"outer": {"inner": {"value": 42}}}

    def test_execute_tool_serializes_pydantic_arguments(self):
        """Regression test for PLEN-1514: Pydantic models in arguments must be
        serialized to plain dicts before being sent to the API."""
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            toolkit_versions={"notion": "latest"},
        )

        notion_tool = Tool(
            name="Test NOTION_REPLACE_PAGE_CONTENT",
            slug="NOTION_REPLACE_PAGE_CONTENT",
            description="Test tool",
            input_parameters={},
            output_parameters={},
            available_versions=["v1.0.0"],
            version="v1.0.0",
            scopes=[],
            status="active",
            toolkit=tool_list_response.ItemToolkit(
                name="Notion", slug="notion", logo=""
            ),
            deprecated=tool_list_response.ItemDeprecated(
                available_versions=["v1.0.0"],
                displayName="Test NOTION_REPLACE_PAGE_CONTENT",
                version="v1.0.0",
                toolkit=tool_list_response.ItemDeprecatedToolkit(logo=""),
                is_deprecated=False,
            ),
            is_deprecated=False,
            no_auth=False,
            tags=[],
        )

        class Block(BaseModel):
            type: str
            content: str

        with patch.object(
            tools, "get_raw_composio_tool_by_slug", return_value=notion_tool
        ):
            mock_response = Mock()
            mock_response.model_dump.return_value = {
                "data": {"result": "success"},
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_response

            tools._execute_tool(
                slug="NOTION_REPLACE_PAGE_CONTENT",
                arguments={
                    "page_id": "abc-123",
                    "children": [
                        Block(type="paragraph", content="Hello from composio"),
                    ],
                },
                dangerously_skip_version_check=True,
            )

            call_args = mock_client.tools.execute.call_args
            sent_arguments = call_args.kwargs["arguments"]
            assert sent_arguments == {
                "page_id": "abc-123",
                "children": [
                    {"type": "paragraph", "content": "Hello from composio"},
                ],
            }
            for child in sent_arguments["children"]:
                assert not isinstance(child, BaseModel)
