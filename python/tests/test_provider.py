"""Test provider functionality.

This test module verifies provider functionality including:
- Provider initialization
- execute_tool function setup and usage
- Provider helper methods
- Both agentic and non-agentic provider behavior
"""

from unittest.mock import Mock

import pytest

from composio.client.types import Tool, tool_list_response
from composio.core.models.base import allow_tracking
from composio.core.models.tools import Tools
from composio.core.provider import AgenticProvider, NonAgenticProvider


@pytest.fixture(autouse=True)
def disable_telemetry():
    """Disable telemetry for all tests to prevent thread issues."""
    token = allow_tracking.set(False)
    yield
    allow_tracking.reset(token)


def create_mock_tool(
    slug: str, toolkit_slug: str, version: str = "12012025_00"
) -> Tool:
    """Create a mock tool for testing."""
    return Tool(
        name=f"Test {slug}",
        slug=slug,
        description="Test tool for provider testing",
        input_parameters={"type": "object", "properties": {}},
        output_parameters={},
        available_versions=[version],
        version=version,
        scopes=[],
        toolkit=tool_list_response.ItemToolkit(
            name=toolkit_slug.title(), slug=toolkit_slug, logo=""
        ),
        deprecated=tool_list_response.ItemDeprecated(
            available_versions=[version],
            displayName=f"Test {slug}",
            version=version,
            toolkit=tool_list_response.ItemDeprecatedToolkit(logo=""),
            is_deprecated=False,
        ),
        is_deprecated=False,
        no_auth=False,
        tags=[],
    )


class TestProviderInitialization:
    """Test cases for provider initialization."""

    def test_non_agentic_provider_initialization(self):
        """Test that non-agentic providers initialize correctly."""
        from composio.core.provider._openai import OpenAIProvider

        provider = OpenAIProvider()

        assert provider is not None
        assert provider.name == "openai"
        assert isinstance(provider, NonAgenticProvider)

    def test_agentic_provider_initialization(self):
        """Test that agentic providers initialize correctly."""

        class TestAgenticProvider(AgenticProvider, name="test_agentic"):
            def wrap_tool(self, tool, execute_tool):
                return {"slug": tool.slug, "execute": execute_tool}

            def wrap_tools(self, tools, execute_tool):
                return [self.wrap_tool(tool, execute_tool) for tool in tools]

        provider = TestAgenticProvider()

        assert provider is not None
        assert provider.name == "test_agentic"
        assert isinstance(provider, AgenticProvider)

    def test_provider_has_name_attribute(self):
        """Test that all providers have a name attribute."""
        from composio.core.provider._openai import OpenAIProvider

        provider = OpenAIProvider()
        assert hasattr(provider, "name")
        assert isinstance(provider.name, str)
        assert len(provider.name) > 0


