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
from composio_client.types.tool_router import session_create_params
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


class ToolsFn(t.Protocol):
    """Protocol for the tools function that returns provider-wrapped tools."""

    def __call__(self, modifiers: t.Optional["Modifiers"] = None) -> t.Any:
        """Get provider-wrapped tools for execution with your AI framework."""
        ...


# Type alias for MCP tag literals
ToolRouterTag = t.Literal[
    "readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"
]


class ToolRouterToolkitsEnableConfig(te.TypedDict, total=False):
    """Configuration for enabling specific toolkits in tool router session.

    Attributes:
        enable: List of toolkit slugs to enable in the tool router session.
    """

    enable: t.List[str]


class ToolRouterToolkitsDisableConfig(te.TypedDict, total=False):
    """Configuration for disabling specific toolkits in tool router session.

    Attributes:
        disable: List of toolkit slugs to disable in the tool router session.
    """

    disable: t.List[str]


class ToolRouterToolsEnableConfig(te.TypedDict, total=False):
    """Configuration for enabling specific tools for a toolkit.

    Attributes:
        enable: List of tool slugs to enable for this toolkit.
    """

    enable: t.List[str]


class ToolRouterToolsDisableConfig(te.TypedDict, total=False):
    """Configuration for disabling specific tools for a toolkit.

    Attributes:
        disable: List of tool slugs to disable for this toolkit.
    """

    disable: t.List[str]


class ToolRouterToolsTagsConfig(te.TypedDict, total=False):
    """Configuration for filtering tools by MCP tags.

    Attributes:
        tags: Tags configuration - can be a list of tags (shorthand for enable)
              or an object with enable/disable keys.
              Only tools matching these tags will be available.
    """

    tags: ToolRouterConfigTags


# Type alias for per-toolkit tool configuration
# Can be:
# - List[str]: List of tool slugs (shorthand for enable)
# - ToolRouterToolsEnableConfig: Dict with 'enable' key (whitelist)
# - ToolRouterToolsDisableConfig: Dict with 'disable' key (blacklist)
# - ToolRouterToolsTagsConfig: Dict with 'tags' key (filter by MCP tags)
ToolRouterToolsConfig = t.Union[
    t.List[str],
    ToolRouterToolsEnableConfig,
    ToolRouterToolsDisableConfig,
    ToolRouterToolsTagsConfig,
]


class ToolRouterTagsEnableDisableConfig(te.TypedDict, total=False):
    """Configuration for tags in tool router session.

    Attributes:
        enable: List of tags to enable in the tool router session.
        disable: List of tags to disable in the tool router session.
    """

    enable: t.Optional[t.List[ToolRouterTag]]
    disable: t.Optional[t.List[ToolRouterTag]]


# Type alias for tags configuration
# Can be:
# - List[ToolRouterTag]: List of tag literals (shorthand for enable)
# - ToolRouterTagsEnableDisableConfig: Dict with 'enable' and/or 'disable' keys
ToolRouterConfigTags = t.Union[
    t.List[ToolRouterTag],
    ToolRouterTagsEnableDisableConfig,
]


def _is_tools_tags_config(
    config: ToolRouterToolsConfig,
) -> t.TypeGuard[ToolRouterToolsTagsConfig]:
    """Type guard to check if config is ToolRouterToolsTagsConfig."""
    return isinstance(config, dict) and "tags" in config


class ToolRouterWorkbenchConfig(te.TypedDict, total=False):
    """Configuration for workbench settings in tool router session.

    Attributes:
        enable_proxy_execution: Whether to allow proxy execute calls in the workbench.
                                If False, prevents arbitrary HTTP requests.
        auto_offload_threshold: Maximum execution payload size to offload to workbench.
    """

    enable_proxy_execution: bool
    auto_offload_threshold: int


