"""Test ToolRouter functionality."""

from unittest.mock import MagicMock, patch

import pytest

from composio.core.models.tool_router import (
    ToolRouter,
    ToolRouterMCPServerConfig,
    ToolRouterToolkitsEnableConfig,
    ToolRouterToolkitsDisableConfig,
    ToolRouterManageConnectionsConfig,
    ToolkitConnectionState,
    ToolkitConnectionsDetails,
    ToolRouterMCPServerType,
)


@pytest.fixture
def mock_client():
    """Create a mock HTTP client."""
    client = MagicMock()
    client.api_key = "test-api-key"

    # Mock session responses
    mock_session_response = MagicMock()
    mock_session_response.session_id = "session_123"
    mock_session_response.mcp = MagicMock()
    mock_session_response.mcp.type = "http"
    mock_session_response.mcp.url = "https://mcp.example.com/session_123"
    mock_session_response.tool_router_tools = [
        "GMAIL_FETCH_EMAILS",
        "SLACK_SEND_MESSAGE",
        "GITHUB_CREATE_ISSUE",
    ]
    mock_session_response.config = MagicMock()
    mock_session_response.config.user_id = "user_123"

    client.tool_router.session.create.return_value = mock_session_response
    client.tool_router.session.retrieve.return_value = mock_session_response

    # Mock link response
    mock_link_response = MagicMock()
    mock_link_response.connected_account_id = "conn_456"
    mock_link_response.redirect_url = "https://composio.dev/auth/redirect"
    client.tool_router.session.link.return_value = mock_link_response

    # Mock toolkits response
    mock_toolkit_item_active = MagicMock()
    mock_toolkit_item_active.slug = "gmail"
    mock_toolkit_item_active.name = "Gmail"
    mock_toolkit_item_active.meta.logo = "https://example.com/gmail-logo.png"
    mock_toolkit_item_active.is_no_auth = False
    mock_toolkit_item_active.connected_account = MagicMock()
    mock_toolkit_item_active.connected_account.id = "conn_123"
    mock_toolkit_item_active.connected_account.status = "ACTIVE"
    mock_toolkit_item_active.connected_account.auth_config = MagicMock()
    mock_toolkit_item_active.connected_account.auth_config.id = "auth_config_123"
    mock_toolkit_item_active.connected_account.auth_config.auth_scheme = "OAUTH2"
    mock_toolkit_item_active.connected_account.auth_config.is_composio_managed = True

    mock_toolkit_item_inactive = MagicMock()
    mock_toolkit_item_inactive.slug = "github"
    mock_toolkit_item_inactive.name = "GitHub"
    mock_toolkit_item_inactive.meta.logo = "https://example.com/github-logo.png"
    mock_toolkit_item_inactive.is_no_auth = False
    mock_toolkit_item_inactive.connected_account = None

    mock_toolkits_response = MagicMock()
    mock_toolkits_response.items = [
        mock_toolkit_item_active,
        mock_toolkit_item_inactive,
    ]
    mock_toolkits_response.next_cursor = "cursor_789"
    mock_toolkits_response.total_pages = 2
    client.tool_router.session.toolkits.return_value = mock_toolkits_response

    return client


@pytest.fixture
def mock_provider():
    """Create a mock provider."""
    provider = MagicMock()
    return provider


@pytest.fixture
def tool_router(mock_client, mock_provider):
    """Create a ToolRouter instance with mocked client."""
    return ToolRouter(client=mock_client, provider=mock_provider)


