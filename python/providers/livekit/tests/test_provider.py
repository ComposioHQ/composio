"""
Tests for LiveKit Agents Provider
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from composio_livekit.provider import LivekitProvider, _slug_to_snake_case


@pytest.fixture
def provider():
    """Create a LivekitProvider instance."""
    return LivekitProvider()


@pytest.fixture
def mock_tool():
    """Create a mock Composio tool."""
    return MagicMock(
        slug="GMAIL_SEND_EMAIL",
        name="Gmail Send Email",
        description="Send an email via Gmail",
        input_parameters={
            "type": "object",
            "properties": {
                "to": {
                    "type": "string",
                    "description": "Recipient email address",
                },
                "subject": {
                    "type": "string",
                    "description": "Email subject",
                },
                "body": {
                    "type": "string",
                    "description": "Email body content",
                },
            },
            "required": ["to", "subject", "body"],
        },
    )


@pytest.fixture
def mock_execute_tool():
    """Create a mock execute_tool function."""
    return MagicMock(
        return_value={
            "data": {"result": "success"},
            "error": None,
            "successful": True,
        }
    )


class TestSlugToSnakeCase:
    """Tests for slug conversion utility."""

    def test_simple_slug(self):
        """Test simple slug conversion."""
        assert _slug_to_snake_case("GMAIL_SEND_EMAIL") == "gmail_send_email"

    def test_single_word(self):
        """Test single word slug."""
        assert _slug_to_snake_case("GMAIL") == "gmail"

    def test_multiple_underscores(self):
        """Test slug with multiple underscores."""
        assert (
            _slug_to_snake_case("GITHUB_STAR_A_REPOSITORY")
            == "github_star_a_repository"
        )

    def test_already_lowercase(self):
        """Test already lowercase slug."""
        assert _slug_to_snake_case("gmail_send_email") == "gmail_send_email"


class TestLivekitProviderInit:
    """Tests for provider initialization."""

    def test_provider_initialization(self, provider):
        """Test provider initializes correctly."""
        assert provider is not None

    def test_name_property(self, provider):
        """Test provider has correct name."""
        assert provider.name == "livekit"


class TestWrapTool:
    """Tests for wrap_tool method."""

    def test_wrap_tool_returns_function_tool(
        self, provider, mock_tool, mock_execute_tool
    ):
        """Test that wrap_tool returns a FunctionTool."""
        with patch("composio_livekit.provider.function_tool") as mock_function_tool:
            mock_function_tool.return_value = MagicMock()
            provider.wrap_tool(mock_tool, mock_execute_tool)

            # Verify function_tool was called
            mock_function_tool.assert_called_once()

            # Verify raw_schema was passed correctly
            call_kwargs = mock_function_tool.call_args.kwargs
            assert "raw_schema" in call_kwargs
            raw_schema = call_kwargs["raw_schema"]
            assert raw_schema["type"] == "function"
            assert raw_schema["name"] == "gmail_send_email"
            assert raw_schema["description"] == "Send an email via Gmail"
            assert raw_schema["parameters"] == mock_tool.input_parameters

    def test_wrap_tool_without_description(self, provider, mock_execute_tool):
        """Test wrapping a tool without description."""
        tool_without_desc = MagicMock(
            slug="TEST_TOOL",
            description=None,
            input_parameters={"type": "object", "properties": {}},
        )

        with patch("composio_livekit.provider.function_tool") as mock_function_tool:
            mock_function_tool.return_value = MagicMock()
            provider.wrap_tool(tool_without_desc, mock_execute_tool)

            # Should use default description
            call_kwargs = mock_function_tool.call_args.kwargs
            raw_schema = call_kwargs["raw_schema"]
            assert raw_schema["description"] == "Execute TEST_TOOL"

    def test_wrap_tool_without_input_parameters(self, provider, mock_execute_tool):
        """Test wrapping a tool without input parameters."""
        tool_without_params = MagicMock(
            slug="TEST_TOOL",
            description="Test tool",
            input_parameters=None,
        )

        with patch("composio_livekit.provider.function_tool") as mock_function_tool:
            mock_function_tool.return_value = MagicMock()
            provider.wrap_tool(tool_without_params, mock_execute_tool)

            # Should use empty schema
            call_kwargs = mock_function_tool.call_args.kwargs
            raw_schema = call_kwargs["raw_schema"]
            assert raw_schema["parameters"] == {}


class TestWrapTools:
    """Tests for wrap_tools method."""

    def test_wrap_multiple_tools(self, provider, mock_tool, mock_execute_tool):
        """Test wrapping multiple tools."""
        another_tool = MagicMock(
            slug="SLACK_POST_MESSAGE",
            description="Post a message to Slack",
            input_parameters={"type": "object", "properties": {}},
        )
        tools = [mock_tool, another_tool]

        with patch("composio_livekit.provider.function_tool") as mock_function_tool:
            mock_function_tool.return_value = MagicMock()
            wrapped = provider.wrap_tools(tools, mock_execute_tool)

            assert len(wrapped) == 2
            assert mock_function_tool.call_count == 2

    def test_wrap_empty_tools_list(self, provider, mock_execute_tool):
        """Test wrapping an empty tools list."""
        wrapped = provider.wrap_tools([], mock_execute_tool)
        assert wrapped == []


class TestToolHandlerExecution:
    """Tests for tool handler execution."""

    @pytest.mark.asyncio
    async def test_tool_handler_success(self, provider, mock_tool):
        """Test successful tool execution."""
        mock_execute = MagicMock(return_value={"data": "success", "successful": True})

        # Capture the handler function
        with patch("composio_livekit.provider.function_tool") as mock_function_tool:
            captured_handler = None

            def capture_function_tool(handler, raw_schema):
                nonlocal captured_handler
                captured_handler = handler
                return MagicMock()

            mock_function_tool.side_effect = capture_function_tool
            provider.wrap_tool(mock_tool, mock_execute)

            # Execute the captured handler
            mock_context = MagicMock()
            result = await captured_handler(
                {"to": "test@example.com", "subject": "Test", "body": "Hello"},
                mock_context,
            )

            # Verify the result
            parsed_result = json.loads(result)
            assert parsed_result["successful"] is True
            assert parsed_result["data"] == "success"

    @pytest.mark.asyncio
    async def test_tool_handler_error(self, provider, mock_tool):
        """Test tool execution with error."""
        mock_execute = MagicMock(side_effect=Exception("Test error"))

        with patch("composio_livekit.provider.function_tool") as mock_function_tool:
            captured_handler = None

            def capture_function_tool(handler, raw_schema):
                nonlocal captured_handler
                captured_handler = handler
                return MagicMock()

            mock_function_tool.side_effect = capture_function_tool
            provider.wrap_tool(mock_tool, mock_execute)

            mock_context = MagicMock()
            result = await captured_handler({"to": "test@example.com"}, mock_context)

            parsed_result = json.loads(result)
            assert parsed_result["successful"] is False
            assert "Test error" in parsed_result["error"]
            assert parsed_result["data"] is None

    @pytest.mark.asyncio
    async def test_tool_handler_string_result(self, provider, mock_tool):
        """Test tool execution returning string result."""
        mock_execute = MagicMock(return_value="Simple string result")

        with patch("composio_livekit.provider.function_tool") as mock_function_tool:
            captured_handler = None

            def capture_function_tool(handler, raw_schema):
                nonlocal captured_handler
                captured_handler = handler
                return MagicMock()

            mock_function_tool.side_effect = capture_function_tool
            provider.wrap_tool(mock_tool, mock_execute)

            mock_context = MagicMock()
            result = await captured_handler({}, mock_context)

            # String results should be returned as-is
            assert result == "Simple string result"

    @pytest.mark.asyncio
    async def test_tool_handler_passes_correct_arguments(self, provider, mock_tool):
        """Test that tool handler passes correct arguments to execute_tool."""
        mock_execute = MagicMock(return_value={"successful": True})

        with patch("composio_livekit.provider.function_tool") as mock_function_tool:
            captured_handler = None

            def capture_function_tool(handler, raw_schema):
                nonlocal captured_handler
                captured_handler = handler
                return MagicMock()

            mock_function_tool.side_effect = capture_function_tool
            provider.wrap_tool(mock_tool, mock_execute)

            mock_context = MagicMock()
            test_args = {"to": "test@example.com", "subject": "Test", "body": "Hello"}
            await captured_handler(test_args, mock_context)

            # Verify execute_tool was called with correct arguments
            mock_execute.assert_called_once_with(
                slug="GMAIL_SEND_EMAIL",
                arguments=test_args,
            )


class TestProviderIntegration:
    """Integration tests for provider functionality."""

    def test_provider_is_agentic_provider(self, provider):
        """Test that LivekitProvider is an AgenticProvider."""
        from composio.core.provider import AgenticProvider

        assert isinstance(provider, AgenticProvider)

    def test_wrap_tool_creates_callable_result(
        self, provider, mock_tool, mock_execute_tool
    ):
        """Test that wrapped tool is usable."""
        with patch("composio_livekit.provider.function_tool") as mock_function_tool:
            mock_result = MagicMock()
            mock_function_tool.return_value = mock_result

            result = provider.wrap_tool(mock_tool, mock_execute_tool)

            assert result is mock_result

    def test_multiple_tools_have_unique_names(self, provider, mock_execute_tool):
        """Test that multiple tools get unique snake_case names."""
        tools = [
            MagicMock(
                slug="GMAIL_SEND_EMAIL",
                description="Send email",
                input_parameters={},
            ),
            MagicMock(
                slug="SLACK_POST_MESSAGE",
                description="Post message",
                input_parameters={},
            ),
            MagicMock(
                slug="GITHUB_CREATE_ISSUE",
                description="Create issue",
                input_parameters={},
            ),
        ]

        captured_schemas = []

        with patch("composio_livekit.provider.function_tool") as mock_function_tool:

            def capture_schema(handler, raw_schema):
                captured_schemas.append(raw_schema)
                return MagicMock()

            mock_function_tool.side_effect = capture_schema
            provider.wrap_tools(tools, mock_execute_tool)

        names = [schema["name"] for schema in captured_schemas]
        assert names == [
            "gmail_send_email",
            "slack_post_message",
            "github_create_issue",
        ]
        assert len(set(names)) == 3  # All unique