class TestProviderExecuteToolSetup:
    """Test cases for execute_tool setup during initialization."""

    def test_execute_tool_set_during_tools_initialization_non_agentic(self):
        """Test that execute_tool is set during Tools initialization for non-agentic providers."""
        mock_client = Mock()
        from composio.core.provider._openai import OpenAIProvider

        provider = OpenAIProvider()

        # Create Tools instance
        Tools(
            client=mock_client,
            provider=provider,
            toolkit_versions={"github": "12012025_00"},
        )

        # After initialization, provider should have execute_tool
        assert hasattr(provider, "execute_tool")
        assert provider.execute_tool is not None
        assert callable(provider.execute_tool)

    def test_execute_tool_set_during_tools_initialization_agentic(self):
        """Test that execute_tool is set during Tools initialization for agentic providers."""
        mock_client = Mock()

        class TestAgenticProvider(AgenticProvider, name="test_agentic"):
            def wrap_tool(self, tool, execute_tool):
                return {"slug": tool.slug, "execute": execute_tool}

            def wrap_tools(self, tools, execute_tool):
                return [self.wrap_tool(tool, execute_tool) for tool in tools]

        provider = TestAgenticProvider()

        # Create Tools instance
        Tools(
            client=mock_client,
            provider=provider,
            toolkit_versions={"github": "12012025_00"},
        )

        # After initialization, provider should have execute_tool
        assert hasattr(provider, "execute_tool")
        assert provider.execute_tool is not None
        assert callable(provider.execute_tool)

    def test_execute_tool_available_immediately_after_initialization(self):
        """Test that execute_tool is available immediately after initialization, before get() is called."""
        mock_client = Mock()
        from composio.core.provider._openai import OpenAIProvider

        provider = OpenAIProvider()

        # Create Tools instance (but don't call get())
        Tools(
            client=mock_client,
            provider=provider,
            toolkit_versions={"github": "12012025_00"},
        )

        # execute_tool should be available immediately
        assert hasattr(provider, "execute_tool")
        assert callable(provider.execute_tool)

    def test_execute_tool_signature_matches_protocol(self):
        """Test that execute_tool has the correct signature matching ExecuteToolFn protocol."""
        mock_client = Mock()
        from composio.core.provider._openai import OpenAIProvider

        provider = OpenAIProvider()

        Tools(
            client=mock_client,
            provider=provider,
            toolkit_versions={"github": "12012025_00"},
        )

        # Verify it's callable
        assert callable(provider.execute_tool)

        # Try calling it with the protocol signature
        github_tool = create_mock_tool("GITHUB_STAR_REPO", "github", "12012025_00")
        mock_client.tools.retrieve.return_value = github_tool

        mock_execute_response = Mock()
        mock_execute_response.model_dump.return_value = {
            "data": {"success": True},
            "error": None,
            "successful": True,
        }
        mock_client.tools.execute.return_value = mock_execute_response

        # Should accept slug, arguments, and keyword-only modifiers/user_id
        result = provider.execute_tool(
            slug="GITHUB_STAR_REPO",
            arguments={"repo": "composio/composio"},
            modifiers=None,
            user_id="test-user",
        )

        assert result["successful"] is True


