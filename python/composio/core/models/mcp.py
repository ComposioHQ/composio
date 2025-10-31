"""
MCP (Model Control Protocol) module for Composio SDK.

This module provides MCP server operations
"""

from __future__ import annotations

import typing as t

import typing_extensions as te
from composio_client.types.mcp.custom_create_response import CustomCreateResponse
from composio_client.types.tool_router_create_session_params import ConfigToolkit

from composio.client import HttpClient
from composio.core.models.base import Resource
from composio.exceptions import ValidationError
from composio.utils.pydantic import none_to_omit

# Data Types (matching TypeScript specification)


class MCPCreateResponse(CustomCreateResponse):
    """MCP Create Response with generate method (extends CustomCreateResponse)."""

    generate: t.Callable[[str, t.Optional[bool]], "MCPServerInstance"]


class MCPServerInstance(te.TypedDict):
    """MCP Server Instance data structure (matching TypeScript implementation)."""

    id: str
    name: str
    type: str
    url: str  # User-specific connection URL
    user_id: str  # Associated user ID
    allowed_tools: t.List[str]  # Available tools for the user
    auth_configs: t.List[str]  # Associated auth configurations


class MCPItem(te.TypedDict):
    """Complete MCP server information."""

    id: str  # Unique server identifier
    name: str  # Human-readable server name
    allowed_tools: t.List[str]  # Array of enabled tool identifiers
    auth_config_ids: t.List[str]  # Array of auth configuration IDs
    toolkits: t.List[str]  # Array of toolkit names
    commands: t.Dict[str, str]  # Setup commands for different clients
    mcp_url: str  # Server connection URL
    toolkit_icons: t.Dict[str, str]  # Map of toolkit icons
    server_instance_count: int  # Number of active instances
    created_at: te.NotRequired[t.Optional[str]]
    updated_at: te.NotRequired[t.Optional[str]]


class MCPListResponse(te.TypedDict):
    """Paginated list response."""

    items: t.List[t.Any]  # Array of MCP server objects (raw API response)
    current_page: int  # Current page number
    total_pages: int  # Total number of pages


def _add_generate_method(
    response: CustomCreateResponse, mcp_instance: "MCP"
) -> MCPCreateResponse:
    """Add generate method to CustomCreateResponse object."""

    def generate(
        user_id: str, manually_manage_connections: t.Optional[bool] = None
    ) -> MCPServerInstance:
        """
        Generate server instance for this MCP configuration.
        Matches TypeScript server.generate(userId) method.

        :param user_id: External user ID from your database
        :param manually_manage_connections: Whether to manually manage connections (optional)
        :return: MCP server instance
        """
        return mcp_instance.generate(user_id, response.id, manually_manage_connections)

    # Add the generate method to the response object and cast to MCPCreateResponse
    response.generate = generate  # type: ignore
    return t.cast(MCPCreateResponse, response)


