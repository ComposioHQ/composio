"""Test tool execution with toolkit versions."""

from unittest.mock import Mock, patch

from composio.client.types import Tool, tool_list_response
from composio.core.models.tools import Tools


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
        toolkit_versions = {"github": "v2.0.0", "slack": "v1.5.0"}

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
                toolkit_versions=toolkit_versions,
            )

            # Verify that the client was called with the resolved version
            mock_client.tools.execute.assert_called_once()
            call_args = mock_client.tools.execute.call_args

            # Should have called with version="v2.0.0" (resolved from github toolkit)
            assert call_args.kwargs["version"] == "v2.0.0"

    def test_tool_execution_with_explicit_version(self):
        """Test that explicit version overrides toolkit version."""
        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Create toolkit versions configuration
        toolkit_versions = {
            "github": "v2.0.0",
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
                version="v3.0.0",  # Explicit version should take precedence
                toolkit_versions=toolkit_versions,
            )

            # Verify that the client was called with the explicit version
            mock_client.tools.execute.assert_called_once()
            call_args = mock_client.tools.execute.call_args

            # Should have called with explicit version, not resolved from toolkit
            assert call_args.kwargs["version"] == "v3.0.0"

    def test_tool_execution_unknown_toolkit_fallback(self):
        """Test that unknown toolkit falls back to 'latest'."""
        # Mock client and provider
        mock_client = Mock()
        mock_provider = Mock()
        mock_provider.name = "test_provider"

        # Create toolkit versions configuration that doesn't include the tool's toolkit
        toolkit_versions = {
            "slack": "v1.5.0"  # No github version specified
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

            # Execute the tool
            tools._execute_tool(
                slug="GITHUB_GET_REPOS",
                arguments={"owner": "test", "repo": "test"},
                toolkit_versions=toolkit_versions,
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
        toolkit_versions = "v3.0.0"

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
                toolkit_versions=toolkit_versions,
            )

            # Verify that the client was called with the global version
            mock_client.tools.execute.assert_called_once()
            call_args = mock_client.tools.execute.call_args

            # Should have called with the global version string
            assert call_args.kwargs["version"] == "v3.0.0"

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
            "github": "20250906_01",
            "slack": "latest",
            "notion": "20250901_05",
        }

        # Create Tools instance
        tools = Tools(
            client=mock_client,
            provider=mock_provider,
            toolkit_versions=toolkit_versions,
        )

        # Test cases matching TypeScript behavior
        test_cases = [
            ("GITHUB_GET_REPOS", "github", "20250906_01"),
            ("SLACK_SEND_MESSAGE", "slack", "latest"),
            ("NOTION_CREATE_PAGE", "notion", "20250901_05"),
            ("CUSTOM_TOOL", "unknown_toolkit", "latest"),  # Unknown toolkit fallback
        ]

        for tool_slug, toolkit_slug, expected_version in test_cases:
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
                tools._execute_tool(
                    slug=tool_slug,
                    arguments={"test": "data"},
                    toolkit_versions=toolkit_versions,
                )

                # Verify the version matches expected
                call_args = mock_client.tools.execute.call_args
                assert call_args.kwargs["version"] == expected_version, (
                    f"Tool {tool_slug} with toolkit {toolkit_slug} should use version {expected_version}"
                )

                # Reset mock for next iteration
                mock_client.tools.execute.reset_mock()