class TestToolRouter:
    """Test cases for ToolRouter class."""

    def test_constructor(self, tool_router, mock_client, mock_provider):
        """Test that ToolRouter initializes correctly."""
        assert tool_router._client == mock_client
        assert tool_router._provider == mock_provider

    def test_create_basic_session(self, tool_router, mock_client):
        """Test creating a basic session with minimal configuration."""
        session = tool_router.create(user_id="user_123")

        # Verify session properties
        assert session.session_id == "session_123"
        assert session.mcp.type == ToolRouterMCPServerType.HTTP
        assert session.mcp.url == "https://mcp.example.com/session_123"
        assert session.mcp.headers == {"x-api-key": "test-api-key"}
        assert callable(session.tools)
        assert callable(session.authorize)
        assert callable(session.toolkits)

        # Verify API was called
        mock_client.tool_router.session.create.assert_called_once()

    def test_create_session_with_toolkits_list(self, tool_router, mock_client):
        """Test creating a session with toolkits as a list."""
        session = tool_router.create(user_id="user_123", toolkits=["github", "slack"])

        assert session.session_id == "session_123"

        # Verify the API was called with correct parameters
        call_args = mock_client.tool_router.session.create.call_args
        assert call_args is not None
        kwargs = call_args.kwargs
        assert "toolkits" in kwargs
        assert kwargs["toolkits"] == {"enable": ["github", "slack"]}

    def test_create_session_with_disable_toolkits(self, tool_router, mock_client):
        """Test creating a session with disable toolkits."""
        session = tool_router.create(
            user_id="user_123", toolkits={"disable": ["linear", "notion"]}
        )

        assert session.session_id == "session_123"

        # Verify the API was called with correct parameters
        call_args = mock_client.tool_router.session.create.call_args
        kwargs = call_args.kwargs
        assert kwargs["toolkits"] == {"disable": ["linear", "notion"]}

    def test_create_session_with_tools_config(self, tool_router, mock_client):
        """Test creating a session with per-toolkit tool configuration."""
        session = tool_router.create(
            user_id="user_123",
            tools={
                "gmail": ["GMAIL_SEND_EMAIL", "GMAIL_SEARCH"],
                "github": {"enable": ["GITHUB_CREATE_ISSUE"]},
            },
        )

        assert session.session_id == "session_123"

        # Verify the API was called with tools config
        call_args = mock_client.tool_router.session.create.call_args
        kwargs = call_args.kwargs
        assert "tools" in kwargs
        assert "gmail" in kwargs["tools"]
        assert kwargs["tools"]["gmail"] == {
            "enable": ["GMAIL_SEND_EMAIL", "GMAIL_SEARCH"]
        }
        assert kwargs["tools"]["github"] == {"enable": ["GITHUB_CREATE_ISSUE"]}

    def test_create_session_with_global_tags(self, tool_router, mock_client):
        """Test creating a session with global tag filtering."""
        session = tool_router.create(
            user_id="user_123", tags=["readOnlyHint", "idempotentHint"]
        )

        assert session.session_id == "session_123"

        # Verify the API was called with tags at top level
        call_args = mock_client.tool_router.session.create.call_args
        kwargs = call_args.kwargs
        assert "tags" in kwargs
        assert kwargs["tags"] == ["readOnlyHint", "idempotentHint"]

    def test_create_session_with_toolkit_specific_tags(self, tool_router, mock_client):
        """Test creating a session with per-toolkit tag filtering."""
        session = tool_router.create(
            user_id="user_123",
            tools={
                "gmail": {"tags": ["readOnlyHint"]},
                "github": {"tags": ["readOnlyHint", "idempotentHint"]},
            },
        )

        assert session.session_id == "session_123"

        call_args = mock_client.tool_router.session.create.call_args
        kwargs = call_args.kwargs
        assert "tools" in kwargs
        assert kwargs["tools"]["gmail"] == {"tags": ["readOnlyHint"]}
        assert kwargs["tools"]["github"] == {"tags": ["readOnlyHint", "idempotentHint"]}

    def test_create_session_with_mixed_tools_config(self, tool_router, mock_client):
        """Test creating a session with mixed tool configuration (enable, disable, tags)."""
        session = tool_router.create(
            user_id="user_123",
            tools={
                "gmail": ["GMAIL_SEND_EMAIL"],  # List shorthand
                "slack": {"disable": ["SLACK_DELETE_MESSAGE"]},
                "github": {"tags": ["readOnlyHint"]},
            },
        )

        assert session.session_id == "session_123"

        call_args = mock_client.tool_router.session.create.call_args
        kwargs = call_args.kwargs
        assert kwargs["tools"]["gmail"] == {"enable": ["GMAIL_SEND_EMAIL"]}
        assert kwargs["tools"]["slack"] == {"disable": ["SLACK_DELETE_MESSAGE"]}
        assert kwargs["tools"]["github"] == {"tags": ["readOnlyHint"]}

    def test_create_session_with_manage_connections_boolean(
        self, tool_router, mock_client
    ):
        """Test creating a session with manage_connections as boolean."""
        session = tool_router.create(user_id="user_123", manage_connections=True)

        assert session.session_id == "session_123"

        call_args = mock_client.tool_router.session.create.call_args
        kwargs = call_args.kwargs
        assert kwargs["connections"]["auto_manage_connections"] is True

    def test_create_session_with_manage_connections_config(
        self, tool_router, mock_client
    ):
        """Test creating a session with manage_connections as config object."""
        session = tool_router.create(
            user_id="user_123",
            manage_connections={
                "enable": True,
                "callback_url": "https://example.com/callback",
            },
        )

        assert session.session_id == "session_123"

        call_args = mock_client.tool_router.session.create.call_args
        kwargs = call_args.kwargs
        assert kwargs["connections"]["auto_manage_connections"] is True
        assert kwargs["connections"]["callback_url"] == "https://example.com/callback"

    def test_create_session_with_auth_configs(self, tool_router, mock_client):
        """Test creating a session with auth configs."""
        session = tool_router.create(
            user_id="user_123", auth_configs={"github": "ac_xxx", "slack": "ac_yyy"}
        )

        assert session.session_id == "session_123"

        call_args = mock_client.tool_router.session.create.call_args
        kwargs = call_args.kwargs
        assert kwargs["auth_configs"] == {"github": "ac_xxx", "slack": "ac_yyy"}

    def test_create_session_with_connected_accounts(self, tool_router, mock_client):
        """Test creating a session with connected accounts."""
        session = tool_router.create(
            user_id="user_123",
            connected_accounts={"github": "ca_xxx", "slack": "ca_yyy"},
        )

        assert session.session_id == "session_123"

        call_args = mock_client.tool_router.session.create.call_args
        kwargs = call_args.kwargs
        assert kwargs["connected_accounts"] == {"github": "ca_xxx", "slack": "ca_yyy"}

    def test_create_session_with_execution_config(self, tool_router, mock_client):
        """Test creating a session with execution configuration."""
        session = tool_router.create(
            user_id="user_123",
            execution={"enable_proxy_execution": False, "auto_offload_threshold": 300},
        )

        assert session.session_id == "session_123"

        call_args = mock_client.tool_router.session.create.call_args
        kwargs = call_args.kwargs
        assert "execution" in kwargs
        assert kwargs["execution"]["enable_proxy_execution"] is False
        assert kwargs["execution"]["auto_offload_threshold"] == 300

    def test_create_session_complex_config(self, tool_router, mock_client):
        """Test creating a session with complex configuration."""
        session = tool_router.create(
            user_id="user_123",
            toolkits=["github", "slack"],
            tools={
                "gmail": ["GMAIL_SEND_EMAIL"],
            },
            tags=["readOnlyHint", "idempotentHint"],
            manage_connections={
                "enable": True,
                "callback_url": "https://example.com/callback",
            },
            auth_configs={"github": "ac_xxx"},
            connected_accounts={"slack": "ca_yyy"},
            execution={"enable_proxy_execution": True, "auto_offload_threshold": 600},
        )

        assert session.session_id == "session_123"
        assert session.mcp.type == ToolRouterMCPServerType.HTTP

        # Verify all parameters were passed correctly
        call_args = mock_client.tool_router.session.create.call_args
        kwargs = call_args.kwargs
        assert kwargs["user_id"] == "user_123"
        assert "toolkits" in kwargs
        assert "tools" in kwargs
        assert "tags" in kwargs
        assert "connections" in kwargs
        assert "auth_configs" in kwargs
        assert "connected_accounts" in kwargs
        assert "execution" in kwargs

    def test_create_session_raises_error_without_provider(self, mock_client):
        """Test that creating a session without provider raises an error when calling tools()."""
        tool_router = ToolRouter(client=mock_client, provider=None)

        # The error is raised during create() because it calls _create_tools_fn
        with pytest.raises(ValueError, match="Provider is required for tool router"):
            tool_router.create(user_id="user_123")

    def test_use_session(self, tool_router, mock_client):
        """Test retrieving an existing session."""
        session = tool_router.use(session_id="session_123")

        # Verify session properties
        assert session.session_id == "session_123"
        assert session.mcp.type == ToolRouterMCPServerType.HTTP
        assert session.mcp.url == "https://mcp.example.com/session_123"
        assert session.mcp.headers == {"x-api-key": "test-api-key"}
        assert callable(session.tools)
        assert callable(session.authorize)
        assert callable(session.toolkits)

        # Verify retrieve was called
        mock_client.tool_router.session.retrieve.assert_called_once_with("session_123")

    def test_use_session_with_different_user(self, tool_router, mock_client):
        """Test that use() extracts user_id from session config."""
        mock_retrieve_response = MagicMock()
        mock_retrieve_response.session_id = "session_456"
        mock_retrieve_response.mcp = MagicMock()
        mock_retrieve_response.mcp.type = "http"
        mock_retrieve_response.mcp.url = "https://mcp.example.com/session_456"
        mock_retrieve_response.tool_router_tools = ["TOOL_1"]
        mock_retrieve_response.config = MagicMock()
        mock_retrieve_response.config.user_id = "custom_user_789"

        mock_client.tool_router.session.retrieve.return_value = mock_retrieve_response

        session = tool_router.use(session_id="session_456")

        assert session.session_id == "session_456"
        assert session.mcp.type == ToolRouterMCPServerType.HTTP

    def test_use_session_throws_error_on_failure(self, tool_router, mock_client):
        """Test that use() throws error if retrieve fails."""
        mock_client.tool_router.session.retrieve.side_effect = Exception(
            "Session not found"
        )

        with pytest.raises(Exception, match="Session not found"):
            tool_router.use(session_id="invalid_session")

    def test_authorize_function(self, tool_router, mock_client):
        """Test the authorize function returned by session."""
        session = tool_router.create(user_id="user_123")

        session.authorize("github")

        # Verify link was called
        mock_client.tool_router.session.link.assert_called_once()
        call_args = mock_client.tool_router.session.link.call_args
        assert call_args.kwargs["session_id"] == "session_123"
        assert call_args.kwargs["toolkit"] == "github"

    def test_authorize_function_with_callback_url(self, tool_router, mock_client):
        """Test the authorize function with callback URL."""
        session = tool_router.create(user_id="user_123")

        session.authorize("github", callback_url="https://myapp.com/callback")

        # Verify link was called with callback_url
        call_args = mock_client.tool_router.session.link.call_args
        assert call_args.kwargs.get("callback_url") == "https://myapp.com/callback"

    def test_toolkits_function(self, tool_router, mock_client):
        """Test the toolkits function returned by session."""
        session = tool_router.create(user_id="user_123")

        toolkits_result = session.toolkits()

        # Verify toolkits was called
        mock_client.tool_router.session.toolkits.assert_called_once_with(
            session_id="session_123"
        )

        # Verify result structure
        assert isinstance(toolkits_result, ToolkitConnectionsDetails)
        assert len(toolkits_result.items) == 2
        assert toolkits_result.next_cursor == "cursor_789"
        assert toolkits_result.total_pages == 2

    def test_toolkits_function_with_pagination(self, tool_router, mock_client):
        """Test the toolkits function with pagination options."""
        session = tool_router.create(user_id="user_123")

        session.toolkits(next_cursor="cursor_abc", limit=10)

        # Verify toolkits was called with pagination params
        call_args = mock_client.tool_router.session.toolkits.call_args
        assert call_args.kwargs.get("cursor") == "cursor_abc"
        assert call_args.kwargs.get("limit") == 10

    def test_toolkits_transform_active_connection(self, tool_router, mock_client):
        """Test that toolkits function correctly transforms active connections."""
        session = tool_router.create(user_id="user_123")

        toolkits_result = session.toolkits()

        gmail_toolkit = toolkits_result.items[0]
        assert gmail_toolkit.slug == "gmail"
        assert gmail_toolkit.name == "Gmail"
        assert gmail_toolkit.logo == "https://example.com/gmail-logo.png"
        assert gmail_toolkit.is_no_auth is False
        assert gmail_toolkit.connection.is_active is True
        assert gmail_toolkit.connection.auth_config is not None
        assert gmail_toolkit.connection.auth_config.id == "auth_config_123"
        assert gmail_toolkit.connection.auth_config.mode == "OAUTH2"
        assert gmail_toolkit.connection.auth_config.is_composio_managed is True
        assert gmail_toolkit.connection.connected_account is not None
        assert gmail_toolkit.connection.connected_account.id == "conn_123"
        assert gmail_toolkit.connection.connected_account.status == "ACTIVE"

    def test_toolkits_transform_no_connection(self, tool_router, mock_client):
        """Test that toolkits function correctly transforms toolkits with no connection."""
        session = tool_router.create(user_id="user_123")

        toolkits_result = session.toolkits()

        github_toolkit = toolkits_result.items[1]
        assert github_toolkit.slug == "github"
        assert github_toolkit.name == "GitHub"
        assert github_toolkit.connection.is_active is False
        assert github_toolkit.connection.auth_config is None
        assert github_toolkit.connection.connected_account is None

    @patch("composio.core.models.tools.Tools")
    def test_tools_function(
        self, mock_tools_class, tool_router, mock_client, mock_provider
    ):
        """Test the tools function returned by session."""
        # Setup mock Tools instance
        mock_tools_instance = MagicMock()
        mock_tools_instance.get.return_value = "mocked-wrapped-tools"
        mock_tools_class.return_value = mock_tools_instance

        session = tool_router.create(user_id="user_123")
        session.tools()

        # Verify Tools was instantiated
        mock_tools_class.assert_called_once_with(
            client=mock_client, provider=mock_provider
        )

        # Verify get was called
        mock_tools_instance.get.assert_called_once()
        call_args = mock_tools_instance.get.call_args
        assert call_args.kwargs["user_id"] == "user_123"
        assert "tools" in call_args.kwargs

    @patch("composio.core.models.tools.Tools")
    def test_tools_function_with_modifiers(
        self, mock_tools_class, tool_router, mock_client, mock_provider
    ):
        """Test the tools function with modifiers."""
        mock_tools_instance = MagicMock()
        mock_tools_instance.get.return_value = "mocked-wrapped-tools"
        mock_tools_class.return_value = mock_tools_instance

        session = tool_router.create(user_id="user_123")

        modifiers = [{"name": "test_modifier"}]
        session.tools(modifiers=modifiers)

        # Verify get was called with modifiers
        call_args = mock_tools_instance.get.call_args
        assert call_args.kwargs.get("modifiers") == modifiers

    def test_session_mcp_type_http(self, tool_router, mock_client):
        """Test that MCP type is correctly set to HTTP enum."""
        session = tool_router.create(user_id="user_123")

        assert session.mcp.type == ToolRouterMCPServerType.HTTP
        assert session.mcp.type.value == "http"

    def test_session_mcp_sse_type(self, tool_router, mock_client):
        """Test that SSE MCP type is handled correctly."""
        mock_sse_response = MagicMock()
        mock_sse_response.session_id = "session_sse"
        mock_sse_response.mcp = MagicMock()
        mock_sse_response.mcp.type = "sse"
        mock_sse_response.mcp.url = "https://mcp.example.com/sse/session_sse"
        mock_sse_response.tool_router_tools = ["TOOL_1"]

        mock_client.tool_router.session.create.return_value = mock_sse_response

        session = tool_router.create(user_id="user_123")

        assert session.mcp.type == ToolRouterMCPServerType.SSE
        assert session.mcp.type.value == "sse"
        assert session.mcp.url == "https://mcp.example.com/sse/session_sse"

    def test_multiple_sessions_independently(self, tool_router, mock_client):
        """Test that multiple sessions can be created independently."""
        mock_session_1 = MagicMock()
        mock_session_1.session_id = "session_1"
        mock_session_1.mcp = MagicMock()
        mock_session_1.mcp.type = "http"
        mock_session_1.mcp.url = "https://mcp.example.com/session_1"
        mock_session_1.tool_router_tools = ["TOOL_1"]

        mock_session_2 = MagicMock()
        mock_session_2.session_id = "session_2"
        mock_session_2.mcp = MagicMock()
        mock_session_2.mcp.type = "http"
        mock_session_2.mcp.url = "https://mcp.example.com/session_2"
        mock_session_2.tool_router_tools = ["TOOL_2"]

        mock_client.tool_router.session.create.side_effect = [
            mock_session_1,
            mock_session_2,
        ]

        session1 = tool_router.create(user_id="user_1")
        session2 = tool_router.create(user_id="user_2")

        assert session1.session_id == "session_1"
        assert session2.session_id == "session_2"
        assert mock_client.tool_router.session.create.call_count == 2

    def test_use_vs_create_independence(self, tool_router, mock_client):
        """Test that use() and create() are independent."""
        # Setup different responses for create and retrieve
        mock_create_response = MagicMock()
        mock_create_response.session_id = "created_session"
        mock_create_response.mcp = MagicMock()
        mock_create_response.mcp.type = "http"
        mock_create_response.mcp.url = "https://mcp.example.com/created"
        mock_create_response.tool_router_tools = ["TOOL_1"]

        mock_retrieve_response = MagicMock()
        mock_retrieve_response.session_id = "retrieved_session"
        mock_retrieve_response.mcp = MagicMock()
        mock_retrieve_response.mcp.type = "http"
        mock_retrieve_response.mcp.url = "https://mcp.example.com/retrieved"
        mock_retrieve_response.tool_router_tools = ["TOOL_2"]
        mock_retrieve_response.config = MagicMock()
        mock_retrieve_response.config.user_id = "user_456"

        mock_client.tool_router.session.create.return_value = mock_create_response
        mock_client.tool_router.session.retrieve.return_value = mock_retrieve_response

        # Create a new session
        created_session = tool_router.create(user_id="user_123")
        assert created_session.session_id == "created_session"

        # Use an existing session
        retrieved_session = tool_router.use(session_id="retrieved_session")
        assert retrieved_session.session_id == "retrieved_session"

        # Verify both methods were called
        mock_client.tool_router.session.create.assert_called_once()
        mock_client.tool_router.session.retrieve.assert_called_once()