class MCP(Resource):
    """
    MCP (Model Control Protocol) class.
    Provides enhanced MCP server operations

    This matches the TypeScript ExperimentalMCP class functionality.
    """

    def __init__(self, client: HttpClient):
        """
        Initialize MCP instance.

        :param client: HTTP client for API calls
        """
        super().__init__(client)

    def create(
        self,
        name: str,
        toolkits: t.List[t.Union[ConfigToolkit, str]],
        manually_manage_connections: bool = False,
        allowed_tools: t.Optional[t.List[str]] = None,
    ) -> MCPCreateResponse:
        """
        Create a new MCP server configuration with specified toolkits and authentication settings.

        :param name: Unique name for the MCP configuration
        :param toolkits: List of toolkit configurations. Can be either:
                        - MCPToolkitConfig objects with detailed configuration
                        - Strings representing toolkit names (for simple cases)
        :param manually_manage_connections: Whether to manually manage account connections (default: False)
        :param allowed_tools: List of specific tools to enable across all toolkits (default: None for all tools)
        :return: Created server details with generate method

        Examples:
            >>> # Using toolkit configuration objects with auth
            >>> server = composio.experimental.mcp.create(
            ...     'personal-mcp-server',
            ...     toolkits=[
            ...         {
            ...             'toolkit': 'github',
            ...             'auth_config_id': 'ac_xyz',
            ...         },
            ...         {
            ...             'toolkit': 'slack',
            ...             'auth_config_id': 'ac_abc',
            ...         },
            ...     ],
            ...     allowed_tools=['GITHUB_CREATE_ISSUE', 'GITHUB_LIST_REPOS', 'SLACK_SEND_MESSAGE'],
            ...     manually_manage_connections=False
            ... )
            >>>
            >>> # Using simple toolkit names (most common usage)
            >>> server = composio.experimental.mcp.create(
            ...     'simple-mcp-server',
            ...     toolkits=['composio_search', 'text_to_pdf'],
            ...     allowed_tools=['COMPOSIO_SEARCH_DUCK_DUCK_GO_SEARCH', 'TEXT_TO_PDF_CONVERT_TEXT_TO_PDF']
            ... )
            >>>
            >>> # Using all tools from toolkits (default behavior)
            >>> server = composio.experimental.mcp.create(
            ...     'all-tools-server',
            ...     toolkits=['composio_search', 'text_to_pdf']
            ...     # allowed_tools=None means all tools from these toolkits
            ... )
            >>>
            >>> # Get server instance for a user
            >>> mcp = server.generate('user_12345')
        """
        if not toolkits:
            raise ValidationError("At least one toolkit configuration is required")

        try:
            # Normalize toolkits to MCPToolkitConfig format
            normalized_toolkit_configs: t.List[ConfigToolkit] = []
            for toolkit in toolkits:
                if isinstance(toolkit, str):
                    # Convert string to MCPToolkitConfig
                    normalized_toolkit_configs.append(ConfigToolkit(toolkit=toolkit))
                else:
                    # Already MCPToolkitConfig, use as-is
                    normalized_toolkit_configs.append(toolkit)

            # Extract toolkits and prepare for API call
            toolkit_configs = normalized_toolkit_configs

            # Get unique toolkits and auth config IDs
            toolkit_names = []
            auth_config_ids = []

            for toolkit_config in toolkit_configs:
                if (
                    "toolkit" in toolkit_config
                    and toolkit_config["toolkit"] not in toolkit_names
                ):
                    toolkit_names.append(toolkit_config["toolkit"])

                if (
                    "auth_config_id" in toolkit_config
                    and toolkit_config["auth_config_id"] not in auth_config_ids
                ):
                    auth_config_ids.append(toolkit_config["auth_config_id"])

            # Use the allowed_tools parameter instead of individual toolkit configs
            custom_tools = none_to_omit(allowed_tools)

            # Use the custom MCP create endpoint
            response = self._client.mcp.custom.create(
                name=name,
                toolkits=toolkit_names,
                auth_config_ids=auth_config_ids,
                custom_tools=custom_tools,
                managed_auth_via_composio=not manually_manage_connections,
            )

            # Return response with generate method (matching TypeScript behavior)
            return _add_generate_method(response, self)

        except Exception as e:
            raise ValidationError("Failed to create MCP server") from e

    def list(
        self,
        page_no: t.Optional[int] = None,
        limit: t.Optional[int] = None,
        toolkits: t.Optional[str] = None,
        auth_config_ids: t.Optional[str] = None,
        name: t.Optional[str] = None,
        order_by: t.Optional[te.Literal["created_at", "updated_at"]] = None,
        order_direction: t.Optional[te.Literal["asc", "desc"]] = None,
    ) -> MCPListResponse:
        """
        List MCP servers with optional filtering and pagination.

        :param page_no: Page number for pagination (default: 1)
        :param limit: Maximum items per page (default: 10)
        :param toolkits: Filter by toolkit name (single string)
        :param auth_config_ids: Filter by auth configuration ID (single string)
        :param name: Filter by server name (partial match)
        :param order_by: Order by field ('created_at' or 'updated_at')
        :param order_direction: Order direction ('asc' or 'desc')
        :return: Paginated list of MCP servers

        Examples:
            >>> # List all servers
            >>> all_servers = composio.experimental.mcp.list()
            >>>
            >>> # List with pagination
            >>> paged_servers = composio.experimental.mcp.list(page_no=2, limit=5)
            >>>
            >>> # Filter by toolkit
            >>> github_servers = composio.experimental.mcp.list(toolkits='github', name='personal')
        """

        try:
            # Use the MCP list endpoint with filters
            response = self._client.mcp.list(
                page_no=page_no,
                limit=limit,
                toolkits=none_to_omit(toolkits),
                auth_config_ids=none_to_omit(auth_config_ids),
                name=none_to_omit(name),
                order_by=none_to_omit(order_by),
                order_direction=none_to_omit(order_direction),
            )

            items = (
                response.items if hasattr(response, "items") and response.items else []
            )

            return MCPListResponse(
                items=items,
                current_page=getattr(response, "current_page", page_no or 1),
                total_pages=getattr(response, "total_pages", 1),
            )

        except Exception as e:
            raise ValidationError("Failed to list MCP servers") from e

    def get(self, server_id: str):
        """
        Retrieve detailed information about a specific MCP server/config.

        :param server_id: The unique identifier of the MCP server/config
        :return: Complete MCP server information

        Example:
            >>> server = composio.experimental.mcp.get('mcp_12345')
            >>>
            >>> print(server['name'])  # "My Personal MCP Server"
            >>> print(server['allowed_tools'])  # ["GITHUB_CREATE_ISSUE", "SLACK_SEND_MESSAGE"]
            >>> print(server['toolkits'])  # ["github", "slack"]
            >>> print(server['server_instance_count'])  # 3
        """
        try:
            response = self._client.mcp.retrieve(server_id)

            return response

        except Exception as e:
            raise ValidationError(f"Failed to retrieve MCP server {server_id}") from e

    def update(
        self,
        server_id: str,
        name: t.Optional[str] = None,
        toolkits: t.Optional[t.List[t.Union[ConfigToolkit, str]]] = None,
        manually_manage_connections: t.Optional[bool] = None,
        allowed_tools: t.Optional[t.List[str]] = None,
    ):
        """
        Update an existing MCP server configuration.

        :param server_id: The unique identifier of the MCP server to update
        :param name: Optional new name for the MCP server
        :param toolkits: Optional list of toolkit configurations (strings or objects)
        :param manually_manage_connections: Optional flag for connection management
        :param allowed_tools: Optional list of specific tools to enable across all toolkits
        :return: Updated MCP server information

        Examples:
            >>> # Update server name only
            >>> updated_server = composio.experimental.mcp.update(
            ...     'mcp_12345',
            ...     name='My Updated MCP Server'
            ... )
            >>>
            >>> # Update toolkits and tools
            >>> server_with_new_tools = composio.experimental.mcp.update(
            ...     'mcp_12345',
            ...     toolkits=['github', 'slack'],
            ...     allowed_tools=['GITHUB_CREATE_ISSUE', 'SLACK_SEND_MESSAGE']
            ... )
            >>>
            >>> # Update with auth configs
            >>> server_with_auth = composio.experimental.mcp.update(
            ...     'mcp_12345',
            ...     toolkits=[
            ...         {'toolkit': 'github', 'auth_config_id': 'auth_abc123'},
            ...         {'toolkit': 'slack', 'auth_config_id': 'auth_def456'}
            ...     ],
            ...     allowed_tools=['GITHUB_CREATE_ISSUE', 'SLACK_SEND_MESSAGE'],
            ...     manually_manage_connections=False
            ... )
        """
        try:
            update_params: t.Dict[str, t.Any] = {}

            if name is not None:
                update_params["name"] = name

            if toolkits is not None:
                # Normalize toolkits to ConfigToolkit format (same as create method)
                normalized_toolkit_configs: t.List[ConfigToolkit] = []
                for toolkit in toolkits:
                    if isinstance(toolkit, str):
                        # Convert string to ConfigToolkit
                        normalized_toolkit_configs.append(
                            ConfigToolkit(toolkit=toolkit)
                        )
                    else:
                        # Already ConfigToolkit, use as-is
                        normalized_toolkit_configs.append(toolkit)

                # Extract toolkits and prepare for API call
                toolkit_names = []
                auth_config_ids = []

                for toolkit_config in normalized_toolkit_configs:
                    if (
                        "toolkit" in toolkit_config
                        and toolkit_config["toolkit"] not in toolkit_names
                    ):
                        toolkit_names.append(toolkit_config["toolkit"])

                    if (
                        "auth_config_id" in toolkit_config
                        and toolkit_config["auth_config_id"] not in auth_config_ids
                    ):
                        auth_config_ids.append(toolkit_config["auth_config_id"])

                update_params["toolkits"] = toolkit_names
                update_params["auth_config_ids"] = auth_config_ids

            if allowed_tools is not None:
                update_params["custom_tools"] = allowed_tools

            if manually_manage_connections is not None:
                update_params[
                    "managed_auth_via_composio"
                ] = not manually_manage_connections

            # Use the MCP update endpoint
            response = self._client.mcp.update(server_id, **update_params)

            return response

        except Exception as e:
            raise ValidationError(f"Failed to update MCP server {server_id}") from e

    def delete(self, server_id: str) -> t.Dict[str, t.Any]:
        """
        Permanently delete an MCP server configuration.

        :param server_id: The unique identifier of the MCP server to delete
        :return: Deletion result

        Example:
            >>> # Delete a server
            >>> result = composio.experimental.mcp.delete('mcp_12345')
            >>>
            >>> if result['deleted']:
            ...     print(f"Server {result['id']} has been successfully deleted")
            >>> else:
            ...     print(f"Failed to delete server {result['id']}")
        """
        try:
            response = self._client.mcp.delete(server_id)

            return {
                "id": server_id,
                "deleted": getattr(response, "deleted", True),
            }

        except Exception as e:
            raise ValidationError(f"Failed to delete MCP server {server_id}") from e

    def generate(
        self,
        user_id: str,
        mcp_config_id: str,
        manually_manage_connections: t.Optional[bool] = None,
    ) -> MCPServerInstance:
        """
        Get server URLs for an existing MCP server.

        This matches the TypeScript implementation exactly.

        :param user_id: External user ID from your database
        :param mcp_config_id: MCP configuration ID
        :param manually_manage_connections: Whether to manually manage connections (optional)
        :return: MCP server instance

        Example:
            >>> mcp = composio.experimental.mcp.generate(
            ...     'user_12345',
            ...     'mcp_67890',
            ...     manually_manage_connections=False
            ... )
            >>>
            >>> print(mcp['url'])  # Server URL for the user
            >>> print(mcp['allowed_tools'])  # Available tools
        """

        try:
            # Get server details first (matching TS: this.client.mcp.retrieve)
            server_details = self._client.mcp.retrieve(mcp_config_id)

            # Generate server URLs (matching TS: this.client.mcp.generate.url)
            url_response = self._client.mcp.generate.url(
                mcp_server_id=mcp_config_id,
                user_ids=[user_id],
                managed_auth_by_composio=False if manually_manage_connections else True,
            )

            # Get the generated URL (matching TS: urlResponse.user_ids_url[0])
            if hasattr(url_response, "user_ids_url") and url_response.user_ids_url:
                server_url = url_response.user_ids_url[0]
            else:
                raise ValidationError("No server URL generated")

            # Create structured server instance (matching TS MCPServerInstance)
            server_instance: MCPServerInstance = {
                "id": server_details.id,
                "name": server_details.name,
                "type": "streamable_http",
                "url": server_url,
                "user_id": user_id,
                "allowed_tools": getattr(server_details, "allowed_tools", []),
                "auth_configs": getattr(server_details, "auth_config_ids", []),
            }

            return server_instance

        except Exception as e:
            if isinstance(e, ValidationError):
                raise
            raise ValidationError("Failed to parse MCP server instance") from e
