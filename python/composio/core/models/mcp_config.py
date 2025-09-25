"""
MCPConfig module for Composio SDK.

This module provides simplified MCP configuration management functionality,
offering a cleaner API for creating and managing MCP server configurations.
"""

from __future__ import annotations

import typing as t

import typing_extensions as te

from composio.client import HttpClient
from composio.core.models.base import Resource
from composio.exceptions import ValidationError

if t.TYPE_CHECKING:
    from composio.core.models.mcp import MCP
    from composio.core.provider import TProvider

TProvider = t.TypeVar("TProvider")


class McpServerCreateResponse:
    """
    Response from MCP server creation with getServer method.
    Mimics the TypeScript McpServerCreateResponse behavior.
    """
    
    def __init__(self, server_data: t.Dict[str, t.Any], mcp: "MCP", options: MCPConfigOptions):
        self.id = server_data["id"]
        self.name = server_data["name"]
        self.toolkits = server_data["toolkits"]
        self.created_at = server_data.get("created_at")
        self.updated_at = server_data.get("updated_at")
        self._mcp = mcp
        self._options = options
    
    def get_server(self, params: MCPGetServerParams) -> t.Any:
        """
        Get server instance for this MCP configuration.
        Internally uses experimental.mcp.get() function.
        
        :param params: Parameters including user_id
        :return: MCP server instance
        """
        return self._mcp.get(
            user_id=params.get("user_id", ""),
            mcp_config_id=self.id,
            options={"is_chat_auth": self._options.get("is_chat_auth", False)}
        )
    
    def to_dict(self) -> t.Dict[str, t.Any]:
        """Convert to dictionary representation."""
        return {
            "id": self.id,
            "name": self.name,
            "toolkits": self.toolkits,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class MCPServerConfig(te.TypedDict):
    """Configuration for MCP server authentication and tools."""
    auth_config_id: str
    allowed_tools: t.List[str]


class MCPConfigOptions(te.TypedDict):
    """Options for MCP server configuration."""
    is_chat_auth: te.NotRequired[bool]


class MCPGetServerParams(te.TypedDict):
    """Parameters for getServer function."""
    user_id: te.NotRequired[str]


class McpRetrieveResponse(te.TypedDict):
    """Response from MCP configuration retrieval."""
    id: str
    name: str
    created_at: te.NotRequired[str]
    updated_at: te.NotRequired[str]


class McpConfigListItem(te.TypedDict):
    """Individual item in MCP config list response (matching TypeScript McpListResponseSchema)."""
    id: str
    name: str
    created_at: te.NotRequired[t.Optional[str]]
    updated_at: te.NotRequired[t.Optional[str]]
    status: te.NotRequired[t.Optional[str]]


class McpConfigListResponse(te.TypedDict):
    """Response from MCP config list operation (matching TypeScript McpListResponseSchema)."""
    items: t.Optional[t.List[McpConfigListItem]]


class MCPConfig(Resource, t.Generic[TProvider]):
    """
    MCPConfig (Model Control Protocol Config) class.
    Handles CRUD operations related to MCP configurations with a simplified API.
    """

    def __init__(self, client: HttpClient, mcp: "MCP"):
        """
        Initialize MCPConfig instance.
        
        :param client: HTTP client for API calls
        :param mcp: MCP instance for getServer functionality
        """
        super().__init__(client)
        self._mcp = mcp

    def create(
        self,
        name: str,
        server_config: t.List[MCPServerConfig],
        options: MCPConfigOptions,
    ) -> McpServerCreateResponse:
        """
        Create a new MCP configuration.
        
        :param name: Unique name for the MCP configuration
        :param server_config: Array of auth configurations with allowed tools
        :param options: Configuration options including chat auth
        :return: Created server details with getServer method
        
        Example:
            >>> server = composio.experimental.mcp_config.create(
            ...     "personal-mcp-server",
            ...     [
            ...         {
            ...             "auth_config_id": "ac_xyz",
            ...             "allowed_tools": ["GMAIL_FETCH_EMAILS", "SLACK_SEND_MESSAGE"]
            ...         }
            ...     ],
            ...     {"is_chat_auth": True}
            ... )
            >>> 
            >>> # Use the getServer method (matching TypeScript)
            >>> server_instance = server.get_server({"user_id": "user123"})
        """
        if not server_config:
            raise ValidationError("At least one auth config is required")

        try:
            # Extract toolkits from auth configs
            auth_config_ids = [config["auth_config_id"] for config in server_config]
            
            # Get the auth configs to determine toolkits
            toolkits = []
            for auth_config_id in auth_config_ids:
                try:
                    auth_config = self._client.auth_configs.get(auth_config_id)
                    if hasattr(auth_config, 'toolkit') and auth_config.toolkit:
                        toolkit_slug = auth_config.toolkit.slug if hasattr(auth_config.toolkit, 'slug') else str(auth_config.toolkit)
                        if toolkit_slug not in toolkits:
                            toolkits.append(toolkit_slug)
                except Exception:
                    # If we can't get the auth config, skip it
                    pass
            
            # If no toolkits found, default to an empty list (API will handle validation)
            if not toolkits:
                toolkits = []
            
            # Use the custom MCP create endpoint
            response = self._client.mcp.custom.create(
                name=name,
                toolkits=toolkits,
                auth_config_ids=auth_config_ids,
                custom_tools=[tool for config in server_config for tool in config["allowed_tools"]],
                managed_auth_via_composio=options.get("is_chat_auth", False),
            )
            
            server_data = {
                "id": response.id,
                "name": response.name,
                "toolkits": getattr(response, "toolkits", []),
                "created_at": getattr(response, "created_at", None),
                "updated_at": getattr(response, "updated_at", None),
            }
            
            # Return response with getServer method (matching TypeScript behavior)
            return McpServerCreateResponse(
                server_data=server_data,
                mcp=self._mcp,
                options=options
            )
            
        except Exception as e:
            raise ValidationError("Failed to create MCP server") from e

    def get_by_name(self, config_name: str) -> McpRetrieveResponse:
        """
        Get details of a specific MCP config by name.
        
        :param config_name: Config name
        :return: Server details
        :raises ValidationError: If no MCP Config found with the given name
        :raises ValidationError: If multiple MCP Configs found with the same name
        
        Example:
            >>> mcp_config = composio.experimental.mcp_config.get_by_name('my-gmail-server')
        """
        if not config_name or config_name.strip() == "":
            raise ValidationError("Config name cannot be empty")
            
        try:
            # List MCP servers filtered by name
            list_response = self._client.mcp.list(name=config_name, limit=10)
            
            if not hasattr(list_response, 'items') or not list_response.items:
                raise ValidationError(f"MCP server with name '{config_name}' not found")
            
            servers = list_response.items
            if len(servers) > 1:
                raise ValidationError(f"Multiple MCP servers found with name '{config_name}'")
            
            # Get full details of the server
            server = servers[0]
            return {
                "id": server.id,
                "name": server.name,
                "created_at": getattr(server, "created_at", None),
                "updated_at": getattr(server, "updated_at", None),
            }
            
        except Exception as e:
            if isinstance(e, ValidationError):
                raise
            raise ValidationError(f"Failed to retrieve MCP server by name: {config_name}") from e

    def get(self, config_id: str) -> McpRetrieveResponse:
        """
        Get details of a specific MCP Config.
        
        :param config_id: Config UUID
        :return: Config details
        
        Example:
            >>> mcp_config = composio.experimental.mcp_config.get('config-uuid')
        """
        try:
            response = self._client.mcp.retrieve(config_id)
            return {
                "id": response.id,
                "name": response.name,
                "created_at": getattr(response, "created_at", None),
                "updated_at": getattr(response, "updated_at", None),
            }
        except Exception as e:
            raise ValidationError(f"MCP server {config_id} not found") from e

    def list(self, options: t.Optional[t.Dict[str, t.Any]] = None) -> McpConfigListResponse:
        """
        List MCP configurations with filtering options.
        
        :param options: Filtering and pagination options
        :return: List of MCP configurations
        
        Example:
            >>> configs = composio.experimental.mcp_config.list({
            ...     "page": 1,
            ...     "limit": 10,
            ...     "toolkits": ["GMAIL"]
            ... })
            >>> # Access items: configs["items"]
        """
        options = options or {}
        
        try:
            # Use the client to list MCP servers
            list_response = self._client.mcp.list(
                page_no=options.get("page", 1),
                limit=options.get("limit", 10),
                toolkits=",".join(options["toolkits"]) if options.get("toolkits") else self._client.not_given,
                auth_config_ids=",".join(options["auth_configs"]) if options.get("auth_configs") else self._client.not_given,
                name=options.get("name", self._client.not_given),
            )
            
            # Transform response to match McpListResponseSchema
            items: t.Optional[t.List[McpConfigListItem]] = None
            if hasattr(list_response, "items") and list_response.items:
                items = [
                    McpConfigListItem(
                        id=server.id,
                        name=server.name,
                        created_at=getattr(server, "created_at", None),
                        updated_at=getattr(server, "updated_at", None),
                        status=getattr(server, "status", None),
                    )
                    for server in list_response.items
                ]
            
            # Return properly typed structure matching TypeScript McpListResponseSchema
            return McpConfigListResponse(items=items)
            
        except Exception as e:
            raise ValidationError("Failed to list MCP servers") from e

