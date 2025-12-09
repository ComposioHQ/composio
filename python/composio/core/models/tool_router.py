"""
ToolRouter class for managing tool router sessions.

This module provides tool routing session management with enhanced functionality
for creating isolated MCP sessions with provider-wrapped tools.
"""

from __future__ import annotations

import typing as t
from dataclasses import dataclass
from enum import Enum

from composio_client import omit
import typing_extensions as te

from composio.client import HttpClient
from composio.core.models.base import Resource
from composio.core.models.connected_accounts import ConnectionRequest
from composio.core.provider import TProvider

if t.TYPE_CHECKING:
    from composio.core.models._modifiers import Modifiers

# Type aliases
AuthorizeFn = t.Callable[..., ConnectionRequest]


ToolkitsFn = t.Callable[
    ...,
    "ToolkitConnectionsDetails",
]


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


class ToolRouterToolsOverrideEnabledConfig(te.TypedDict, total=False):
    """Configuration for enabling specific tools for a toolkit.

    Attributes:
        enabled: List of tool slugs to enable for this toolkit.
    """

    enabled: t.List[str]


class ToolRouterToolsOverrideDisabledConfig(te.TypedDict, total=False):
    """Configuration for disabling specific tools for a toolkit.

    Attributes:
        disabled: List of tool slugs to disable for this toolkit.
    """

    disabled: t.List[str]


class ToolRouterToolsTagsEnabledConfig(te.TypedDict, total=False):
    """Configuration for enabling tools by tags.

    Attributes:
        enabled: List of tags - tools with at least one of these tags will be included.
    """

    enabled: t.List[str]


class ToolRouterToolsTagsDisabledConfig(te.TypedDict, total=False):
    """Configuration for disabling tools by tags.

    Attributes:
        disabled: List of tags - tools with any of these tags will be excluded.
    """

    disabled: t.List[str]


class ToolRouterToolsConfig(te.TypedDict, total=False):
    """Configuration for tools in tool router session.

    Attributes:
        overrides: Per-toolkit tool overrides. Key is toolkit slug, value is list of tools
                  or dict with 'enabled'/'disabled' key.
                  Example: {'gmail': ['GMAIL_SEND_EMAIL'], 'github': {'enabled': [...]}}
        tags: Tag-based filtering. Can be a list of tags to include, or dict with
             'enabled'/'disabled' key.
             Example: ['important', 'safe'] or {'enabled': ['important']} or {'disabled': ['dangerous']}
    """

    overrides: t.Dict[
        str,
        t.Union[
            t.List[str],
            ToolRouterToolsOverrideEnabledConfig,
            ToolRouterToolsOverrideDisabledConfig,
        ],
    ]
    tags: t.Union[
        t.List[str],
        ToolRouterToolsTagsEnabledConfig,
        ToolRouterToolsTagsDisabledConfig,
    ]


class ToolRouterExecutionConfig(te.TypedDict, total=False):
    """Configuration for execution settings in tool router session.

    Attributes:
        proxy_execution_enabled: Whether to allow proxy execute calls in the workbench.
                                If False, prevents arbitrary HTTP requests.
        timeout_seconds: Maximum execution time for workbench operations in seconds.
    """

    proxy_execution_enabled: bool
    timeout_seconds: int


class ToolRouterManageConnectionsConfig(te.TypedDict, total=False):
    """Configuration for connection management in tool router session.

    Attributes:
        enabled: Whether to use tools to manage connections. Defaults to True.
                If False, you need to manage connections manually.
        callback_uri: Optional callback URL to use for OAuth redirects.
        infer_scopes_from_tools: Whether to infer scopes from tools in the tool router session.
                                Defaults to False.
    """

    enabled: bool
    callback_url: str
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
    connection: t.Optional[ToolkitConnection] = None
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


class ToolRouterMCPServerType(str, Enum):
    """Enum for MCP server types."""

    HTTP = "http"
    SSE = "sse"