class TestProviderExecuteToolFunctionality:
    """Test cases for execute_tool functionality."""

    def test_execute_tool_executes_composio_tool(self):
        """Test that provider.execute_tool executes Composio tools correctly."""
        mock_client = Mock()
        from composio.core.provider._openai import OpenAIProvider

        provider = OpenAIProvider()

        Tools(
            client=mock_client,
            provider=provider,
            toolkit_versions={"github": "12012025_00"},
        )

        github_tool = create_mock_tool("GITHUB_STAR_REPO", "github", "12012025_00")
        mock_client.tools.retrieve.return_value = github_tool

        mock_execute_response = Mock()
        mock_execute_response.model_dump.return_value = {
            "data": {"starred": True, "repo": "composio/composio"},
            "error": None,
            "successful": True,
        }
        mock_client.tools.execute.return_value = mock_execute_response

        result = provider.execute_tool(
            slug="GITHUB_STAR_REPO",
            arguments={"repo": "composio/composio"},
        )

        assert result["successful"] is True
        assert result["data"]["starred"] is True
        assert result["data"]["repo"] == "composio/composio"
        mock_client.tools.execute.assert_called_once()

    def test_execute_tool_uses_dangerously_skip_version_check(self):
        """Test that execute_tool automatically sets dangerously_skip_version_check=True."""
        mock_client = Mock()
        from composio.core.provider._openai import OpenAIProvider

        provider = OpenAIProvider()

        # Create Tools without explicit toolkit versions (defaults to 'latest')
        Tools(
            client=mock_client,
            provider=provider,
        )

        github_tool = create_mock_tool("GITHUB_STAR_REPO", "github", "latest")
        mock_client.tools.retrieve.return_value = github_tool

        mock_execute_response = Mock()
        mock_execute_response.model_dump.return_value = {
            "data": {"starred": True},
            "error": None,
            "successful": True,
        }
        mock_client.tools.execute.return_value = mock_execute_response

        # Should NOT raise ToolVersionRequiredError even with 'latest'
        # because dangerously_skip_version_check=True is set automatically
        result = provider.execute_tool(
            slug="GITHUB_STAR_REPO",
            arguments={"repo": "composio/composio"},
        )

        assert result["successful"] is True

    def test_execute_tool_passes_user_id(self):
        """Test that execute_tool correctly passes user_id parameter."""
        mock_client = Mock()
        from composio.core.provider._openai import OpenAIProvider

        provider = OpenAIProvider()

        Tools(
            client=mock_client,
            provider=provider,
            toolkit_versions={"github": "12012025_00"},
        )

        github_tool = create_mock_tool("GITHUB_STAR_REPO", "github", "12012025_00")
        mock_client.tools.retrieve.return_value = github_tool

        mock_execute_response = Mock()
        mock_execute_response.model_dump.return_value = {
            "data": {"success": True},
            "error": None,
            "successful": True,
        }
        mock_client.tools.execute.return_value = mock_execute_response

        result = provider.execute_tool(
            slug="GITHUB_STAR_REPO",
            arguments={"repo": "composio/composio"},
            user_id="user-123",
        )

        assert result["successful"] is True

        call_args = mock_client.tools.execute.call_args
        assert call_args.kwargs["user_id"] == "user-123"

    def test_execute_tool_passes_modifiers(self):
        """Test that execute_tool correctly passes modifiers."""
        from composio.core.models._modifiers import before_execute

        mock_client = Mock()
        from composio.core.provider._openai import OpenAIProvider

        provider = OpenAIProvider()

        Tools(
            client=mock_client,
            provider=provider,
            toolkit_versions={"github": "12012025_00"},
        )

        github_tool = create_mock_tool("GITHUB_STAR_REPO", "github", "12012025_00")
        mock_client.tools.retrieve.return_value = github_tool

        mock_execute_response = Mock()
        mock_execute_response.model_dump.return_value = {
            "data": {"success": True},
            "error": None,
            "successful": True,
        }
        mock_client.tools.execute.return_value = mock_execute_response

        def modify_arguments(tool, toolkit, params):
            params["arguments"]["modified"] = True
            return params

        modifier = before_execute(modify_arguments)

        result = provider.execute_tool(
            slug="GITHUB_STAR_REPO",
            arguments={"repo": "composio/composio"},
            modifiers=[modifier],
        )

        assert result["successful"] is True

        call_args = mock_client.tools.execute.call_args
        assert call_args.kwargs["arguments"]["modified"] is True

    def test_execute_tool_with_toolkit_versions(self):
        """Test that execute_tool uses configured toolkit versions."""
        mock_client = Mock()
        from composio.core.provider._openai import OpenAIProvider

        provider = OpenAIProvider()

        Tools(
            client=mock_client,
            provider=provider,
            toolkit_versions={"github": "12012025_00", "slack": "12012025_01"},
        )

        github_tool = create_mock_tool("GITHUB_STAR_REPO", "github", "12012025_00")
        mock_client.tools.retrieve.return_value = github_tool

        mock_execute_response = Mock()
        mock_execute_response.model_dump.return_value = {
            "data": {"success": True},
            "error": None,
            "successful": True,
        }
        mock_client.tools.execute.return_value = mock_execute_response

        result = provider.execute_tool(
            slug="GITHUB_STAR_REPO",
            arguments={"repo": "composio/composio"},
        )

        assert result["successful"] is True

        call_args = mock_client.tools.execute.call_args
        assert call_args.kwargs["version"] == "12012025_00"


