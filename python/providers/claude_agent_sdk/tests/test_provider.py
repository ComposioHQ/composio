"""
Tests for Claude Code Agents Provider
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from composio_claude_agent_sdk.provider import ClaudeAgentSDKProvider


@pytest.fixture
def provider():
    """Create a ClaudeAgentSDKProvider instance."""
    return ClaudeAgentSDKProvider()


@pytest.fixture
def custom_provider():
    """Create a ClaudeAgentSDKProvider with custom options."""
    return ClaudeAgentSDKProvider(
        server_name="custom-server",
        server_version="2.0.0",
    )


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


class TestClaudeAgentSDKProviderInit:
    """Tests for provider initialization."""

    def test_default_options(self, provider):
        """Test provider initializes with default options."""
        assert provider.server_name == "composio"
        assert provider.server_version == "1.0.0"

    def test_custom_options(self, custom_provider):
        """Test provider initializes with custom options."""
        assert custom_provider.server_name == "custom-server"
        assert custom_provider.server_version == "2.0.0"

    def test_name_property(self, provider):
        """Test provider has correct name."""
        assert provider.name == "claude_agent_sdk"


class TestJsonSchemaConversion:
    """Tests for JSON Schema conversion."""

    def test_simple_schema_passthrough(self, provider):
        """Test that JSON Schema is passed through unchanged."""
        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "count": {"type": "integer"},
            },
        }
        result = provider._json_schema_to_simple_schema(schema)
        assert result == schema

    def test_empty_schema(self, provider):
        """Test handling of empty schema."""
        result = provider._json_schema_to_simple_schema({})
        assert result == {}


class TestWrapTool:
    """Tests for wrap_tool method."""

    def test_wrap_tool_returns_sdk_mcp_tool(
        self, provider, mock_tool, mock_execute_tool
    ):
        """Test that wrap_tool returns an SdkMcpTool."""
        with patch("composio_claude_agent_sdk.provider.sdk_tool") as mock_sdk_tool:
            mock_sdk_tool.return_value = lambda fn: fn
            provider.wrap_tool(mock_tool, mock_execute_tool)

            # Verify sdk_tool was called with correct arguments
            mock_sdk_tool.assert_called_once_with(
                mock_tool.slug,
                mock_tool.description,
                mock_tool.input_parameters,
            )

    def test_wrap_tool_without_description(self, provider, mock_execute_tool):
        """Test wrapping a tool without description."""
        tool_without_desc = MagicMock(
            slug="TEST_TOOL",
            description=None,
            input_parameters={"type": "object", "properties": {}},
        )

        with patch("composio_claude_agent_sdk.provider.sdk_tool") as mock_sdk_tool:
            mock_sdk_tool.return_value = lambda fn: fn
            provider.wrap_tool(tool_without_desc, mock_execute_tool)

            # Should use default description
            mock_sdk_tool.assert_called_once()
            call_args = mock_sdk_tool.call_args[0]
            assert call_args[1] == "Execute TEST_TOOL"

    def test_wrap_tool_without_input_parameters(self, provider, mock_execute_tool):
        """Test wrapping a tool without input parameters."""
        tool_without_params = MagicMock(
            slug="TEST_TOOL",
            description="Test tool",
            input_parameters=None,
        )

        with patch("composio_claude_agent_sdk.provider.sdk_tool") as mock_sdk_tool:
            mock_sdk_tool.return_value = lambda fn: fn
            provider.wrap_tool(tool_without_params, mock_execute_tool)

            # Should use empty schema
            mock_sdk_tool.assert_called_once()
            call_args = mock_sdk_tool.call_args[0]
            assert call_args[2] == {}


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

        with patch("composio_claude_agent_sdk.provider.sdk_tool") as mock_sdk_tool:
            mock_sdk_tool.return_value = lambda fn: fn
            wrapped = provider.wrap_tools(tools, mock_execute_tool)

            assert len(wrapped) == 2
            assert mock_sdk_tool.call_count == 2

    def test_wrap_empty_tools_list(self, provider, mock_execute_tool):
        """Test wrapping an empty tools list."""
        wrapped = provider.wrap_tools([], mock_execute_tool)
        assert wrapped == []


class TestCreateMcpServer:
    """Tests for create_mcp_server method."""

    def test_create_mcp_server_with_default_options(self, provider):
        """Test creating MCP server with default options."""
        mock_tools = [MagicMock(), MagicMock()]

        with patch(
            "composio_claude_agent_sdk.provider.create_sdk_mcp_server"
        ) as mock_create:
            mock_create.return_value = {"type": "sdk", "name": "composio"}
            provider.create_mcp_server(mock_tools)

            mock_create.assert_called_once_with(
                name="composio",
                version="1.0.0",
                tools=mock_tools,
            )

    def test_create_mcp_server_with_custom_options(self, custom_provider):
        """Test creating MCP server with custom options."""
        mock_tools = [MagicMock()]

        with patch(
            "composio_claude_agent_sdk.provider.create_sdk_mcp_server"
        ) as mock_create:
            mock_create.return_value = {"type": "sdk", "name": "custom-server"}
            custom_provider.create_mcp_server(mock_tools)

            mock_create.assert_called_once_with(
                name="custom-server",
                version="2.0.0",
                tools=mock_tools,
            )

    def test_create_mcp_server_with_empty_tools(self, provider):
        """Test creating MCP server with empty tools list."""
        with patch(
            "composio_claude_agent_sdk.provider.create_sdk_mcp_server"
        ) as mock_create:
            mock_create.return_value = {"type": "sdk", "name": "composio"}
            provider.create_mcp_server([])

            mock_create.assert_called_once_with(
                name="composio",
                version="1.0.0",
                tools=[],
            )


class TestToolHandlerExecution:
    """Tests for tool handler execution."""

    @pytest.mark.asyncio
    async def test_tool_handler_success(self, provider, mock_tool):
        """Test successful tool execution."""
        mock_execute = MagicMock(return_value={"data": "success", "successful": True})

        # Create a real wrapped tool to test the handler
        with patch("composio_claude_agent_sdk.provider.sdk_tool") as mock_sdk_tool:
            # Capture the decorated function
            captured_handler = None

            def capture_decorator(name, desc, schema):
                def decorator(fn):
                    nonlocal captured_handler
                    captured_handler = fn
                    return fn

                return decorator

            mock_sdk_tool.side_effect = capture_decorator
            provider.wrap_tool(mock_tool, mock_execute)

            # Execute the captured handler
            result = await captured_handler({"to": "test@example.com"})

            assert result["content"][0]["type"] == "text"
            assert "success" in result["content"][0]["text"]

    @pytest.mark.asyncio
    async def test_tool_handler_error(self, provider, mock_tool):
        """Test tool execution with error."""
        mock_execute = MagicMock(side_effect=Exception("Test error"))

        with patch("composio_claude_agent_sdk.provider.sdk_tool") as mock_sdk_tool:
            captured_handler = None

            def capture_decorator(name, desc, schema):
                def decorator(fn):
                    nonlocal captured_handler
                    captured_handler = fn
                    return fn

                return decorator

            mock_sdk_tool.side_effect = capture_decorator
            provider.wrap_tool(mock_tool, mock_execute)

            result = await captured_handler({"to": "test@example.com"})

            assert result["content"][0]["type"] == "text"
            response = json.loads(result["content"][0]["text"])
            assert response["successful"] is False
            assert "Test error" in response["error"]

    @pytest.mark.asyncio
    async def test_tool_handler_string_result(self, provider, mock_tool):
        """Test tool execution returning string result."""
        mock_execute = MagicMock(return_value="Simple string result")

        with patch("composio_claude_agent_sdk.provider.sdk_tool") as mock_sdk_tool:
            captured_handler = None

            def capture_decorator(name, desc, schema):
                def decorator(fn):
                    nonlocal captured_handler
                    captured_handler = fn
                    return fn

                return decorator

            mock_sdk_tool.side_effect = capture_decorator
            provider.wrap_tool(mock_tool, mock_execute)

            result = await captured_handler({})

            assert result["content"][0]["type"] == "text"
            assert result["content"][0]["text"] == "Simple string result"
