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

if t.TYPE_CHECKING:
    from composio.core.types import Modifiers

# Type aliases
AuthorizeFn = t.Callable[[str, t.Optional[t.Dict[str, str]]], ConnectionRequest]
ToolkitsFn = t.Callable[[t.Optional[t.Dict[str, t.Any]]], "ToolkitConnectionsDetails"]


class ToolRouterToolkitsEnabledConfig(te.TypedDict, total=False):
    """Configuration for enabling specific toolkits in tool router session.

    Attributes:
        enabled: List of toolkit slugs to enable in the tool router session.
    """

    enabled: t.List[str]


class ToolRouterToolkitsDisabledConfig(te.TypedDict, total=False):
    """Configuration for disabling specific toolkits in tool router session.

    Attributes:
        disabled: List of toolkit slugs to disable in the tool router session.
    """

    disabled: t.List[str]


class ToolRouterToolsEnabledConfig(te.TypedDict, total=False):
    """Configuration for enabling specific tools in tool router session.

    Attributes:
        enabled: List of tool slugs to enable in the tool router session.
    """

    enabled: t.List[str]


class ToolRouterToolsDisabledConfig(te.TypedDict, total=False):
    """Configuration for disabling specific tools in tool router session.

    Attributes:
        disabled: List of tool slugs to disable in the tool router session.
        tags: Optional tags configuration to filter tools.
    """

    disabled: t.List[str]
    tags: t.Optional[t.Union[t.List[str], t.Dict[str, t.List[str]]]]


class ToolRouterManageConnectionsConfig(te.TypedDict, total=False):
    """Configuration for connection management in tool router session.

    Attributes:
        enabled: Whether to use tools to manage connections. Defaults to True.
                If False, you need to manage connections manually.
        callback_uri: Optional callback URI to use for OAuth redirects.
        infer_scopes_from_tools: Whether to infer scopes from tools in the tool router session.
                                Defaults to False.
    """

    enabled: bool
    callback_uri: str
    infer_scopes_from_tools: bool


@dataclass
class ToolkitConnectionAuthConfig:
    """Auth config information for a toolkit connection.

    Attributes:
        id: The id of the auth config
        mode: The auth scheme used by the auth config
        is_composio_managed: Whether the auth config is managed by Composio
    """

    id: str
    mode: str
    is_composio_managed: bool


@dataclass
class ToolkitConnectedAccount:
    """Connected account information for a toolkit.

    Attributes:
        id: The id of the connected account
        status: The status of the connected account
    """

    id: str
    status: str


@dataclass
class ToolkitConnection:
    """Connection information for a toolkit.

    Attributes:
        is_active: Whether the connection is active or not
        auth_config: The auth config of a toolkit
        connected_account: The connected account of a toolkit
    """

    is_active: bool
    auth_config: t.Optional[ToolkitConnectionAuthConfig] = None
    connected_account: t.Optional[ToolkitConnectedAccount] = None


@dataclass
class ToolkitConnectionState:
    """The connection state of a toolkit.

    Attributes:
        slug: The slug of a toolkit
        name: The name of a toolkit
        logo: The logo of a toolkit (optional)
        is_no_auth: Whether the toolkit is no auth or not
        connection: The connection information
    """

    slug: str
    name: str
    is_no_auth: bool
    connection: ToolkitConnection
    logo: t.Optional[str] = None


