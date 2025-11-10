"""
ToolRouter class for managing tool router sessions.

This module provides tool routing session management with enhanced functionality
for creating isolated MCP sessions with provider-wrapped tools.
"""

from __future__ import annotations

import typing as t
from dataclasses import dataclass

import typing_extensions as te

from composio.client import HttpClient
from composio.core.models.base import Resource
from composio.core.models.connected_accounts import ConnectionRequest
from composio.core.provider import TProvider
from composio.utils.uuid import generate_short_id

if t.TYPE_CHECKING:
    from composio.core.models.tools import Tools
    from composio.core.types import Modifiers

# Type aliases
AuthorizeFn = t.Callable[[str, t.Optional[str]], ConnectionRequest]
ConnectionsFn = t.Callable[[], t.Dict[str, t.Any]]


class ToolRouterToolkitsConfig(te.TypedDict, total=False):
    """Configuration for toolkit filtering in tool router session.
    
    Attributes:
        disabled: List of toolkit slugs to disable in the tool router session.
    """
    
    disabled: t.List[str]


class ToolRouterManageConnectionsConfig(te.TypedDict, total=False):
    """Configuration for connection management in tool router session.
    
    Attributes:
        enabled: Whether to use tools to manage connections. Defaults to True.
                If False, you need to manage connections manually.
        callback_url: Optional callback URL to use for OAuth redirects.
    """
    
    enabled: bool
    callback_url: str


@dataclass
class MCPServerConfig:
    """Configuration for MCP server."""

    type: str
    url: str


@dataclass
class ToolRouterSession(t.Generic[TProvider]):
    """
    Tool router session containing session information and helper functions.

    Attributes:
        session_id: Unique session identifier
        mcp: MCP server configuration
        tools: Function to get provider-wrapped tools
        authorize: Function to authorize a toolkit
        connections: Function to get connection states
    """

    session_id: str
    mcp: MCPServerConfig
    tools: t.Callable[[t.Optional[Modifiers]], t.Any]
    authorize: AuthorizeFn
    connections: ConnectionsFn