class TestNonAgenticProviderHelperMethods:
    """Test cases for non-agentic provider helper methods."""

    def test_openai_provider_execute_tool_call(self):
        """Test that OpenAIProvider.execute_tool_call uses provider.execute_tool."""
        from openai.types.chat.chat_completion_message_tool_call import (
            ChatCompletionMessageToolCall,
            Function,
        )

        mock_client = Mock()
        from composio.core.provider._openai import OpenAIProvider

        provider = OpenAIProvider()

        Tools(
            client=mock_client,
            provider=provider,
            toolkit_versions={"github": "12012025_00"},
        )

        github_tool = create_mock_tool("GITHUB_STAR_REPO", "github", "12012025_00")
        mock_client.tools.retrieve.return_value = github_tool

        mock_execute_response = Mock()
        mock_execute_response.model_dump.return_value = {
            "data": {"starred": True},
            "error": None,
            "successful": True,
        }
        mock_client.tools.execute.return_value = mock_execute_response

        tool_call = ChatCompletionMessageToolCall(
            id="call_123",
            function=Function(
                name="GITHUB_STAR_REPO",
                arguments='{"repo": "composio/composio"}',
            ),
            type="function",
        )

        result = provider.execute_tool_call(
            user_id="test-user",
            tool_call=tool_call,
        )

        assert result["successful"] is True
        assert result["data"]["starred"] is True

    def test_openai_provider_handle_tool_calls(self):
        """Test that OpenAIProvider.handle_tool_calls processes multiple tool calls."""
        from openai.types.chat import ChatCompletion
        from openai.types.chat.chat_completion import Choice
        from openai.types.chat.chat_completion_message import ChatCompletionMessage
        from openai.types.chat.chat_completion_message_tool_call import (
            ChatCompletionMessageToolCall,
            Function,
        )

        mock_client = Mock()
        from composio.core.provider._openai import OpenAIProvider

        provider = OpenAIProvider()

        Tools(
            client=mock_client,
            provider=provider,
            toolkit_versions={"github": "12012025_00"},
        )

        github_tool = create_mock_tool("GITHUB_STAR_REPO", "github", "12012025_00")
        mock_client.tools.retrieve.return_value = github_tool

        mock_execute_response = Mock()
        mock_execute_response.model_dump.return_value = {
            "data": {"starred": True},
            "error": None,
            "successful": True,
        }
        mock_client.tools.execute.return_value = mock_execute_response

        tool_call = ChatCompletionMessageToolCall(
            id="call_123",
            function=Function(
                name="GITHUB_STAR_REPO",
                arguments='{"repo": "composio/composio"}',
            ),
            type="function",
        )

        message = ChatCompletionMessage(
            role="assistant",
            content=None,
            tool_calls=[tool_call],
        )

        choice = Choice(
            finish_reason="tool_calls",
            index=0,
            message=message,
        )

        completion = ChatCompletion(
            id="chatcmpl-123",
            choices=[choice],
            created=1234567890,
            model="gpt-4",
            object="chat.completion",
        )

        results = provider.handle_tool_calls(
            user_id="test-user",
            response=completion,
        )

        assert len(results) == 1
        assert results[0]["successful"] is True
        assert results[0]["data"]["starred"] is True

    def test_openai_provider_wrap_tools(self):
        """Test that OpenAIProvider.wrap_tools creates proper tool definitions."""
        from composio.core.provider._openai import OpenAIProvider

        provider = OpenAIProvider()

        tools_list = [
            create_mock_tool("GITHUB_STAR_REPO", "github", "12012025_00"),
            create_mock_tool("SLACK_SEND_MESSAGE", "slack", "12012025_01"),
        ]

        wrapped = provider.wrap_tools(tools_list)

        assert len(wrapped) == 2
        assert all(tool["type"] == "function" for tool in wrapped)
        assert wrapped[0]["function"]["name"] == "GITHUB_STAR_REPO"
        assert wrapped[1]["function"]["name"] == "SLACK_SEND_MESSAGE"


