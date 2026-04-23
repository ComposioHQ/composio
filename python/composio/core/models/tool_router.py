"""
ToolRouter class for managing tool router sessions.

This module provides tool routing session management with enhanced functionality
for creating isolated MCP sessions with provider-wrapped tools.
"""

from __future__ import annotations

import typing as t
from dataclasses import dataclass
from enum import Enum

import typing_extensions as te
from composio_client import omit
from composio_client.types.tool_router import session_create_params

from composio.client import HttpClient
from composio.core.models.base import Resource
from composio.core.models.custom_tool import (
    ExperimentalToolkit,
    build_custom_tools_map_from_response,
    serialize_custom_tools,
    serialize_custom_toolkits,
)
from composio.core.models.custom_tool_types import (
    CustomTool,
    CustomToolsMap,
)
from composio.core.models.tool_router_session import ToolRouterSession
from composio.core.models.tool_router_session_files import ToolRouterSessionFilesMount
from composio.core.provider import TTool, TToolCollection
from composio.core.provider.base import BaseProvider

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
        enable: Whether to enable the workbench entirely. Defaults to True.
                When set to False, no code execution tools
                (COMPOSIO_REMOTE_WORKBENCH, COMPOSIO_REMOTE_BASH_TOOL) are
                available in the session, workbench-related prompt lines are
                stripped, and direct workbench calls are rejected.
        enable_proxy_execution: Whether to allow proxy execute calls in the workbench.
                                If False, prevents arbitrary HTTP requests.
        auto_offload_threshold: Maximum execution payload size to offload to workbench.
    """

    enable: bool
    enable_proxy_execution: bool
    auto_offload_threshold: int


class ToolRouterManageConnectionsConfig(te.TypedDict, total=False):
    """Configuration for connection management in tool router session.

    Attributes:
        enable: Whether to use tools to manage connections. Defaults to True.
                If False, you need to manage connections manually.
        callback_url: Optional callback URL to use for OAuth redirects.
        wait_for_connections: Whether to wait for users to finish authenticating
                             connections before proceeding to the next step. Defaults to False.
                             If set to True, a wait for connections tool call will happen and
                             finish when the connections are ready.
    """

    enable: bool
    callback_url: str
    wait_for_connections: bool


class ToolRouterMultiAccountConfig(te.TypedDict, total=False):
    """Configuration for multi-account mode in tool router session.

    Attributes:
        enable: When True, enables multi-account mode. When not set, falls back to
                org/project-level configuration.
        max_accounts_per_toolkit: Maximum connected accounts allowed per toolkit (2-10).
                                 Defaults to 5 when multi-account is enabled.
        require_explicit_selection: When True, require explicit account selection when
                                   multiple accounts are connected. Defaults to False.
    """

    enable: bool
    max_accounts_per_toolkit: int
    require_explicit_selection: bool


class ToolRouterAssistivePromptConfig(te.TypedDict, total=False):
    """Configuration for assistive prompt generation.

    Attributes:
        user_timezone: IANA timezone identifier (e.g., "America/New_York", "Europe/London")
                      for timezone-aware assistive prompts.
    """

    user_timezone: str


class ToolRouterExperimentalConfig(te.TypedDict, total=False):
    """Experimental configuration for tool router session.

    Note: These features are experimental and may be modified or removed in future versions.

    Attributes:
        assistive_prompt: Configuration for assistive prompt generation.
        custom_tools: Custom tools to include in the session.
        custom_toolkits: Custom toolkits with grouped tools.
    """

    assistive_prompt: ToolRouterAssistivePromptConfig
    custom_tools: t.List[CustomTool]
    custom_toolkits: t.List[ExperimentalToolkit]


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
class ToolRouterSessionExperimental:
    """Experimental features in session response.

    Note: These features are experimental and may be modified or removed in future versions.

    Attributes:
        files: File mount for list, upload, download, delete operations.
        assistive_prompt: The generated assistive system prompt based on the experimental config.
    """

    files: "ToolRouterSessionFilesMount"
    assistive_prompt: t.Optional[str] = None


class ToolRouter(Resource, t.Generic[TTool, TToolCollection]):
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
        provider: t.Optional["BaseProvider[TTool, TToolCollection]"] = None,
        auto_upload_download_files: bool = True,
        sensitive_file_upload_protection: bool = True,
        file_upload_path_deny_segments: t.Optional[t.Sequence[str]] = None,
    ):
        """
        Initialize ToolRouter instance.

        :param client: HTTP client for API calls
        :param provider: Optional provider for tool wrapping
        :param auto_upload_download_files: Whether to automatically upload and download files. Defaults to True.
        :param sensitive_file_upload_protection: When True, block local paths on the built-in sensitive-path denylist before upload.
        :param file_upload_path_deny_segments: Extra path segment names to merge with the built-in denylist.
        """
        super().__init__(client)
        self._provider = provider
        self._auto_upload_download_files = auto_upload_download_files
        self._sensitive_file_upload_protection = sensitive_file_upload_protection
        self._file_upload_path_deny_segments = file_upload_path_deny_segments

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
        multi_account: t.Optional[ToolRouterMultiAccountConfig] = None,
        experimental: t.Optional[ToolRouterExperimentalConfig] = None,
    ) -> ToolRouterSession[TTool, TToolCollection]:
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
                                    - 'wait_for_connections' (bool, optional): Whether to wait
                                      for users to finish authenticating connections before
                                      proceeding to the next step. Defaults to False.
                                    Example: {'enable': True, 'callback_url': 'https://example.com/callback', 'wait_for_connections': True}
        :param auth_configs: Optional mapping of toolkit slug to auth config ID.
                           Example: {'github': 'ac_xxx', 'slack': 'ac_yyy'}
        :param connected_accounts: Optional mapping of toolkit slug to connected account ID.
                                  Example: {'github': 'ca_xxx', 'slack': 'ca_yyy'}
        :param workbench: Optional workbench configuration (ToolRouterWorkbenchConfig).
                         Dict with:
                         - 'enable' (bool): Whether to enable the workbench entirely.
                           Defaults to True. When set to False, no code execution tools
                           (COMPOSIO_REMOTE_WORKBENCH, COMPOSIO_REMOTE_BASH_TOOL) are
                           available in the session.
                         - 'enable_proxy_execution' (bool): Whether to allow proxy execute
                           calls in the workbench. If False, prevents arbitrary HTTP requests.
                         - 'auto_offload_threshold' (int): Maximum execution payload size to
                           offload to workbench.
                         Example: {'enable': False}
                         Example: {'enable_proxy_execution': False, 'auto_offload_threshold': 300}
        :param multi_account: Optional multi-account configuration (ToolRouterMultiAccountConfig).
                            Dict with:
                            - 'enable' (bool): When True, enables multi-account mode.
                              Falls back to org/project-level config when not set.
                            - 'max_accounts_per_toolkit' (int): Max connected accounts per
                              toolkit (2-10). Defaults to 5.
                            - 'require_explicit_selection' (bool): When True, require explicit
                              account selection when multiple accounts are connected.
                            Example: {'enable': True, 'max_accounts_per_toolkit': 3}
        :param experimental: Optional experimental configuration (ToolRouterExperimentalConfig).
                            Note: These features are experimental and may change.
                            Dict with:
                            - 'assistive_prompt' (dict): Configuration for assistive prompt generation.
                              - 'user_timezone' (str): IANA timezone identifier
                                (e.g., "America/New_York", "Europe/London").
                            Example: {'assistive_prompt': {'user_timezone': 'America/New_York'}}
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
                    'wait_for_connections': True,
                }
            )

            # Create a session with workbench disabled
            session = tool_router.create(
                user_id='user_123',
                workbench={
                    'enable': False
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

        # Parse callback_url and wait_for_connections from manage_connections config
        callback_url = (
            manage_connections.get("callback_url")
            if isinstance(manage_connections, dict)
            else omit
        )
        wait_for_connections = (
            manage_connections.get("wait_for_connections")
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
        if wait_for_connections is not None and wait_for_connections is not omit:
            connections_config["enable_wait_for_connections"] = wait_for_connections

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
            execution_payload: t.Dict[str, t.Any] = {
                "enable": workbench.get("enable", True),
            }
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

        if multi_account is not None:
            create_params["multi_account"] = multi_account

        # Build experimental config
        # Map SDK's experimental.assistive_prompt.user_timezone to API's
        # experimental.assistive_prompt_config.user_timezone
        custom_tools: t.Optional[t.List[CustomTool]] = None
        custom_toolkits: t.Optional[t.List[ExperimentalToolkit]] = None

        if experimental is not None:
            experimental_payload: t.Dict[str, t.Any] = {}

            assistive_prompt_config = experimental.get("assistive_prompt")
            if assistive_prompt_config is not None:
                user_timezone = assistive_prompt_config.get("user_timezone")
                if user_timezone:
                    experimental_payload["assistive_prompt_config"] = {
                        "user_timezone": user_timezone,
                    }

            # Serialize custom tools and toolkits for the backend
            custom_tools = experimental.get("custom_tools")
            custom_toolkits = experimental.get("custom_toolkits")

            if custom_tools:
                experimental_payload["custom_tools"] = serialize_custom_tools(
                    custom_tools
                )
            if custom_toolkits:
                experimental_payload["custom_toolkits"] = serialize_custom_toolkits(
                    custom_toolkits
                )

            if experimental_payload:
                create_params["experimental"] = experimental_payload

        if self._provider is None:
            raise ValueError(
                "Provider is required for tool router. "
                "Please initialize ToolRouter with a provider."
            )

        # Make API call to create session
        session = self._client.tool_router.session.create(**create_params)

        # Build custom tools routing map from backend response
        custom_tools_map: t.Optional[CustomToolsMap] = None
        if custom_tools or custom_toolkits:
            custom_tools_map = build_custom_tools_map_from_response(
                tools=custom_tools or [],
                toolkits=custom_toolkits,
                experimental=session.experimental,
            )

        # Transform experimental response:
        # API's assistive_prompt -> SDK's assistive_prompt
        # files mount is always present
        files_mount = ToolRouterSessionFilesMount(self._client, session.session_id)
        experimental_response = ToolRouterSessionExperimental(
            files=files_mount,
            assistive_prompt=(
                session.experimental.assistive_prompt if session.experimental else None
            ),
        )

        # Create and return the session
        return ToolRouterSession(
            client=self._client,
            provider=self._provider,
            auto_upload_download_files=self._auto_upload_download_files,
            sensitive_file_upload_protection=self._sensitive_file_upload_protection,
            file_upload_path_deny_segments=self._file_upload_path_deny_segments,
            session_id=session.session_id,
            mcp=self._create_mcp_server_config(
                mcp_type=ToolRouterMCPServerType(session.mcp.type.lower()),
                url=session.mcp.url,
            ),
            experimental=experimental_response,
            custom_tools_map=custom_tools_map,
            user_id=user_id,
        )

    def use(self, session_id: str) -> ToolRouterSession[TTool, TToolCollection]:
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
        if self._provider is None:
            raise ValueError(
                "Provider is required for tool router. "
                "Please initialize ToolRouter with a provider."
            )

        # Retrieve the session from the API
        session = self._client.tool_router.session.retrieve(session_id)

        files_mount = ToolRouterSessionFilesMount(self._client, session.session_id)
        experimental_response = ToolRouterSessionExperimental(
            files=files_mount,
            assistive_prompt=None,
        )

        # Create and return the session
        return ToolRouterSession(
            client=self._client,
            provider=self._provider,
            auto_upload_download_files=self._auto_upload_download_files,
            sensitive_file_upload_protection=self._sensitive_file_upload_protection,
            file_upload_path_deny_segments=self._file_upload_path_deny_segments,
            session_id=session.session_id,
            mcp=self._create_mcp_server_config(
                mcp_type=ToolRouterMCPServerType(session.mcp.type.lower()),
                url=session.mcp.url,
            ),
            experimental=experimental_response,
        )


__all__ = [
    "ToolRouter",
    "ToolRouterSession",
    "ToolRouterSessionExperimental",
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
    "ToolRouterMultiAccountConfig",
    "ToolRouterExperimentalConfig",
    "ToolRouterAssistivePromptConfig",
    "ToolkitConnectionState",
    "ToolkitConnectionsDetails",
    "ToolRouterMCPServerConfig",
    "ToolRouterMCPServerType",
]
