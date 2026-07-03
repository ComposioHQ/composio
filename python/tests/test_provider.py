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
from tests.conftest import mock_http_client


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
        mock_client = mock_http_client()
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
        mock_client = mock_http_client()

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
        mock_client = mock_http_client()
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
        mock_client = mock_http_client()
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
        mock_client = mock_http_client()
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
        mock_client = mock_http_client()
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
        mock_client = mock_http_client()
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

        mock_client = mock_http_client()
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
        mock_client = mock_http_client()
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

        mock_client = mock_http_client()
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

        mock_client = mock_http_client()
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

    def test_openai_provider_handle_tool_calls_only_first_choice(self):
        """Only the first choice runs; n > 1 alternatives would orphan tool_call_ids."""
        from openai.types.chat import ChatCompletion
        from openai.types.chat.chat_completion import Choice
        from openai.types.chat.chat_completion_message import ChatCompletionMessage
        from openai.types.chat.chat_completion_message_tool_call import (
            ChatCompletionMessageToolCall,
            Function,
        )

        mock_client = mock_http_client()
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

        def make_choice(index: int, call_id: str) -> Choice:
            return Choice(
                finish_reason="tool_calls",
                index=index,
                message=ChatCompletionMessage(
                    role="assistant",
                    content=None,
                    tool_calls=[
                        ChatCompletionMessageToolCall(
                            id=call_id,
                            function=Function(
                                name="GITHUB_STAR_REPO",
                                arguments='{"repo": "composio/composio"}',
                            ),
                            type="function",
                        )
                    ],
                ),
            )

        completion = ChatCompletion(
            id="chatcmpl-123",
            choices=[make_choice(0, "call_first"), make_choice(1, "call_second")],
            created=1234567890,
            model="gpt-4",
            object="chat.completion",
        )

        results = provider.handle_tool_calls(
            user_id="test-user",
            response=completion,
        )

        assert len(results) == 1
        assert mock_client.tools.execute.call_count == 1

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
        mock_client = mock_http_client()

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
        mock_client = mock_http_client()

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
        mock_client = mock_http_client()

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
        mock_client = mock_http_client()

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


class TestLangchainReservedKeywords:
    """Regression tests for PLEN-1671: ValueError when tool schema has Python reserved keywords as parameter names.

    Tools from some toolkits (e.g. Intercom) have parameters named 'from',
    which is a Python reserved keyword. The LangchainProvider must substitute
    these names before building function signatures and reinstate them when
    executing the tool.
    """

    def _make_tool_with_params(self, properties: dict, required: list | None = None):
        """Helper: create a mock Tool whose input_parameters use the given properties."""
        return Tool(
            name="Test Tool",
            slug="TEST_TOOL",
            description="A tool for testing reserved keyword handling",
            input_parameters={
                "type": "object",
                "title": "TestToolRequest",
                "properties": properties,
                "required": required or [],
            },
            output_parameters={},
            available_versions=["12012025_00"],
            version="12012025_00",
            scopes=[],
            toolkit=tool_list_response.ItemToolkit(name="Test", slug="test", logo=""),
            deprecated=tool_list_response.ItemDeprecated(
                available_versions=["12012025_00"],
                displayName="Test Tool",
                version="12012025_00",
                toolkit=tool_list_response.ItemDeprecatedToolkit(logo=""),
                is_deprecated=False,
            ),
            is_deprecated=False,
            no_auth=False,
            tags=[],
        )

    def test_wrap_tool_with_from_parameter(self):
        """PLEN-1671: 'from' parameter must not raise ValueError."""
        from composio_langchain import LangchainProvider

        provider = LangchainProvider()
        tool = self._make_tool_with_params(
            properties={
                "from": {
                    "type": "string",
                    "description": "Starting point for listing",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results",
                    "default": 20,
                },
            },
        )

        captured = {}

        def mock_execute(slug, arguments):
            captured.update(arguments)
            return {"data": {}, "error": None, "successful": True}

        # Must not raise ValueError: 'from' is not a valid parameter name
        wrapped = provider.wrap_tool(tool, mock_execute)

        assert wrapped.name == "TEST_TOOL"

        # Invoke the tool and verify 'from' is reinstated in the arguments
        wrapped.run({"from_rs": "2024-01-01", "limit": 10})
        assert captured == {"from": "2024-01-01", "limit": 10}

    def test_wrap_tool_with_multiple_reserved_keywords(self):
        """All Python reserved keywords used as parameter names must be handled."""
        from composio_langchain import LangchainProvider

        provider = LangchainProvider()
        tool = self._make_tool_with_params(
            properties={
                "from": {
                    "type": "string",
                    "description": "Start date",
                },
                "for": {
                    "type": "string",
                    "description": "Recipient",
                },
                "import": {
                    "type": "string",
                    "description": "Import source",
                },
                "class": {
                    "type": "string",
                    "description": "CSS class",
                },
                "async": {
                    "type": "boolean",
                    "description": "Async flag",
                    "default": False,
                },
                "normal_param": {
                    "type": "string",
                    "description": "A normal parameter",
                },
            },
        )

        captured = {}

        def mock_execute(slug, arguments):
            captured.update(arguments)
            return {"data": {}, "error": None, "successful": True}

        wrapped = provider.wrap_tool(tool, mock_execute)
        assert wrapped.name == "TEST_TOOL"

        # Invoke with renamed parameters and verify originals are reinstated
        wrapped.run(
            {
                "from_rs": "2024-01-01",
                "for_rs": "user@example.com",
                "import_rs": "csv",
                "class_rs": "primary",
                "async_rs": True,
                "normal_param": "hello",
            }
        )
        assert captured == {
            "from": "2024-01-01",
            "for": "user@example.com",
            "import": "csv",
            "class": "primary",
            "async": True,
            "normal_param": "hello",
        }

    def test_wrap_tool_with_required_reserved_keyword_param(self):
        """Reserved keywords that are also required params must work."""
        from composio_langchain import LangchainProvider

        provider = LangchainProvider()
        tool = self._make_tool_with_params(
            properties={
                "from": {
                    "type": "string",
                    "description": "Required start date",
                },
            },
            required=["from"],
        )

        captured = {}

        def mock_execute(slug, arguments):
            captured.update(arguments)
            return {"data": {}, "error": None, "successful": True}

        wrapped = provider.wrap_tool(tool, mock_execute)
        wrapped.run({"from_rs": "2024-01-01"})
        assert captured == {"from": "2024-01-01"}