@dataclass
class ToolkitConnectionsDetails:
    """Details of toolkit connections.

    Attributes:
        items: List of toolkit connection states
        next_cursor: Optional cursor for pagination
        total_pages: Total number of pages
    """

    items: t.List[ToolkitConnectionState]
    total_pages: int
    next_cursor: t.Optional[str] = None


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
        toolkits: Function to get toolkit connection states
    """

    session_id: str
    mcp: MCPServerConfig
    tools: t.Callable[[t.Optional[Modifiers]], t.Any]
    authorize: AuthorizeFn
    toolkits: ToolkitsFn


class ToolRouter(Resource, t.Generic[TProvider]):
    """
    ToolRouter class for managing tool routing sessions.

    Provides functionality to create isolated tool router sessions with provider-wrapped tools,
    authorization helpers, and connection management.

    Example:
        ```python
        from composio import Composio

        composio = Composio()

        # Create a session for a user
        session = composio.tool_router.create(
            user_id='user_123',
            manage_connections=True
        )

        # Get tools wrapped for the provider
        tools = session.tools()

        # Authorize a toolkit
        connection_request = session.authorize('github')
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

    def _create_authorize_fn(self, session_id: str) -> AuthorizeFn:
        """
        Create an authorization function for the session.

        :param session_id: The session ID
        :return: Authorization function
        """

        def authorize_fn(
            toolkit: str,
            options: t.Optional[t.Dict[str, str]] = None,
        ) -> ConnectionRequest:
            """
            Authorize a toolkit for the user.

            :param toolkit: The toolkit to authorize
            :param options: Optional options dict with 'callback_url' key for OAuth redirect
            :return: Connection request object
            """
            # Make API call to create authorization link
            response = self._client.tool_router.session.link(
                session_id=session_id,
                toolkit=toolkit,
                **(options or {}),
            )

            # Return connection request with redirect URL
            return ConnectionRequest(
                connected_account_id=response.connected_account_id,
                redirect_url=response.redirect_url,
                status="INITIATED",
                _client=self._client,
            )

        return authorize_fn

    def _create_toolkits_fn(self, session_id: str) -> ToolkitsFn:
        """
        Create a toolkits function for the session.

        :param session_id: The session ID
        :return: Toolkits function
        """

        def toolkits_fn(
            options: t.Optional[t.Dict[str, t.Any]] = None,
        ) -> ToolkitConnectionsDetails:
            """
            Get toolkit connection states for the session.

            :param options: Optional dict with 'next_cursor' and 'limit' keys
            :return: Toolkit connections details with items, next_cursor, and total_pages
            """
            options = options or {}
            result = self._client.tool_router.session.toolkits(
                session_id=session_id,
                cursor=options.get("next_cursor"),
                limit=options.get("limit"),
            )

            # Transform the result to match the expected format
            toolkit_states: t.List[ToolkitConnectionState] = []
            for item in result.items:
                connected_account = item.get("connected_account")
                auth_config: t.Optional[ToolkitConnectionAuthConfig] = None
                connected_acc: t.Optional[ToolkitConnectedAccount] = None

                if connected_account:
                    if connected_account.get("auth_config"):
                        auth_config = ToolkitConnectionAuthConfig(
                            id=connected_account["auth_config"]["id"],
                            mode=connected_account["auth_config"]["auth_scheme"],
                            is_composio_managed=connected_account["auth_config"][
                                "is_composio_managed"
                            ],
                        )
                    connected_acc = ToolkitConnectedAccount(
                        id=connected_account["id"],
                        status=connected_account["status"],
                    )

                connection = ToolkitConnection(
                    is_active=(
                        connected_account.get("status") == "ACTIVE"
                        if connected_account
                        else False
                    ),
                    auth_config=auth_config,
                    connected_account=connected_acc,
                )

                toolkit_state = ToolkitConnectionState(
                    slug=item["slug"],
                    name=item["name"],
                    logo=item.get("meta", {}).get("logo"),
                    is_no_auth=False,
                    connection=connection,
                )
                toolkit_states.append(toolkit_state)

            return ToolkitConnectionsDetails(
                items=toolkit_states,
                next_cursor=result.next_cursor,
                total_pages=result.total_pages,
            )

        return toolkits_fn

    def _create_tools_fn(
        self,
        user_id: str,
        tool_slugs: t.List[str],
    ) -> t.Callable[[t.Optional[Modifiers]], t.Any]:
        """
        Create a tools function that wraps tools for the provider.

        :param user_id: The user ID
        :param tool_slugs: List of tool slugs to wrap
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
            router_tools = tools_model.get(
                user_id=user_id, tools=tool_slugs, modifiers=modifiers
            )
            return router_tools

        return tools_fn

    def create(
        self,
        user_id: str,
        toolkits: t.Optional[
            t.Union[
                t.List[str],
                ToolRouterToolkitsEnabledConfig,
                ToolRouterToolkitsDisabledConfig,
            ]
        ] = None,
        tools: t.Optional[
            t.Union[
                t.List[str],
                ToolRouterToolsEnabledConfig,
                ToolRouterToolsDisabledConfig,
            ]
        ] = None,
        manage_connections: t.Optional[
            t.Union[bool, ToolRouterManageConnectionsConfig]
        ] = None,
        auth_configs: t.Optional[t.Dict[str, str]] = None,
        connected_accounts: t.Optional[t.Dict[str, str]] = None,
    ) -> ToolRouterSession[TProvider]:
        """
        Create a new tool router session for a user.

        :param user_id: The user ID to create the session for
        :param toolkits: Optional list of toolkit slugs or dict with 'enabled'/'disabled' key.
                        - List: ['github', 'slack'] - enable only these toolkits
                        - Dict: {'enabled': ['github']} or {'disabled': ['linear']}
        :param tools: Optional list of tool slugs or dict with 'enabled'/'disabled' key.
                     - List: ['GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER']
                     - Dict: {'enabled': [...]} or {'disabled': [...]}
        :param manage_connections: Whether to enable connection management tools.
                                  - Boolean: True/False
                                  - Dict with keys: 'enabled', 'callback_uri', 'infer_scopes_from_tools'
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

            # Create a session with enabled toolkits
            session = tool_router.create(
                'user_123',
                toolkits={'enabled': ['github', 'slack']}
            )

            # Create a session with disabled toolkits
            session = tool_router.create(
                'user_123',
                toolkits={'disabled': ['linear']}
            )

            # Create a session with connection management
            session = tool_router.create(
                'user_123',
                manage_connections=True
            )

            # Create a session with advanced connection management
            session = tool_router.create(
                'user_123',
                manage_connections={
                    'enabled': True,
                    'callback_uri': 'https://example.com/callback',
                    'infer_scopes_from_tools': True
                }
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
            toolkit_states = session.toolkits()
            ```
        """

        # Parse manage_connections config
        manage_connections = (
            manage_connections if manage_connections is not None else True
        )
        auto_manage_connections = (
            manage_connections
            if isinstance(manage_connections, bool)
            else manage_connections.get("enabled", True)
        )

        # Parse toolkits config
        toolkits_payload = None
        if toolkits is not None:
            if isinstance(toolkits, list):
                toolkits_payload = {"enabled": toolkits}
            else:
                toolkits_payload = toolkits

        # Parse tools config
        tools_payload = None
        if tools is not None:
            if isinstance(tools, list):
                tools_payload = {"enabled": tools}
            else:
                tools_payload = tools

        # Parse infer_scopes_from_tools
        infer_scopes_from_tools = (
            manage_connections.get("infer_scopes_from_tools", False)
            if isinstance(manage_connections, dict)
            else False
        )

        # Parse callback_uri
        callback_uri = (
            manage_connections.get("callback_uri")
            if isinstance(manage_connections, dict)
            else None
        )

        # Build the API payload
        payload = {
            "user_id": user_id,
            "connections": {
                "auto_manage_connections": auto_manage_connections,
                "auth_config_overrides": auth_configs or {},
                "connected_account_overrides": connected_accounts or {},
                "infer_scopes_from_tools": infer_scopes_from_tools,
            },
        }

        if toolkits_payload is not None:
            payload["toolkits"] = toolkits_payload

        if tools_payload is not None:
            payload["tools"] = tools_payload

        if callback_uri is not None:
            payload["connections"]["callback_uri"] = callback_uri

        # Make API call to create session
        session = self._client.tool_router.session.create(**payload)

        # Create and return the session
        return ToolRouterSession(
            session_id=session.session_id,
            mcp=MCPServerConfig(
                type=session.mcp.type.upper(),
                url=session.mcp.url,
            ),
            tools=self._create_tools_fn(user_id, session.tool_router_tools),
            authorize=self._create_authorize_fn(session.session_id),
            toolkits=self._create_toolkits_fn(session.session_id),
        )


__all__ = [
    "ToolRouter",
    "ToolRouterSession",
    "ToolRouterToolkitsEnabledConfig",
    "ToolRouterToolkitsDisabledConfig",
    "ToolRouterToolsEnabledConfig",
    "ToolRouterToolsDisabledConfig",
    "ToolRouterManageConnectionsConfig",
    "ToolkitConnectionState",
    "ToolkitConnectionsDetails",
    "MCPServerConfig",
]
