from __future__ import annotations

import typing as t

import typing_extensions as te

from composio import exceptions
from composio.client._async import AsyncHttpClient
from composio.client.types import (
    AuthSchemeL,
    toolkit_list_params,
    toolkit_list_response,
    toolkit_recommend_scopes_params,
    toolkit_recommend_scopes_response,
    toolkit_retrieve_changelog_response,
    toolkit_retrieve_response,
    toolkit_retrieve_scopes_grant_context_params,
    toolkit_retrieve_scopes_grant_context_response,
)
from composio.core.models.base import AsyncResource
from composio.core.models.toolkits import AuthFieldsT
from composio.utils.pydantic import none_to_omit

from .connected_accounts import AsyncConnectedAccounts, AsyncConnectionRequest


class AsyncToolkits(AsyncResource):
    """Async counterpart to Toolkits."""

    connected_accounts: AsyncConnectedAccounts

    def __init__(self, client: AsyncHttpClient):
        super().__init__(client)
        self.connected_accounts = AsyncConnectedAccounts(client)

    async def list(
        self,
        *,
        category: t.Optional[str] = None,
        cursor: t.Optional[str] = None,
        limit: t.Optional[float] = None,
        sort_by: t.Optional[t.Literal["usage", "alphabetically"]] = None,
        managed_by: t.Optional[t.Literal["composio", "all", "project"]] = None,
    ) -> toolkit_list_response.ToolkitListResponse:
        """List all toolkits."""
        return await self._client.toolkits.list(
            category=none_to_omit(category),
            cursor=none_to_omit(cursor),
            limit=none_to_omit(limit),
            managed_by=none_to_omit(managed_by),
            sort_by=none_to_omit(sort_by),
        )

    @t.overload
    async def get(self) -> t.List[toolkit_list_response.Item]:
        """Get all toolkits."""

    @t.overload
    async def get(self, slug: str) -> toolkit_retrieve_response.ToolkitRetrieveResponse:
        """Get a toolkit by slug."""

    @t.overload
    async def get(
        self, *, query: toolkit_list_params.ToolkitListParams
    ) -> t.List[toolkit_list_response.Item]:
        """Get a list of toolkits by query."""

    async def get(
        self,
        slug: t.Optional[str] = None,
        *,
        query: t.Optional[toolkit_list_params.ToolkitListParams] = None,
    ) -> t.Union[
        toolkit_retrieve_response.ToolkitRetrieveResponse,
        t.List[toolkit_list_response.Item],
    ]:
        if slug is not None:
            return await self._client.toolkits.retrieve(slug=slug)
        return (await self._client.toolkits.list(**(query or {}))).items

    async def get_many(
        self,
        slugs: t.Sequence[str],
        *,
        category: t.Optional[str] = None,
        managed_by: t.Optional[t.Literal["composio", "all", "project"]] = None,
        sort_by: t.Optional[t.Literal["usage", "alphabetically"]] = None,
        limit: t.Optional[float] = None,
        cursor: t.Optional[str] = None,
    ) -> t.List[t.Any]:
        """Fetch several toolkits by slug in one request."""
        return (
            await self._client.toolkits.retrieve_multi(
                toolkits=list(slugs),
                category=none_to_omit(category),
                managed_by=none_to_omit(managed_by),
                sort_by=none_to_omit(sort_by),
                limit=none_to_omit(limit),
                cursor=none_to_omit(cursor),
            )
        ).items

    async def changelog(
        self,
    ) -> toolkit_retrieve_changelog_response.ToolkitRetrieveChangelogResponse:
        """Retrieve the toolkit changelog (the last 10 versions per toolkit)."""
        return await self._client.toolkits.retrieve_changelog()

    async def recommend_scopes(
        self,
        toolkit_slug: str,
        **params: te.Unpack[
            toolkit_recommend_scopes_params.ToolkitRecommendScopesParams
        ],
    ) -> toolkit_recommend_scopes_response.ToolkitRecommendScopesResponse:
        """Recommend the OAuth scopes to request so a connection can run the
        given tools. Experimental — the API marks this endpoint beta."""
        return await self._client.toolkits.recommend_scopes(toolkit_slug, **params)

    async def list_grant_contexts(
        self,
        toolkit_slug: str,
        **params: te.Unpack[
            toolkit_retrieve_scopes_grant_context_params.ToolkitRetrieveScopesGrantContextParams
        ],
    ) -> toolkit_retrieve_scopes_grant_context_response.ToolkitRetrieveScopesGrantContextResponse:
        """List the grant-context dimensions a toolkit's scope recommendation
        depends on, with their allowed values and the default the API
        assumes. Experimental — the API marks this endpoint beta."""
        return await self._client.toolkits.retrieve_scopes_grant_context(
            toolkit_slug, **params
        )

    async def list_categories(self):
        """List all categories of toolkits."""
        return (await self._client.toolkits.retrieve_categories()).items

    async def _get_auth_config_id(self, toolkit: str) -> str:
        """Get the auth config ID for a toolkit."""
        auth_configs = await self._client.auth_configs.list(toolkit_slug=toolkit)
        if len(auth_configs.items) > 0:
            auth_config, *_ = sorted(
                auth_configs.items,
                key=lambda x: t.cast(str, x.created_at),
                reverse=True,
            )
            return auth_config.id
        return (
            await self._client.auth_configs.create(
                toolkit={"slug": toolkit},
                auth_config={
                    "type": "use_composio_managed_auth",
                    "tool_access_config": {"tools_for_connected_account_creation": []},
                },
            )
        ).auth_config.id

    async def authorize(self, *, user_id: str, toolkit: str) -> AsyncConnectionRequest:
        """Authorize a user to a toolkit"""
        return await self.connected_accounts.initiate(
            user_id=user_id,
            auth_config_id=await self._get_auth_config_id(toolkit=toolkit),
        )

    async def get_connected_account_initiation_fields(
        self, toolkit: str, auth_scheme: AuthSchemeL, required_only: bool = False
    ) -> AuthFieldsT:
        """Get the required property for a given toolkit and auth scheme."""
        details = (
            await self._client.toolkits.retrieve(slug=toolkit)
        ).auth_config_details or []
        for auth_detail in details:
            if auth_detail.mode != auth_scheme:
                continue
            if required_only:
                return t.cast(
                    AuthFieldsT,
                    auth_detail.fields.connected_account_initiation.required,
                )
            return t.cast(
                AuthFieldsT,
                auth_detail.fields.connected_account_initiation.required
                + auth_detail.fields.connected_account_initiation.optional,
            )
        raise exceptions.InvalidParams(
            f"auth config details not found with toolkit={toolkit!r} and auth_scheme={auth_scheme!r}"
        )

    async def get_auth_config_creation_fields(
        self, toolkit: str, auth_scheme: AuthSchemeL, required_only: bool = False
    ) -> AuthFieldsT:
        """Get the required property for a given toolkit and auth scheme."""
        info = await self._client.toolkits.retrieve(slug=toolkit)
        for auth_detail in info.auth_config_details or []:
            if auth_detail.mode != auth_scheme:
                continue
            if required_only:
                return t.cast(
                    AuthFieldsT, auth_detail.fields.auth_config_creation.required
                )
            return t.cast(
                AuthFieldsT,
                auth_detail.fields.auth_config_creation.required
                + auth_detail.fields.auth_config_creation.optional,
            )
        raise exceptions.InvalidParams(
            f"auth config details not found with toolkit={toolkit!r} and auth_scheme={auth_scheme!r}"
        )