class TestProviderEdgeCases:
    """Test edge cases and error handling for providers."""

    def test_execute_tool_with_none_parameters(self):
        """Test that execute_tool works when optional parameters are None."""
        mock_client = mock_http_client()
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
        mock_client = mock_http_client()
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
        mock_client = mock_http_client()
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
        mock_client = mock_http_client()

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


class TestAgenticSkipDefaultsParity:
    """Regression: agentic providers must honor skip_defaults in __signature__.

    The langchain and langgraph providers strip schema defaults from
    args_schema when schema_config={"skip_defaults": True}, but kept the
    defaults in the function __signature__, so the signature and args_schema
    disagreed about which optional params were required. They now pass the
    same skip_default to both, matching the sibling llamaindex provider.

    autogen only builds __signature__ (no args_schema), so it never had the
    mismatch, but its signature likewise ignored skip_defaults; it is aligned
    too and checked on the signature alone.

    Provider packages are optional (the unit-test job installs langchain and
    autogen), so each case skips via importorskip when its provider is absent.
    """

    def _make_tool_with_default(self):
        return Tool(
            name="Test Tool",
            slug="TEST_TOOL",
            description="A tool with a defaulted optional param",
            input_parameters={
                "type": "object",
                "title": "TestToolRequest",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Max results",
                        "default": 5,
                    },
                },
                "required": [],
            },
            output_parameters={},
            available_versions=["12012025_00"],
            version="12012025_00",
            scopes=[],
            toolkit=tool_list_response.ItemToolkit(name="Test", slug="test", logo=""),
            deprecated=tool_list_response.ItemDeprecated(
                available_versions=["12012025_00"],
                displayName="Test Tool",
                version="12012025_00",
                toolkit=tool_list_response.ItemDeprecatedToolkit(logo=""),
                is_deprecated=False,
            ),
            is_deprecated=False,
            no_auth=False,
            tags=[],
        )

    def _provider(self, name, schema_config=None):
        module = pytest.importorskip(f"composio_{name}")
        provider_cls = getattr(module, f"{name.capitalize()}Provider")
        return (
            provider_cls(schema_config=schema_config)
            if schema_config
            else provider_cls()
        )

    @pytest.mark.parametrize("name", ["langchain", "langgraph"])
    def test_skip_defaults_signature_matches_args_schema(self, name):
        from inspect import Parameter

        provider = self._provider(name, {"skip_defaults": True})
        wrapped = provider.wrap_tool(self._make_tool_with_default(), Mock())

        limit = wrapped.func.__signature__.parameters["limit"]
        assert limit.default is Parameter.empty
        assert wrapped.args_schema.model_fields["limit"].is_required()

    @pytest.mark.parametrize("name", ["langchain", "langgraph"])
    def test_default_preserved_without_skip_defaults(self, name):
        provider = self._provider(name)
        wrapped = provider.wrap_tool(self._make_tool_with_default(), Mock())

        limit = wrapped.func.__signature__.parameters["limit"]
        assert limit.default == 5
        assert not wrapped.args_schema.model_fields["limit"].is_required()

    def test_autogen_signature_honors_skip_defaults(self):
        from inspect import Parameter

        provider = self._provider("autogen", {"skip_defaults": True})
        wrapped = provider.wrap_tool(self._make_tool_with_default(), Mock())

        # autogen exposes the wrapped function as `_func` and has no args_schema.
        limit = wrapped._func.__signature__.parameters["limit"]
        assert limit.default is Parameter.empty

    def test_autogen_signature_preserves_default(self):
        provider = self._provider("autogen")
        wrapped = provider.wrap_tool(self._make_tool_with_default(), Mock())

        limit = wrapped._func.__signature__.parameters["limit"]
        assert limit.default == 5
