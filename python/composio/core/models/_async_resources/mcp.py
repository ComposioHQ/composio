from __future__ import annotations

import typing as t
import warnings

import typing_extensions as te
from composio_client import omit
from composio_client.types.mcp.custom_create_response import CustomCreateResponse
from pydantic import PrivateAttr

from composio.client._async import AsyncHttpClient
from composio.core.models import mcp as sync
from composio.core.models.base import AsyncResource
from composio.core.models.mcp import (
    _MANAGED_AUTH_DEPRECATION,
    ConfigToolkit,
    MCPListResponse,
    MCPServerInstance,
    _toolkit_ids,
)
from composio.exceptions import ComposioDeprecationWarning, ValidationError
from composio.utils.pydantic import none_to_omit


class AsyncMCPCreateResponse(CustomCreateResponse):
    """MCP configuration with an awaitable connection URL generator."""

    _resource: AsyncMCP = PrivateAttr()

    async def generate(
        self, user_id: str, manually_manage_connections: bool | None = None
    ) -> MCPServerInstance:
        return await self._resource.generate(
            user_id, self.id, manually_manage_connections
        )


class AsyncMCP(AsyncResource):
    """Async counterpart to MCP."""

    def __init__(self, client: AsyncHttpClient):
        super().__init__(client)

    async def create(
        self,
        name: str,
        toolkits: t.List[t.Union[ConfigToolkit, str]],
        manually_manage_connections: bool = False,
        allowed_tools: t.Optional[t.List[str]] = None,
    ) -> AsyncMCPCreateResponse:
        """Create a new MCP server configuration with specified toolkits and authentication settings."""
        if not toolkits:
            raise ValidationError("At least one toolkit configuration is required")
        try:
            toolkit_names, auth_config_ids = _toolkit_ids(toolkits)
            allowed_tools_param = none_to_omit(allowed_tools)
            response = await self._client.mcp.custom.create(
                name=name,
                toolkits=toolkit_names,
                auth_config_ids=auth_config_ids,
                allowed_tools=allowed_tools_param,
                managed_auth_via_composio=not manually_manage_connections,
            )
            # The generated client has already applied its response validation
            # policy. Keep parsed nested models, fields-set and unknown fields.
            result = AsyncMCPCreateResponse.model_construct(
                _fields_set=response.model_fields_set,
                **vars(response),
                **(response.model_extra or {}),
            )
            result._resource = self
            return result
        except Exception as e:
            raise ValidationError("Failed to create MCP server") from e

    async def list(
        self,
        page_no: t.Optional[int] = None,
        limit: t.Optional[int] = None,
        toolkits: t.Optional[str] = None,
        auth_config_ids: t.Optional[str] = None,
        name: t.Optional[str] = None,
        order_by: t.Optional[te.Literal["created_at", "updated_at"]] = None,
        order_direction: t.Optional[te.Literal["asc", "desc"]] = None,
    ) -> MCPListResponse:
        """List MCP servers with optional filtering and pagination."""
        try:
            response = await self._client.mcp.list(
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

    async def get(self, server_id: str):
        """Retrieve detailed information about a specific MCP server/config."""
        try:
            response = await self._client.mcp.retrieve(server_id)
            return response
        except Exception as e:
            raise ValidationError(f"Failed to retrieve MCP server {server_id}") from e

    async def update(
        self,
        server_id: str,
        name: t.Optional[str] = None,
        toolkits: t.Optional[t.List[t.Union[ConfigToolkit, str]]] = None,
        manually_manage_connections: t.Optional[bool] = None,
        allowed_tools: t.Optional[t.List[str]] = None,
    ):
        """Update an existing MCP server configuration."""
        try:
            update_params: t.Dict[str, t.Any] = {}
            if name is not None:
                update_params["name"] = name
            if toolkits is not None:
                toolkit_names, auth_config_ids = _toolkit_ids(toolkits)
                update_params["toolkits"] = toolkit_names
                update_params["auth_config_ids"] = auth_config_ids
            if allowed_tools is not None:
                update_params["allowed_tools"] = allowed_tools
            if manually_manage_connections is not None:
                update_params[
                    "managed_auth_via_composio"
                ] = not manually_manage_connections
            response = await self._client.mcp.update(server_id, **update_params)
            return response
        except Exception as e:
            raise ValidationError(f"Failed to update MCP server {server_id}") from e

    async def delete(self, server_id: str) -> t.Dict[str, t.Any]:
        """Permanently delete an MCP server configuration."""
        try:
            response = await self._client.mcp.delete(server_id)
            return {"id": server_id, "deleted": getattr(response, "deleted", True)}
        except Exception as e:
            raise ValidationError(f"Failed to delete MCP server {server_id}") from e

    async def generate(
        self,
        user_id: str,
        mcp_config_id: str,
        manually_manage_connections: t.Optional[bool] = None,
    ) -> MCPServerInstance:
        """Get server URLs for an existing MCP server."""
        try:
            server_details = await self._client.mcp.retrieve(mcp_config_id)
            managed_auth_by_composio = not manually_manage_connections
            if managed_auth_by_composio and not sync._managed_auth_deprecation_warned:
                sync._managed_auth_deprecation_warned = True
                warnings.warn(
                    _MANAGED_AUTH_DEPRECATION, ComposioDeprecationWarning, stacklevel=3
                )
            url_response = await self._client.mcp.generate.url(
                mcp_server_id=mcp_config_id,
                user_ids=[user_id],
                managed_auth_by_composio=True if managed_auth_by_composio else omit,
            )
            if hasattr(url_response, "user_ids_url") and url_response.user_ids_url:
                server_url = url_response.user_ids_url[0]
            else:
                raise ValidationError("No server URL generated")
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