class TestAgenticProviderFunctionality:
    """Test cases for agentic providers."""

    def test_agentic_provider_has_execute_tool_after_initialization(self):
        """Test that agentic providers have execute_tool after Tools initialization."""
        mock_client = Mock()

        class TestAgenticProvider(AgenticProvider, name="test_agentic"):
            def wrap_tool(self, tool, execute_tool):
                return {"slug": tool.slug, "execute": execute_tool}

            def wrap_tools(self, tools, execute_tool):
                return [self.wrap_tool(tool, execute_tool) for tool in tools]

        provider = TestAgenticProvider()

        Tools(
            client=mock_client,
            provider=provider,
            toolkit_versions={"github": "12012025_00"},
        )

        assert hasattr(provider, "execute_tool")
        assert callable(provider.execute_tool)

    def test_agentic_provider_execute_tool_works(self):
        """Test that agentic provider's execute_tool executes tools correctly."""
        mock_client = Mock()

        class TestAgenticProvider(AgenticProvider, name="test_agentic"):
            def wrap_tool(self, tool, execute_tool):
                return {"slug": tool.slug, "execute": execute_tool}

            def wrap_tools(self, tools, execute_tool):
                return [self.wrap_tool(tool, execute_tool) for tool in tools]

        provider = TestAgenticProvider()

        Tools(
            client=mock_client,
            provider=provider,
            toolkit_versions={"github": "12012025_00"},
        )

        github_tool = create_mock_tool("GITHUB_STAR_REPO", "github", "12012025_00")
        mock_client.tools.retrieve.return_value = github_tool

        mock_execute_response = Mock()
        mock_execute_response.model_dump.return_value = {
            "data": {"starred": True},
            "error": None,
            "successful": True,
        }
        mock_client.tools.execute.return_value = mock_execute_response

        result = provider.execute_tool(
            slug="GITHUB_STAR_REPO",
            arguments={"repo": "composio/composio"},
        )

        assert result["successful"] is True
        assert result["data"]["starred"] is True

    def test_agentic_provider_wrapped_tools_receive_execute_function(self):
        """Test that wrapped tools from agentic providers receive the execute function."""
        mock_client = Mock()

        class TestAgenticProvider(AgenticProvider, name="test_agentic"):
            def wrap_tool(self, tool, execute_tool):
                return {
                    "name": tool.slug,
                    "description": tool.description,
                    "executor": execute_tool,
                }

            def wrap_tools(self, tools, execute_tool):
                return [self.wrap_tool(tool, execute_tool) for tool in tools]

        provider = TestAgenticProvider()

        tools = Tools(
            client=mock_client,
            provider=provider,
            toolkit_versions={"github": "12012025_00"},
        )

        github_tool = create_mock_tool("GITHUB_STAR_REPO", "github", "12012025_00")
        mock_client.tools.retrieve.return_value = github_tool

        mock_list_response = Mock()
        mock_list_response.items = [github_tool]
        mock_client.tools.list.return_value = mock_list_response

        mock_execute_response = Mock()
        mock_execute_response.model_dump.return_value = {
            "data": {"starred": True},
            "error": None,
            "successful": True,
        }
        mock_client.tools.execute.return_value = mock_execute_response

        wrapped_tools = tools.get(
            user_id="test-user",
            slug="GITHUB_STAR_REPO",
        )

        assert len(wrapped_tools) == 1
        wrapped_tool = wrapped_tools[0]
        assert "executor" in wrapped_tool
        assert callable(wrapped_tool["executor"])

        # Call the executor
        result = wrapped_tool["executor"](
            slug="GITHUB_STAR_REPO",
            arguments={"repo": "composio/composio"},
        )

        assert result["successful"] is True
        assert result["data"]["starred"] is True

    def test_agentic_provider_wrap_tools_receives_execute_function(self):
        """Test that wrap_tools method receives the execute_tool function."""
        mock_client = Mock()

        class TestAgenticProvider(AgenticProvider, name="test_agentic"):
            def wrap_tool(self, tool, execute_tool):
                return {"slug": tool.slug, "has_executor": callable(execute_tool)}

            def wrap_tools(self, tools, execute_tool):
                # Verify execute_tool is callable
                assert callable(execute_tool)
                return [self.wrap_tool(tool, execute_tool) for tool in tools]

        provider = TestAgenticProvider()

        tools = Tools(
            client=mock_client,
            provider=provider,
            toolkit_versions={"github": "12012025_00"},
        )

        github_tool = create_mock_tool("GITHUB_STAR_REPO", "github", "12012025_00")

        mock_list_response = Mock()
        mock_list_response.items = [github_tool]
        mock_client.tools.list.return_value = mock_list_response

        wrapped = tools.get(user_id="test-user", slug="GITHUB_STAR_REPO")

        assert len(wrapped) == 1
        assert wrapped[0]["has_executor"] is True