class TestToolRouterTypes:
    """Test type definitions for ToolRouter."""

    def test_toolkit_enable_config_type(self):
        """Test ToolRouterToolkitsEnableConfig type."""
        config: ToolRouterToolkitsEnableConfig = {"enable": ["github", "slack"]}
        assert "enable" in config
        assert config["enable"] == ["github", "slack"]

    def test_toolkit_disable_config_type(self):
        """Test ToolRouterToolkitsDisableConfig type."""
        config: ToolRouterToolkitsDisableConfig = {"disable": ["linear"]}
        assert "disable" in config

    def test_manage_connections_config_type(self):
        """Test ToolRouterManageConnectionsConfig type."""
        config: ToolRouterManageConnectionsConfig = {
            "enable": True,
            "callback_url": "https://example.com/callback",
        }
        assert config["enable"] is True
        assert config["callback_url"] == "https://example.com/callback"

    def test_mcp_server_config(self):
        """Test ToolRouterMCPServerConfig dataclass."""
        mcp = ToolRouterMCPServerConfig(
            type=ToolRouterMCPServerType.HTTP, url="https://mcp.example.com"
        )
        assert mcp.type == ToolRouterMCPServerType.HTTP
        assert mcp.type.value == "http"
        assert mcp.url == "https://mcp.example.com"
        assert mcp.headers is None  # Headers are optional

    def test_mcp_server_config_with_headers(self):
        """Test ToolRouterMCPServerConfig dataclass with headers."""
        mcp = ToolRouterMCPServerConfig(
            type=ToolRouterMCPServerType.HTTP,
            url="https://mcp.example.com",
            headers={"x-api-key": "test-api-key"},
        )
        assert mcp.type == ToolRouterMCPServerType.HTTP
        assert mcp.url == "https://mcp.example.com"
        assert mcp.headers == {"x-api-key": "test-api-key"}

    def test_toolkit_connection_state(self):
        """Test ToolkitConnectionState dataclass."""
        from composio.core.models.tool_router import (
            ToolkitConnection,
            ToolkitConnectionAuthConfig,
            ToolkitConnectedAccount,
        )

        connection = ToolkitConnection(
            is_active=True,
            auth_config=ToolkitConnectionAuthConfig(
                id="ac_123", mode="OAUTH2", is_composio_managed=True
            ),
            connected_account=ToolkitConnectedAccount(id="ca_123", status="ACTIVE"),
        )

        state = ToolkitConnectionState(
            slug="github",
            name="GitHub",
            is_no_auth=False,
            connection=connection,
            logo="https://example.com/logo.png",
        )

        assert state.slug == "github"
        assert state.name == "GitHub"
        assert state.connection.is_active is True
        assert state.connection.auth_config is not None
        assert state.connection.auth_config.id == "ac_123"