class ToolRouter(Resource, t.Generic[TProvider]):
    """
    ToolRouter class for managing tool routing sessions.

    Provides functionality to create isolated tool router sessions with provider-wrapped tools,
    authorization helpers, and connection management.

    Example:
        ```python
        from composio import Composio

        composio = Composio()
        tool_router = composio.tools.get_tool_router()

        # Create a session for a user
        session = await tool_router.create(
            user_id='user_123',
            config={
                'manage_connections': True
            }
        )

        # Get tools wrapped for the provider
        tools = session.tools()

        # Authorize a toolkit
        connection_request = await session.authorize('github')
        print(f"Redirect URL: {connection_request.redirect_url}")
        ```
    """

    def __init__(
        self,
        client: HttpClient,
        provider: t.Optional[TProvider] = None,
    ):
        """
        Initialize ToolRouter instance.

        :param client: HTTP client for API calls
        :param provider: Optional provider for tool wrapping
        """
        super().__init__(client)
        self._provider = provider

    def _create_authorize_fn(
        self, session_id: str, user_id: str
    ) -> AuthorizeFn:
        """
        Create an authorization function for the session.

        :param session_id: The session ID
        :param user_id: The user ID
        :return: Authorization function
        """

        def authorize_fn(
            toolkit: str,
            callback_url: t.Optional[str] = None,
        ) -> ConnectionRequest:
            """
            Authorize a toolkit for the user.

            :param toolkit: The toolkit to authorize
            :param callback_url: Optional callback URL for OAuth redirect
            :return: Connection request object
            """
            # Import here to avoid circular dependency
            from composio.core.models.toolkits import Toolkits

            toolkits_model = Toolkits(client=self._client)
            return toolkits_model.authorize(
                user_id=user_id,
                toolkit=toolkit,
            )

        return authorize_fn

    def _create_connections_fn(
        self, session_id: str, user_id: str
    ) -> ConnectionsFn:
        """
        Create a connections function for the session.

        :param session_id: The session ID
        :param user_id: The user ID
        :return: Connections function
        """

        def connections_fn() -> t.Dict[str, t.Any]:
            """
            Get connection states for the session.

            :return: Dictionary of toolkit connection states
            """
            # TODO: Implement network request to get connections
            # This should fetch connection states from the API
            return {}

        return connections_fn

    def _create_tools_fn(
        self,
        user_id: str,
        tools: t.List[t.Any],
    ) -> t.Callable[[t.Optional[Modifiers]], t.Any]:
        """
        Create a tools function that wraps tools for the provider.

        :param user_id: The user ID
        :param tools: List of raw tool objects
        :return: Function that returns provider-wrapped tools
        """
        from composio.core.models.tools import Tools as ToolsModel

        tools_model = ToolsModel(
            client=self._client,
            provider=self._provider,
        )

        def tools_fn(modifiers: t.Optional[Modifiers] = None) -> t.Any:
            """
            Get provider-wrapped tools for execution.

            :param modifiers: Optional execution modifiers
            :return: Provider-wrapped tools
            """
            # Get the tool slugs
            tool_slugs = [tool.slug for tool in tools]

            # Get and wrap tools for the provider
            return tools_model.get(
                user_id=user_id,
                tools=tool_slugs,
                modifiers=modifiers,
            )

        return tools_fn

    def _get_tool_router_tools(
        self, user_id: str, tool_slugs: t.List[str]
    ) -> t.List[t.Any]:
        """
        Get tool router tools by slugs.

        :param user_id: The user ID
        :param tool_slugs: List of tool slugs to retrieve
        :return: List of raw tool objects
        """
        from composio.core.models.tools import Tools as ToolsModel

        tools_model = ToolsModel(
            client=self._client,
            provider=self._provider,
        )

        return tools_model.get_raw_composio_tools(tools=tool_slugs)

    def create(
        self,
        user_id: str,
        toolkits: t.Optional[t.Union[t.List[str], ToolRouterToolkitsConfig]] = None,
        manage_connections: t.Optional[t.Union[bool, ToolRouterManageConnectionsConfig]] = None,
        auth_configs: t.Optional[t.Dict[str, str]] = None,
        connected_accounts: t.Optional[t.Dict[str, str]] = None,
    ) -> ToolRouterSession[TProvider]:
        """
        Create a new tool router session for a user.

        :param user_id: The user ID to create the session for
        :param toolkits: Optional list of toolkit slugs to enable, or config with disabled list.
                        If not provided, all toolkits are available.
                        Examples:
                        - ['github', 'slack'] - enable only these toolkits
                        - {'disabled': ['linear']} - disable specific toolkits
        :param manage_connections: Whether to include connection management tools.
                                  Can be a boolean or config object with 'enabled' and 'callback_url'.
                                  Defaults to None (connection management disabled).
                                  Examples:
                                  - True - enable with default settings
                                  - {'enabled': True, 'callback_url': 'https://...'}
        :param auth_configs: Optional mapping of toolkit slug to auth config ID.
                           Example: {'github': 'ac_xxx', 'slack': 'ac_yyy'}
        :param connected_accounts: Optional mapping of toolkit slug to connected account ID.
                                  Example: {'github': 'ca_xxx', 'slack': 'ca_yyy'}
        :return: Tool router session object

        Example:
            ```python
            # Create a basic session
            session = tool_router.create('user_123')

            # Create a session with specific toolkits
            session = tool_router.create(
                'user_123',
                toolkits=['github', 'slack']
            )

            # Create a session with connection management
            session = tool_router.create(
                'user_123',
                manage_connections=True
            )

            # Create a session with auth configs
            session = tool_router.create(
                'user_123',
                toolkits=['github'],
                auth_configs={'github': 'ac_xxx'}
            )

            # Use the session
            tools = session.tools()
            connection = session.authorize('github')
            ```
        """
        # Define tool router tool slugs 
        # Ideally the server will response with full tool specs
        tool_router_tool_slugs = [
            "COMPOSIO_SEARCH_TOOLS",
            "COMPOSIO_REMOTE_WORKBENCH",
            "COMPOSIO_MULTI_EXECUTE_TOOL",
            "COMPOSIO_REMOTE_BASH_TOOL",
        ]

        # Determine if connection management should be enabled
        connection_management_enabled = False
        callback_url: t.Optional[str] = None
        
        if manage_connections is not None:
            if isinstance(manage_connections, bool):
                connection_management_enabled = manage_connections
            else:
                # It's a ToolRouterManageConnectionsConfig dict
                connection_management_enabled = manage_connections.get("enabled", True)
                callback_url = manage_connections.get("callback_url")

        # Add connection management tool if requested
        if connection_management_enabled:
            tool_router_tool_slugs.append("COMPOSIO_MANAGE_CONNECTIONS")

        # Generate session ID
        session_id = generate_short_id()

        # Get the tools
        tools = self._get_tool_router_tools(user_id, tool_router_tool_slugs)

        # TODO: Handle toolkits filtering (enabled/disabled)
        # TODO: Handle auth_configs mapping
        # TODO: Handle connected_accounts mapping
        # These will be implemented when backend API supports them

        # Create and return the session
        return ToolRouterSession(
            session_id=session_id,
            mcp=MCPServerConfig(type="http", url="https://mcp.composio.com"),
            tools=self._create_tools_fn(user_id, tools),
            authorize=self._create_authorize_fn(session_id, user_id),
            connections=self._create_connections_fn(session_id, user_id),
        )


__all__ = [
    "ToolRouter",
    "ToolRouterSession",
    "ToolRouterToolkitsConfig",
    "ToolRouterManageConnectionsConfig",
    "MCPServerConfig",
]