class TestProviderEdgeCases:
    """Test edge cases and error handling for providers."""

    def test_execute_tool_with_custom_tool(self):
        """Test that execute_tool works with custom tools."""
        mock_client = Mock()
        from composio.core.provider._openai import OpenAIProvider

        provider = OpenAIProvider()

        tools = Tools(
            client=mock_client,
            provider=provider,
            toolkit_versions={"custom": "12012025_00"},
        )

        custom_tool = create_mock_tool("CUSTOM_TOOL", "custom", "12012025_00")

        mock_custom_tool = Mock()
        mock_custom_tool.info = custom_tool

        def mock_get(slug):
            return mock_custom_tool if slug == "CUSTOM_TOOL" else None

        tools._custom_tools.get = Mock(side_effect=mock_get)

        def mock_execute(slug, request, user_id):
            return {"custom_result": "success", "slug": slug}

        tools._custom_tools.execute = Mock(side_effect=mock_execute)

        result = provider.execute_tool(
            slug="CUSTOM_TOOL",
            arguments={"param": "value"},
            user_id="test-user",
        )

        assert result["successful"] is True
        assert result["data"]["custom_result"] == "success"

    def test_execute_tool_with_none_parameters(self):
        """Test that execute_tool works when optional parameters are None."""
        mock_client = Mock()
        from composio.core.provider._openai import OpenAIProvider

        provider = OpenAIProvider()

        Tools(
            client=mock_client,
            provider=provider,
            toolkit_versions={"github": "12012025_00"},
        )

        github_tool = create_mock_tool("GITHUB_STAR_REPO", "github", "12012025_00")
        mock_client.tools.retrieve.return_value = github_tool

        mock_execute_response = Mock()
        mock_execute_response.model_dump.return_value = {
            "data": {"success": True},
            "error": None,
            "successful": True,
        }
        mock_client.tools.execute.return_value = mock_execute_response

        result = provider.execute_tool(
            slug="GITHUB_STAR_REPO",
            arguments={"repo": "composio/composio"},
            modifiers=None,
            user_id=None,
        )

        assert result["successful"] is True

    def test_execute_tool_with_multiple_toolkit_versions(self):
        """Test execute_tool with multiple configured toolkit versions."""
        mock_client = Mock()
        from composio.core.provider._openai import OpenAIProvider

        provider = OpenAIProvider()

        toolkit_versions = {
            "github": "12012025_00",
            "slack": "12012025_01",
            "notion": "12012025_02",
        }

        Tools(
            client=mock_client,
            provider=provider,
            toolkit_versions=toolkit_versions,
        )

        # Test each toolkit uses its configured version
        for toolkit, version in toolkit_versions.items():
            tool = create_mock_tool(f"{toolkit.upper()}_TEST", toolkit, version)
            mock_client.tools.retrieve.return_value = tool

            mock_execute_response = Mock()
            mock_execute_response.model_dump.return_value = {
                "data": {"success": True},
                "error": None,
                "successful": True,
            }
            mock_client.tools.execute.return_value = mock_execute_response

            result = provider.execute_tool(
                slug=f"{toolkit.upper()}_TEST",
                arguments={"test": "data"},
            )

            assert result["successful"] is True

            call_args = mock_client.tools.execute.call_args
            assert call_args.kwargs["version"] == version