class TestToolRouterIntegration:
    """Integration tests for ToolRouter."""

    @patch("composio.core.models.tools.Tools")
    def test_full_session_workflow(self, mock_tools_class, tool_router, mock_client):
        """Test a complete session workflow."""
        # Setup
        mock_tools_instance = MagicMock()
        mock_tools_instance.get.return_value = ["tool1", "tool2"]
        mock_tools_class.return_value = mock_tools_instance

        # Create session
        session = tool_router.create(
            user_id="user_123", toolkits=["github", "slack"], manage_connections=True
        )

        assert session.session_id == "session_123"

        # Use authorize
        session.authorize("github")
        assert mock_client.tool_router.session.link.called

        # Use toolkits
        toolkits = session.toolkits()
        assert len(toolkits.items) == 2

        # Use tools
        tools = session.tools()
        assert tools == ["tool1", "tool2"]

    def test_create_and_use_same_session(self, tool_router, mock_client):
        """Test creating a session and then retrieving it."""
        # Create session
        created_session = tool_router.create(user_id="user_123")
        created_session_id = created_session.session_id

        # Setup retrieve to return the same session
        mock_client.tool_router.session.retrieve.return_value = (
            mock_client.tool_router.session.create.return_value
        )

        # Use the session
        retrieved_session = tool_router.use(session_id=created_session_id)

        assert created_session.session_id == retrieved_session.session_id
        assert created_session.mcp.url == retrieved_session.mcp.url
