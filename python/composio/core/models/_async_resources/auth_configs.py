from __future__ import annotations

import typing as t

import typing_extensions as te
from composio_client import omit

from composio.client.types import (
    auth_config_create_params,
    auth_config_create_response,
    auth_config_delete_response,
    auth_config_list_params,
    auth_config_list_response,
    auth_config_retrieve_response,
    auth_config_update_params,
    auth_config_update_response,
    auth_config_update_status_response,
)
from composio.core.models.auth_configs import ComposioManagedAuthConfigOptions
from composio.core.models.base import AsyncResource


class AsyncAuthConfigs(AsyncResource):
    """Async counterpart to AuthConfigs."""

    async def list(
        self, **query: te.Unpack[auth_config_list_params.AuthConfigListParams]
    ) -> auth_config_list_response.AuthConfigListResponse:
        """Lists authentication configurations based on provided filter criteria."""
        return await self._client.auth_configs.list(**query)

    @t.overload
    async def create(
        self, toolkit: str, options: auth_config_create_params.AuthConfigUnionMember1
    ) -> auth_config_create_response.AuthConfig: ...

    @t.overload
    async def create(
        self, toolkit: str, options: ComposioManagedAuthConfigOptions
    ) -> auth_config_create_response.AuthConfig: ...

    @t.overload
    async def create(
        self, toolkit: str, options: auth_config_create_params.AuthConfigUnionMember0
    ) -> auth_config_create_response.AuthConfig: ...

    async def create(
        self,
        toolkit: str,
        options: t.Union[
            auth_config_create_params.AuthConfig, ComposioManagedAuthConfigOptions
        ],
    ) -> auth_config_create_response.AuthConfig:
        """Create a new auth config"""
        return (
            await self._client.auth_configs.create(
                toolkit={"slug": toolkit}, auth_config=options
            )
        ).auth_config

    async def get(
        self, nanoid: str
    ) -> auth_config_retrieve_response.AuthConfigRetrieveResponse:
        """Retrieves a specific authentication configuration by its ID"""
        return await self._client.auth_configs.retrieve(nanoid)

    @t.overload
    async def update(
        self, nanoid: str, *, options: auth_config_update_params.Variant0
    ) -> auth_config_update_response.AuthConfigUpdateResponse: ...

    @t.overload
    async def update(
        self, nanoid: str, *, options: auth_config_update_params.Variant1
    ) -> auth_config_update_response.AuthConfigUpdateResponse: ...

    async def update(
        self, nanoid: str, *, options: auth_config_update_params.AuthConfigUpdateParams
    ) -> auth_config_update_response.AuthConfigUpdateResponse:
        """Updates an existing authentication configuration."""
        return await self._client.auth_configs.update(
            nanoid=nanoid,
            type=options["type"],
            credentials=(
                options.get("credentials", omit)
                if options["type"] == "custom"
                else omit
            ),
            is_enabled_for_tool_router=options.get("is_enabled_for_tool_router", omit),
            tool_access_config=options.get("tool_access_config", omit),
        )

    async def delete(
        self, nanoid: str
    ) -> auth_config_delete_response.AuthConfigDeleteResponse:
        """Deletes an existing authentication configuration."""
        return await self._client.auth_configs.delete(nanoid)

    async def __update_status(
        self, nanoid: str, status: t.Literal["ENABLED", "DISABLED"]
    ) -> auth_config_update_status_response.AuthConfigUpdateStatusResponse:
        return await self._client.auth_configs.update_status(status, nanoid=nanoid)

    async def enable(
        self, nanoid: str
    ) -> auth_config_update_status_response.AuthConfigUpdateStatusResponse:
        """Enables an existing authentication configuration."""
        return await self.__update_status(nanoid, "ENABLED")

    async def disable(
        self, nanoid: str
    ) -> auth_config_update_status_response.AuthConfigUpdateStatusResponse:
        """Disables an existing authentication configuration."""
        return await self.__update_status(nanoid, "DISABLED")
