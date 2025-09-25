"""
MCP (Model Control Protocol) module for Composio SDK.

This module provides MCP server operations with provider-specific optimizations.
"""

from __future__ import annotations

import typing as t

import typing_extensions as te

from composio.client import HttpClient
from composio.core.models.base import Resource
from composio.exceptions import ValidationError

if t.TYPE_CHECKING:
    from composio.core.provider import TProvider

TProvider = t.TypeVar("TProvider")


class MCPServerInstance(te.TypedDict):
    """MCP Server Instance data structure (matching TypeScript implementation)."""
    id: str
    name: str
    type: str
    url: str
    user_id: str
    allowed_tools: t.List[str]
    auth_configs: t.List[str]


class MCP(Resource, t.Generic[TProvider]):
    """
    MCP (Model Control Protocol) class.
    Provides enhanced MCP server operations with provider-specific response formatting.
    
    This matches the TypeScript ExperimentalMCP class functionality.
    """

    def __init__(self, client: HttpClient, provider: TProvider):
        """
        Initialize MCP instance.
        
        :param client: HTTP client for API calls
        :param provider: Provider instance for formatting responses
        """
        super().__init__(client)
        self.provider = provider

    def get(
        self,
        user_id: str,
        mcp_config_id: str,
        options: t.Optional[t.Dict[str, t.Any]] = None,
    ) -> MCPServerInstance:
        """
        Get server URLs for an existing MCP server.
        The response is wrapped according to the provider's specifications.
        
        This matches the TypeScript implementation exactly.
        
        :param user_id: External user ID from your database
        :param mcp_config_id: MCP configuration ID
        :param options: Additional options (is_chat_auth)
        :return: MCP server instance
        
        Example:
            >>> server = composio.experimental.mcp.get(
            ...     "user123",
            ...     "mcp_config_id",
            ...     {"is_chat_auth": True}
            ... )
        """
        options = options or {}
        
        try:
            # Get server details first (matching TS: this.client.mcp.retrieve)
            server_details = self._client.mcp.retrieve(mcp_config_id)
            
            # Generate server URLs (matching TS: this.client.mcp.generate.url)
            url_response = self._client.mcp.generate.url(
                mcp_server_id=mcp_config_id,
                user_ids=[user_id],
                managed_auth_by_composio=options.get("is_chat_auth", 
                    getattr(server_details, "managed_auth_via_composio", False)),
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
                "type": "sse",
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