@dataclass
class ToolRouterMCPServerConfig:
    """Configuration for MCP server.

    Attributes:
        type: The type of MCP server (HTTP or SSE)
        url: The URL of the MCP server
        headers: Optional authentication headers (includes x-api-key)
    """

    type: ToolRouterMCPServerType
    url: str
    headers: t.Optional[t.Dict[str, t.Optional[str]]] = None


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
    mcp: ToolRouterMCPServerConfig
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

    def _create_mcp_server_config(
        self,
        mcp_type: ToolRouterMCPServerType,
        url: str,
    ) -> ToolRouterMCPServerConfig:
        """
        Create an MCP server config object with authentication headers.

        :param mcp_type: The type of MCP server (HTTP or SSE)
        :param url: The URL of the MCP server
        :return: MCP server config with headers
        """
        return ToolRouterMCPServerConfig(
            type=mcp_type,
            url=url,
            headers={
                "x-api-key": self._client.api_key,
            },
        )

    def _create_authorize_fn(self, session_id: str) -> AuthorizeFn:
        """
        Create an authorization function for the session.

        :param session_id: The session ID
        :return: Authorization function
        """

        def authorize_fn(
            toolkit: str,
            *,
            callback_url: t.Optional[str] = None,
        ) -> ConnectionRequest:
            """
            Authorize a toolkit for the user and get a connection request.

            This method initiates the OAuth flow for a toolkit and returns a
            ConnectionRequest object containing the redirect URL for user authorization.

            Args:
                toolkit: The toolkit slug to authorize (e.g., 'github', 'slack', 'gmail')
                callback_url: Optional URL to redirect user after OAuth authorization completes.
                    Use this to redirect users back to your application after they authorize.

            Returns:
                ConnectionRequest: Object containing:
                    - id: The connected account ID
                    - redirect_url: URL to redirect user for OAuth authorization
                    - status: Connection status ('INITIATED')
                    - wait_for_connection(): Method to poll until connection is active

            Example:
                ```python
                # Basic authorization
                connection = session.authorize('github')
                print(f"Redirect user to: {connection.redirect_url}")

                # With custom callback URL
                connection = session.authorize(
                    'slack',
                    callback_url='https://myapp.com/oauth/callback'
                )

                # Wait for user to complete authorization
                connected_account = connection.wait_for_connection(timeout=300)
                print(f"Connected! Account ID: {connected_account.id}")
                ```
            """
            response = self._client.tool_router.session.link(
                session_id=session_id,
                toolkit=toolkit,
                callback_url=callback_url if callback_url else omit,
            )

            # Return connection request with redirect URL
            return ConnectionRequest(
                id=response.connected_account_id,
                redirect_url=response.redirect_url,
                status="INITIATED",
                client=self._client,
            )

        return authorize_fn

    def _create_toolkits_fn(self, session_id: str) -> ToolkitsFn:
        """
        Create a toolkits function for the session.

        :param session_id: The session ID
        :return: Toolkits function
        """

        def toolkits_fn(
            *,
            toolkits: t.Optional[t.List[str]] = None,
            next_cursor: t.Optional[str] = None,
            limit: t.Optional[int] = None,
            is_connected: t.Optional[bool] = None,
        ) -> ToolkitConnectionsDetails:
            """
            Get toolkit connection states for the session.

            Retrieves information about toolkits available in this session, including
            their connection status, auth configuration, and metadata.

            Args:
                toolkits: List of toolkit slugs to filter by (e.g., ['github', 'slack']).
                    If None, returns all toolkits in the session.
                next_cursor: Cursor for pagination to fetch the next page of results.
                    Use the `next_cursor` from a previous response to get more results.
                limit: Maximum number of toolkit items to return per page.
                is_connected: Filter by connection status:
                    - True: Only return toolkits with active connections
                    - False: Only return toolkits without active connections
                    - None: Return all toolkits regardless of connection status

            Returns:
                ToolkitConnectionsDetails: Object containing:
                    - items: List of ToolkitConnectionState objects with:
                        - slug: Toolkit identifier (e.g., 'github')
                        - name: Display name (e.g., 'GitHub')
                        - logo: URL to toolkit logo
                        - is_no_auth: Whether toolkit requires no authentication
                        - connection: Connection details (is_active, auth_config, connected_account)
                    - next_cursor: Cursor for fetching next page (None if no more pages)
                    - total_pages: Total number of pages available

            Example:
                ```python
                # Get all toolkits in the session
                result = session.toolkits()
                for toolkit in result.items:
                    status = "Connected" if toolkit.connection and toolkit.connection.is_active else "Not connected"
                    print(f"{toolkit.name}: {status}")

                # Filter by specific toolkits
                result = session.toolkits(toolkits=['github', 'slack', 'gmail'])

                # Get only connected toolkits
                connected = session.toolkits(is_connected=True)
                print(f"You have {len(connected.items)} connected toolkits")

                # Get only disconnected toolkits (need authorization)
                disconnected = session.toolkits(is_connected=False)
                for toolkit in disconnected.items:
                    print(f"Please connect: {toolkit.name}")

                # Pagination example
                result = session.toolkits(limit=10)
                all_toolkits = list(result.items)
                while result.next_cursor:
                    result = session.toolkits(limit=10, next_cursor=result.next_cursor)
                    all_toolkits.extend(result.items)
                ```
            """
            toolkits_params: t.Dict[str, t.Any] = {}

            if next_cursor is not None:
                toolkits_params["cursor"] = next_cursor
            if limit is not None:
                toolkits_params["limit"] = limit
            if toolkits is not None:
                toolkits_params["toolkits"] = toolkits
            if is_connected is not None:
                toolkits_params["is_connected"] = is_connected

            result = self._client.tool_router.session.toolkits(
                session_id=session_id,
                **toolkits_params,
            )

            # Transform the result to match the expected format
            toolkit_states: t.List[ToolkitConnectionState] = []
            for item in result.items:
                connected_account = item.connected_account
                auth_config: t.Optional[ToolkitConnectionAuthConfig] = None
                connected_acc: t.Optional[ToolkitConnectedAccount] = None

                if connected_account:
                    if connected_account.auth_config:
                        auth_config = ToolkitConnectionAuthConfig(
                            id=connected_account.auth_config.id,
                            mode=connected_account.auth_config.auth_scheme,
                            is_composio_managed=connected_account.auth_config.is_composio_managed,
                        )
                    connected_acc = ToolkitConnectedAccount(
                        id=connected_account.id,
                        status=connected_account.status,
                    )

                connection = (
                    None
                    if item.is_no_auth
                    else ToolkitConnection(
                        is_active=(
                            connected_account.status == "ACTIVE"
                            if connected_account
                            else False
                        ),
                        auth_config=auth_config,
                        connected_account=connected_acc,
                    )
                )

                toolkit_state = ToolkitConnectionState(
                    slug=item.slug,
                    name=item.name,
                    logo=item.meta.logo if item.meta else None,
                    is_no_auth=item.is_no_auth if item.is_no_auth else False,
                    connection=connection,
                )
                toolkit_states.append(toolkit_state)

            return ToolkitConnectionsDetails(
                items=toolkit_states,
                next_cursor=result.next_cursor,
                total_pages=int(result.total_pages),
            )

        return toolkits_fn

    def _create_tools_fn(
        self,
        user_id: str,
        tool_slugs: t.Sequence[str],
    ) -> t.Callable[[t.Optional[Modifiers]], t.Any]:
        """
        Create a tools function that wraps tools for the provider.

        :param user_id: The user ID
        :param tool_slugs: List of tool slugs to wrap
        :return: Function that returns provider-wrapped tools
        """
        from composio.core.models.tools import Tools as ToolsModel

        if self._provider is None:
            raise ValueError(
                "Provider is required for tool router. "
                "Please initialize ToolRouter with a provider."
            )

        tools_model = ToolsModel(
            client=self._client,
            provider=self._provider,
        )

        def tools_fn(modifiers: t.Optional[Modifiers] = None) -> t.Any:
            """
            Get provider-wrapped tools for execution with your AI framework.

            Returns tools configured for this session, wrapped in the format expected
            by your AI provider (OpenAI, Anthropic, LangChain, etc.). The tools are
            ready to be passed directly to your AI model for function calling.

            Args:
                modifiers: Optional execution modifiers to customize tool behavior:
                    - Custom pre/post processing hooks
                    - Schema modifications
                    - Execution callbacks

            Returns:
                Provider-wrapped tools in the format expected by your AI framework.
                The exact type depends on the provider configured during initialization.

            Example:
                ```python
                # Basic usage - get tools for your AI model
                tools = session.tools()

                # Use with OpenAI
                from openai import OpenAI
                client = OpenAI()

                response = client.chat.completions.create(
                    model="gpt-4",
                    messages=[{"role": "user", "content": "Star the composio repo"}],
                    tools=tools,
                )

                # Use with Anthropic
                from anthropic import Anthropic
                client = Anthropic()

                response = client.messages.create(
                    model="claude-3-opus-20240229",
                    messages=[{"role": "user", "content": "Send an email"}],
                    tools=tools,
                )

                # With custom modifiers
                tools = session.tools(modifiers={
                    'pre_execute': lambda tool, args: print(f"Executing {tool}"),
                    'post_execute': lambda tool, result: print(f"Result: {result}"),
                })
                ```

            Note:
                The tools returned are specific to this session and user. They include
                only the tools enabled for this session based on the configuration
                provided during session creation.
            """
            router_tools = tools_model.get(
                user_id=user_id, tools=list(tool_slugs), modifiers=modifiers
            )
            return router_tools

        return tools_fn

    def create(
        self,
        *,
        user_id: str,
        toolkits: t.Optional[
            t.Union[
                t.List[str],
                ToolRouterToolkitsEnabledConfig,
                ToolRouterToolkitsDisabledConfig,
            ]
        ] = None,
        tools: t.Optional[ToolRouterToolsConfig] = None,
        manage_connections: t.Optional[
            t.Union[bool, ToolRouterManageConnectionsConfig]
        ] = None,
        auth_configs: t.Optional[t.Dict[str, str]] = None,
        connected_accounts: t.Optional[t.Dict[str, str]] = None,
        execution: t.Optional[ToolRouterExecutionConfig] = None,
    ) -> ToolRouterSession[TProvider]:
        """
        Create a new tool router session for a user.

        :param user_id: The user ID to create the session for
        :param toolkits: Optional list of toolkit slugs or dict with 'enabled'/'disabled' key.
                        - List: ['github', 'slack'] - enable only these toolkits
                        - Dict: {'enabled': ['github']} or {'disabled': ['linear']}
        :param tools: Optional dict with 'overrides' and/or 'tags' for tool-level configuration.
                     - overrides: Per-toolkit tool enable/disable
                       Example: {'gmail': ['GMAIL_SEND_EMAIL'], 'github': {'enabled': [...]}}
                     - tags: Tag-based filtering
                       Example: ['important'] or {'enabled': ['safe']} or {'disabled': ['dangerous']}
        :param manage_connections: Whether to enable connection management tools.
                                  - Boolean: True/False
                                  - Dict with keys: 'enabled', 'callback_url', 'infer_scopes_from_tools'
        :param auth_configs: Optional mapping of toolkit slug to auth config ID.
                           Example: {'github': 'ac_xxx', 'slack': 'ac_yyy'}
        :param connected_accounts: Optional mapping of toolkit slug to connected account ID.
                                  Example: {'github': 'ca_xxx', 'slack': 'ca_yyy'}
        :param execution: Optional execution configuration.
                         - proxy_execution_enabled: Whether to allow proxy execute calls
                         - timeout_seconds: Maximum execution time in seconds
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

            # Create a session with tool overrides
            session = tool_router.create(
                'user_123',
                tools={
                    'overrides': {
                        'gmail': ['GMAIL_SEND_EMAIL', 'GMAIL_SEARCH'],
                        'github': {'enabled': ['GITHUB_CREATE_ISSUE']}
                    },
                    'tags': ['safe', 'important']
                }
            )

            # Create a session with tag filtering
            session = tool_router.create(
                'user_123',
                tools={
                    'tags': {'enabled': ['read_only_hint', 'non_destructive_hint']}
                }
            )

            # Create a session with connection management
            session = tool_router.create(
                'user_123',
                manage_connections={
                    'enabled': True,
                    'callback_url': 'https://example.com/callback',
                    'infer_scopes_from_tools': True
                }
            )

            # Create a session with execution config
            session = tool_router.create(
                'user_123',
                execution={
                    'proxy_execution_enabled': False,
                    'timeout_seconds': 300
                }
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
        toolkits_payload: t.Optional[t.Dict[str, t.List[str]]] = None
        if toolkits is not None:
            if isinstance(toolkits, list):
                toolkits_payload = {"enabled": toolkits}
            else:
                toolkits_payload = t.cast(t.Dict[str, t.List[str]], toolkits)

        # Parse tools config - transform to API format
        tools_payload = None
        if tools is not None:
            tools_payload = {}

            # Handle overrides
            if "overrides" in tools:
                overrides_dict: t.Dict[str, t.Any] = {}
                for toolkit_slug, override_value in tools["overrides"].items():
                    if isinstance(override_value, list):
                        # Simple list means enabled tools
                        overrides_dict[toolkit_slug] = {"enabled": override_value}
                    else:
                        # Already in dict format with 'enabled' or 'disabled'
                        overrides_dict[toolkit_slug] = dict(override_value)

                tools_payload["overrides"] = overrides_dict

            # Handle tags
            if "tags" in tools:
                tags_value = tools["tags"]
                tag_filters: t.Dict[str, t.List[str]] = {}

                if isinstance(tags_value, list):
                    # Simple list means include these tags
                    tag_filters = {"include": tags_value}
                elif isinstance(tags_value, dict):
                    # Check which key exists in the dict
                    tags_dict = t.cast(t.Dict[str, t.List[str]], tags_value)
                    if "enabled" in tags_dict:
                        # enabled means include
                        tag_filters = {"include": tags_dict["enabled"]}
                    elif "disabled" in tags_dict:
                        # disabled means exclude
                        tag_filters = {"exclude": tags_dict["disabled"]}

                if tag_filters:
                    tools_payload["filters"] = {"tags": tag_filters}

        # Parse infer_scopes_from_tools
        infer_scopes_from_tools = (
            manage_connections.get("infer_scopes_from_tools", False)
            if isinstance(manage_connections, dict)
            else False
        )

        # Parse callback_uri
        callback_url = (
            manage_connections.get("callback_url")
            if isinstance(manage_connections, dict)
            else omit
        )

        # Build the API payload
        create_params: t.Dict[str, t.Any] = {
            "user_id": user_id,
        }

        # Build connections config
        connections_config: t.Dict[str, t.Any] = {
            "auto_manage_connections": auto_manage_connections,
            "infer_scopes_from_tools": infer_scopes_from_tools,
        }
        if callback_url is not None and callback_url is not omit:
            connections_config["callback_url"] = callback_url

        create_params["connections"] = connections_config

        # Add optional fields
        if auth_configs is not None:
            create_params["auth_configs"] = auth_configs

        if connected_accounts is not None:
            create_params["connected_accounts"] = connected_accounts

        if toolkits_payload is not None:
            create_params["toolkits"] = toolkits_payload

        if tools_payload:
            create_params["tools"] = tools_payload

        if execution is not None:
            execution_payload: t.Dict[str, t.Any] = {}
            if "proxy_execution_enabled" in execution:
                execution_payload["proxy_execution_enabled"] = execution[
                    "proxy_execution_enabled"
                ]
            if "timeout_seconds" in execution:
                execution_payload["timeout_seconds"] = int(execution["timeout_seconds"])

            if execution_payload:
                create_params["execution"] = execution_payload

        # Make API call to create session
        session = self._client.tool_router.session.create(**create_params)

        # Create and return the session
        return ToolRouterSession(
            session_id=session.session_id,
            mcp=self._create_mcp_server_config(
                mcp_type=ToolRouterMCPServerType(session.mcp.type.lower()),
                url=session.mcp.url,
            ),
            tools=self._create_tools_fn(user_id, session.tool_router_tools),
            authorize=self._create_authorize_fn(session.session_id),
            toolkits=self._create_toolkits_fn(session.session_id),
        )

    def use(self, session_id: str) -> ToolRouterSession[TProvider]:
        """
        Retrieve and use an existing tool router session.

        :param session_id: The session ID to retrieve
        :return: Tool router session object

        Example:
            ```python
            from composio import Composio

            composio = Composio()
            tool_router = composio.tool_router

            # Retrieve an existing session
            session = tool_router.use('session_123')

            # Use the session
            tools = session.tools()
            connection = session.authorize('github')
            toolkit_states = session.toolkits()
            ```
        """
        # Retrieve the session from the API
        session = self._client.tool_router.session.retrieve(session_id)

        # Extract user_id from session config
        user_id = session.config.user_id

        # Create and return the session
        return ToolRouterSession(
            session_id=session.session_id,
            mcp=self._create_mcp_server_config(
                mcp_type=ToolRouterMCPServerType(session.mcp.type.lower()),
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
    "ToolRouterToolsOverrideEnabledConfig",
    "ToolRouterToolsOverrideDisabledConfig",
    "ToolRouterToolsTagsEnabledConfig",
    "ToolRouterToolsTagsDisabledConfig",
    "ToolRouterToolsConfig",
    "ToolRouterManageConnectionsConfig",
    "ToolRouterExecutionConfig",
    "ToolkitConnectionState",
    "ToolkitConnectionsDetails",
    "ToolRouterMCPServerConfig",
    "ToolRouterMCPServerType",
]