class ToolRouterManageConnectionsConfig(te.TypedDict, total=False):
    """Configuration for connection management in tool router session.

    Attributes:
        enable: Whether to use tools to manage connections. Defaults to True.
                If False, you need to manage connections manually.
        callback_url: Optional callback URL to use for OAuth redirects.
    """

    enable: bool
    callback_url: str


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
    tools: ToolsFn
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
            search: t.Optional[str] = None,
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
                search: Search term to filter toolkits by name.
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
            if search is not None:
                toolkits_params["search"] = search

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
        session_id: str,
        tool_slugs: t.Sequence[str],
    ) -> ToolsFn:
        """
        Create a tools function that wraps tools for the provider.

        :param session_id: The session ID
        :param tool_slugs: List of tool slugs to wrap
        :return: Function that returns provider-wrapped tools
        """
        from composio.core.models._modifiers import apply_modifier_by_type
        from composio.core.models.tools import Tool, Tools as ToolsModel
        from composio.core.provider import AgenticProvider, NonAgenticProvider

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
                The tools returned are specific to this session. They include
                only the tools enabled for this session based on the configuration
                provided during session creation.
            """
            # Get raw tool schemas
            router_tools = tools_model.get_raw_composio_tools(tools=list(tool_slugs))

            # Apply schema modifiers
            if modifiers is not None:
                type_schema: t.Literal["schema"] = "schema"
                router_tools = [
                    apply_modifier_by_type(
                        modifiers=modifiers,
                        toolkit=tool.toolkit.slug if tool.toolkit else "unknown",
                        tool=tool.slug,
                        type=type_schema,
                        schema=t.cast(Tool, tool),
                    )
                    for tool in router_tools
                ]

            # Process file schemas
            for tool in router_tools:
                tool.input_parameters = (
                    tools_model._file_helper.process_schema_recursively(
                        schema=tool.input_parameters,
                    )
                )

            # Wrap tools with provider
            if issubclass(type(self._provider), NonAgenticProvider):
                return t.cast(NonAgenticProvider, self._provider).wrap_tools(
                    tools=router_tools
                )

            return t.cast(AgenticProvider, self._provider).wrap_tools(
                tools=router_tools,
                execute_tool=tools_model._wrap_execute_tool_for_tool_router(
                    session_id=session_id,
                    modifiers=modifiers,
                ),
            )

        return tools_fn

    def _transform_tags_params(
        self, tags: t.Optional[ToolRouterConfigTags]
    ) -> t.Optional[session_create_params.TagsUnionMember1]:
        """Transform tags configuration to API format.

        Args:
            tags: Tags configuration - can be a list (shorthand for enable)
                  or an object with enable/disable keys.

        Returns:
            Transformed tags payload in API format, or None if tags is None.
        """
        if tags is None:
            return None

        if isinstance(tags, list):
            # List shorthand means enable these tags
            # Return value structure matches TagsUnionMember1: {"enable": [...]}
            return {"enable": tags}
        elif isinstance(tags, dict):
            # Object format with enable/disable
            # Only include keys that are present and not None
            # Return value structure matches TagsUnionMember1
            enable_value = tags.get("enable")
            disable_value = tags.get("disable")

            # Build result dict only with non-None values
            if enable_value is not None and disable_value is not None:
                return {
                    "enable": enable_value,
                    "disable": disable_value,
                }
            elif enable_value is not None:
                return {"enable": enable_value}
            elif disable_value is not None:
                return {"disable": disable_value}
            else:
                return None

    def create(
        self,
        *,
        user_id: str,
        toolkits: t.Optional[
            t.Union[
                t.List[str],
                ToolRouterToolkitsEnableConfig,
                ToolRouterToolkitsDisableConfig,
            ]
        ] = None,
        tools: t.Optional[t.Dict[str, ToolRouterToolsConfig]] = None,
        tags: t.Optional[ToolRouterConfigTags] = None,
        manage_connections: t.Optional[
            t.Union[bool, ToolRouterManageConnectionsConfig]
        ] = None,
        auth_configs: t.Optional[t.Dict[str, str]] = None,
        connected_accounts: t.Optional[t.Dict[str, str]] = None,
        workbench: t.Optional[ToolRouterWorkbenchConfig] = None,
    ) -> ToolRouterSession[TProvider]:
        """
        Create a new tool router session for a user.

        :param user_id: The user ID to create the session for.
        :param toolkits: Optional toolkit configuration. Can be:
                        - List[str]: List of toolkit slugs to enable.
                          Example: ['github', 'slack']
                        - ToolRouterToolkitsEnableConfig: Dict with 'enable' key.
                          Example: {'enable': ['github', 'slack']}
                        - ToolRouterToolkitsDisableConfig: Dict with 'disable' key.
                          Example: {'disable': ['linear']}
        :param tools: Optional per-toolkit tool configuration. Key is toolkit slug,
                     value is ToolRouterToolsConfig which can be:
                     - List[str]: List of tool slugs (shorthand for enable).
                       Example: ['GMAIL_SEND_EMAIL', 'GMAIL_SEARCH']
                     - ToolRouterToolsEnableConfig: Dict with 'enable' key.
                       Example: {'enable': ['GMAIL_SEND_EMAIL']}
                     - ToolRouterToolsDisableConfig: Dict with 'disable' key.
                       Example: {'disable': ['GMAIL_DELETE_EMAIL']}
                     - ToolRouterToolsTagsConfig: Dict with 'tags' key.
                       Tags can be a list (shorthand for enable) or object with enable/disable.
                       Example: {'tags': ['readOnlyHint', 'idempotentHint']}
                       Example: {'tags': {'enable': ['readOnlyHint'], 'disable': ['destructiveHint']}}
                     Example: {
                         'gmail': ['GMAIL_SEND_EMAIL', 'GMAIL_SEARCH'],
                         'github': {'enable': ['GITHUB_CREATE_ISSUE']},
                         'slack': {'disable': ['SLACK_DELETE_MESSAGE']},
                         'linear': {'tags': ['readOnlyHint']}
                     }
        :param tags: Optional global MCP tags to filter tools by.
                    Can be:
                    - List[str]: List of tag literals (shorthand for enable).
                      Example: ['readOnlyHint', 'idempotentHint']
                    - ToolRouterTagsEnableDisableConfig: Dict with 'enable' and/or 'disable' keys.
                      Example: {'enable': ['readOnlyHint'], 'disable': ['destructiveHint']}
                    Available tag values: 'readOnlyHint', 'destructiveHint',
                    'idempotentHint', 'openWorldHint'.
                    Toolkit-level tags override this global setting.
        :param manage_connections: Optional connection management configuration. Can be:
                                  - bool: Simple boolean to enable/disable.
                                    Example: True or False
                                  - ToolRouterManageConnectionsConfig: Dict with:
                                    - 'enable' (bool): Whether to use tools to manage
                                      connections. Defaults to True.
                                    - 'callback_url' (str, optional): Callback URL for
                                      OAuth redirects.
                                    Example: {'enable': True, 'callback_url': 'https://example.com/callback'}
        :param auth_configs: Optional mapping of toolkit slug to auth config ID.
                           Example: {'github': 'ac_xxx', 'slack': 'ac_yyy'}
        :param connected_accounts: Optional mapping of toolkit slug to connected account ID.
                                  Example: {'github': 'ca_xxx', 'slack': 'ca_yyy'}
        :param workbench: Optional workbench configuration (ToolRouterWorkbenchConfig).
                         Dict with:
                         - 'enable_proxy_execution' (bool): Whether to allow proxy execute
                           calls in the workbench. If False, prevents arbitrary HTTP requests.
                         - 'auto_offload_threshold' (int): Maximum execution payload size to
                           offload to workbench.
                         Example: {'enable_proxy_execution': False, 'auto_offload_threshold': 300}
        :return: Tool router session object

        Example:
            ```python
            # Create a basic session
            session = tool_router.create(user_id='user_123')

            # Create a session with specific toolkits
            session = tool_router.create(
                user_id='user_123',
                toolkits=['github', 'slack']
            )

            # Create a session with per-toolkit tool configuration
            session = tool_router.create(
                user_id='user_123',
                tools={
                    'gmail': ['GMAIL_SEND_EMAIL', 'GMAIL_SEARCH'],  # List shorthand
                    'github': {'enable': ['GITHUB_CREATE_ISSUE']},  # Explicit enable
                    'slack': {'disable': ['SLACK_DELETE_MESSAGE']},  # Explicit disable
                }
            )

            # Create a session with global tag filtering
            session = tool_router.create(
                user_id='user_123',
                tags=['readOnlyHint', 'idempotentHint']
            )

            # Create a session with toolkit-specific tag filtering (array format)
            session = tool_router.create(
                user_id='user_123',
                tools={
                    'gmail': {'tags': ['readOnlyHint']},
                    'github': {'tags': ['readOnlyHint', 'idempotentHint']}
                }
            )

            # Create a session with toolkit-specific tag filtering (object format)
            session = tool_router.create(
                user_id='user_123',
                tools={
                    'gmail': {'tags': {'enable': ['readOnlyHint']}},
                    'github': {'tags': {'enable': ['readOnlyHint'], 'disable': ['destructiveHint']}}
                }
            )

            # Create a session with connection management
            session = tool_router.create(
                user_id='user_123',
                manage_connections={
                    'enable': True,
                    'callback_url': 'https://example.com/callback',
                }
            )

            # Create a session with workbench config
            session = tool_router.create(
                user_id='user_123',
                workbench={
                    'enable_proxy_execution': False,
                    'auto_offload_threshold': 300
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
            else manage_connections.get("enable", True)
        )

        # Parse toolkits config
        toolkits_payload: t.Optional[t.Dict[str, t.List[str]]] = None
        if toolkits is not None:
            if isinstance(toolkits, list):
                toolkits_payload = {"enable": toolkits}
            else:
                toolkits_payload = t.cast(t.Dict[str, t.List[str]], toolkits)

        # Parse tools config - transform to API format
        # Transform tools from Dict[str, Union[List, enable/disable/tags]] to client SDK format
        tools_payload: t.Optional[t.Dict[str, t.Any]] = None
        if tools is not None:
            tools_payload = {}
            for toolkit_slug, config in tools.items():
                if isinstance(config, list):
                    # List shorthand means enable these tools
                    tools_payload[toolkit_slug] = {"enable": config}
                elif isinstance(config, dict):
                    # Transform config dict - handle 'tags' specially if present
                    # Build the transformed config explicitly to maintain proper typing
                    transformed_config: t.Dict[
                        str,
                        t.Union[
                            t.List[str],
                            session_create_params.TagsUnionMember1,
                        ],
                    ] = {}
                    # Copy existing keys (enable, disable) if present
                    if "enable" in config:
                        # config is ToolRouterToolsEnableConfig when "enable" is present
                        enable_config = t.cast(ToolRouterToolsEnableConfig, config)
                        transformed_config["enable"] = enable_config["enable"]
                    if "disable" in config:
                        # config is ToolRouterToolsDisableConfig when "disable" is present
                        disable_config = t.cast(ToolRouterToolsDisableConfig, config)
                        transformed_config["disable"] = disable_config["disable"]
                    # Use type guard to narrow the type when "tags" is present
                    if _is_tools_tags_config(config):
                        # Type narrowed: config is now ToolRouterToolsTagsConfig
                        tags_value = config["tags"]
                        transformed_tags = self._transform_tags_params(tags_value)
                        if transformed_tags is not None:
                            transformed_config["tags"] = transformed_tags
                    tools_payload[toolkit_slug] = transformed_config

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
            "enable": auto_manage_connections,
        }
        if callback_url is not None and callback_url is not omit:
            connections_config["callback_url"] = callback_url

        create_params["manage_connections"] = connections_config

        # Add optional fields
        if auth_configs is not None:
            create_params["auth_configs"] = auth_configs

        if connected_accounts is not None:
            create_params["connected_accounts"] = connected_accounts

        if toolkits_payload is not None:
            create_params["toolkits"] = toolkits_payload

        if tools_payload:
            create_params["tools"] = tools_payload

        # Transform tags config
        tags_payload = self._transform_tags_params(tags)
        if tags_payload is not None:
            create_params["tags"] = tags_payload

        if workbench is not None:
            execution_payload: t.Dict[str, t.Any] = {}
            if "enable_proxy_execution" in workbench:
                execution_payload["enable_proxy_execution"] = workbench[
                    "enable_proxy_execution"
                ]
            if "auto_offload_threshold" in workbench:
                execution_payload["auto_offload_threshold"] = int(
                    workbench["auto_offload_threshold"]
                )

            if execution_payload:
                create_params["workbench"] = execution_payload

        # Make API call to create session
        session = self._client.tool_router.session.create(**create_params)

        # Create and return the session
        return ToolRouterSession(
            session_id=session.session_id,
            mcp=self._create_mcp_server_config(
                mcp_type=ToolRouterMCPServerType(session.mcp.type.lower()),
                url=session.mcp.url,
            ),
            tools=self._create_tools_fn(session.session_id, session.tool_router_tools),
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

        # Create and return the session
        return ToolRouterSession(
            session_id=session.session_id,
            mcp=self._create_mcp_server_config(
                mcp_type=ToolRouterMCPServerType(session.mcp.type.lower()),
                url=session.mcp.url,
            ),
            tools=self._create_tools_fn(session.session_id, session.tool_router_tools),
            authorize=self._create_authorize_fn(session.session_id),
            toolkits=self._create_toolkits_fn(session.session_id),
        )


__all__ = [
    "ToolRouter",
    "ToolRouterSession",
    "ToolRouterToolkitsEnableConfig",
    "ToolRouterToolkitsDisableConfig",
    "ToolRouterToolsEnableConfig",
    "ToolRouterToolsDisableConfig",
    "ToolRouterToolsTagsConfig",
    "ToolRouterToolsConfig",
    "ToolRouterTag",
    "ToolRouterTagsEnableDisableConfig",
    "ToolRouterConfigTags",
    "ToolRouterManageConnectionsConfig",
    "ToolRouterWorkbenchConfig",
    "ToolkitConnectionState",
    "ToolkitConnectionsDetails",
    "ToolRouterMCPServerConfig",
    "ToolRouterMCPServerType",
]