class TestProviderIntegration:
    """Integration tests for provider functionality."""

    def test_provider_workflow_non_agentic(self):
        """Test complete workflow with non-agentic provider."""
        mock_client = Mock()
        from composio.core.provider._openai import OpenAIProvider

        provider = OpenAIProvider()

        # Initialize Tools
        tools = Tools(
            client=mock_client,
            provider=provider,
            toolkit_versions={"github": "12012025_00"},
        )

        # Verify provider has execute_tool
        assert hasattr(provider, "execute_tool")

        # Mock tool and response
        github_tool = create_mock_tool("GITHUB_STAR_REPO", "github", "12012025_00")
        mock_client.tools.retrieve.return_value = github_tool

        mock_list_response = Mock()
        mock_list_response.items = [github_tool]
        mock_client.tools.list.return_value = mock_list_response

        mock_execute_response = Mock()
        mock_execute_response.model_dump.return_value = {
            "data": {"starred": True},
            "error": None,
            "successful": True,
        }
        mock_client.tools.execute.return_value = mock_execute_response

        # Get wrapped tools
        wrapped_tools = tools.get(user_id="test-user", slug="GITHUB_STAR_REPO")

        # Verify wrapped tools are in OpenAI format
        assert len(wrapped_tools) == 1
        wrapped_tool = wrapped_tools[0]
        assert wrapped_tool["type"] == "function"
        assert wrapped_tool["function"]["name"] == "GITHUB_STAR_REPO"

        # Execute tool directly via provider
        result = provider.execute_tool(
            slug="GITHUB_STAR_REPO",
            arguments={"repo": "composio/composio"},
            user_id="test-user",
        )

        assert result["successful"] is True
        assert result["data"]["starred"] is True

    def test_provider_workflow_agentic(self):
        """Test complete workflow with agentic provider."""
        mock_client = Mock()

        class TestAgenticProvider(AgenticProvider, name="test_agentic"):
            def wrap_tool(self, tool, execute_tool):
                return {
                    "name": tool.slug,
                    "description": tool.description,
                    "parameters": tool.input_parameters,
                    "executor": execute_tool,
                }

            def wrap_tools(self, tools, execute_tool):
                return [self.wrap_tool(tool, execute_tool) for tool in tools]

        provider = TestAgenticProvider()

        # Initialize Tools
        tools = Tools(
            client=mock_client,
            provider=provider,
            toolkit_versions={"github": "12012025_00"},
        )

        # Verify provider has execute_tool
        assert hasattr(provider, "execute_tool")

        # Mock tool and response
        github_tool = create_mock_tool("GITHUB_STAR_REPO", "github", "12012025_00")
        mock_client.tools.retrieve.return_value = github_tool

        mock_list_response = Mock()
        mock_list_response.items = [github_tool]
        mock_client.tools.list.return_value = mock_list_response

        mock_execute_response = Mock()
        mock_execute_response.model_dump.return_value = {
            "data": {"starred": True},
            "error": None,
            "successful": True,
        }
        mock_client.tools.execute.return_value = mock_execute_response

        # Get wrapped tools
        wrapped_tools = tools.get(user_id="test-user", slug="GITHUB_STAR_REPO")

        # Verify wrapped tools have executor
        assert len(wrapped_tools) == 1
        wrapped_tool = wrapped_tools[0]
        assert "executor" in wrapped_tool
        assert callable(wrapped_tool["executor"])

        # Execute via wrapped tool executor
        result = wrapped_tool["executor"](
            slug="GITHUB_STAR_REPO",
            arguments={"repo": "composio/composio"},
        )

        assert result["successful"] is True
        assert result["data"]["starred"] is True

        # Also test direct execution via provider
        result2 = provider.execute_tool(
            slug="GITHUB_STAR_REPO",
            arguments={"repo": "composio/composio"},
            user_id="test-user",
        )

        assert result2["successful"] is True
        assert result2["data"]["starred"] is True
