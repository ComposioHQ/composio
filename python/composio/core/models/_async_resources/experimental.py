from __future__ import annotations

import typing as t
import warnings

import typing_extensions as te

from composio.client._async import AsyncHttpClient
from composio.client.types import (
    connected_account_patch_response,
    custom_create_toolkit_params,
    custom_create_toolkit_response,
    custom_delete_toolkit_response,
    custom_sync_response,
    custom_update_toolkits_params,
    custom_update_toolkits_response,
    custom_upsert_params,
    custom_upsert_response,
    usage_retrieve_params,
    usage_retrieve_response,
    usage_retrieve_summary_params,
)
from composio.core.models import experimental as sync
from composio.core.models.custom_tool import (
    ExperimentalToolkit,
)
from composio.core.models.experimental import (
    _UPSERT_DEPRECATION,
    ExperimentalAPI,
    UsageSummaryResponse,
)
from composio.utils.pydantic import none_to_omit


class AsyncExperimentalUsage:
    """Async counterpart to ExperimentalUsage."""

    def __init__(self, client: t.Optional[AsyncHttpClient] = None) -> None:
        self._client = client

    def _require_client(self) -> AsyncHttpClient:
        from composio import exceptions

        if self._client is None:
            raise exceptions.ValidationError(
                "experimental.usage requires a Composio client. Access it via composio.experimental.usage.summary(...)."
            )
        return self._client

    async def summary(
        self,
        **params: te.Unpack[usage_retrieve_summary_params.UsageRetrieveSummaryParams],
    ) -> UsageSummaryResponse:
        """Fetch a usage summary for the project. Experimental — shape may change."""
        response = await self._require_client().project.usage.retrieve_summary(**params)
        return UsageSummaryResponse.model_validate(response.model_dump())

    async def breakdown(
        self,
        entity_type: str,
        **params: te.Unpack[usage_retrieve_params.UsageRetrieveParams],
    ) -> usage_retrieve_response.UsageRetrieveResponse:
        """Fetch a grouped usage breakdown for one entity type. Experimental —
        shape may change."""
        return await self._require_client().project.usage.retrieve(
            entity_type, **params
        )


class AsyncCustomToolkits:
    """Async counterpart to CustomToolkits."""

    def __init__(self, client: t.Optional[AsyncHttpClient] = None) -> None:
        self._client = client

    def _require_client(self) -> AsyncHttpClient:
        from composio import exceptions

        if self._client is None:
            raise exceptions.ValidationError(
                "custom_toolkits requires a Composio client. Access it via composio.custom_toolkits.create(...)."
            )
        return self._client

    async def create(
        self,
        **params: te.Unpack[custom_create_toolkit_params.CustomCreateToolkitParams],
    ) -> custom_create_toolkit_response.CustomCreateToolkitResponse:
        """Create a custom MCP toolkit and return its generated slug."""
        return await self._require_client().custom.create_toolkit(**params)

    async def update(
        self,
        slug: str,
        **params: te.Unpack[custom_update_toolkits_params.CustomUpdateToolkitsParams],
    ) -> custom_update_toolkits_response.CustomUpdateToolkitsResponse:
        """Update a custom toolkit's name, logo or API key field copy. Omitted
        fields keep their current value."""
        return await self._require_client().custom.update_toolkits(slug, **params)

    @te.deprecated(_UPSERT_DEPRECATION, category=None)
    async def upsert(
        self, **params: te.Unpack[custom_upsert_params.CustomUpsertParams]
    ) -> custom_upsert_response.CustomUpsertResponse:
        """Create a custom toolkit, or update its display metadata (name, API key
        field copy) when the project already owns one with this slug."""
        if not sync._upsert_warning_emitted:
            from composio import exceptions

            sync._upsert_warning_emitted = True
            warnings.warn(
                _UPSERT_DEPRECATION, exceptions.ComposioDeprecationWarning, stacklevel=2
            )
        return await self._require_client().custom.upsert(**params)

    async def sync(
        self, slug: str, *, connected_account_id: t.Optional[str] = None
    ) -> custom_sync_response.CustomSyncResponse:
        """Re-fetch a custom toolkit's tool definitions from its remote MCP
        server. Call it when automatic sync fails or the remote tools change."""
        return await self._require_client().custom.sync(
            slug=slug, connected_account_id=none_to_omit(connected_account_id)
        )

    async def delete(
        self, slug: str
    ) -> custom_delete_toolkit_response.CustomDeleteToolkitResponse:
        """Delete a custom toolkit owned by the project, with its tools, auth
        configs and connected accounts. The credentials behind those
        connected accounts are revoked in background jobs
        (``revoke_job_ids``). Composio-managed toolkits cannot be deleted
        (API 403)."""
        return await self._require_client().custom.delete_toolkit(slug)


class AsyncExperimentalAPI:
    """Async counterpart to ExperimentalAPI."""

    Toolkit = ExperimentalToolkit
    usage: AsyncExperimentalUsage
    custom_toolkits: AsyncCustomToolkits

    def __init__(self, client: t.Optional[AsyncHttpClient] = None) -> None:
        self._client = client
        self.usage = AsyncExperimentalUsage(client=client)
        self.custom_toolkits = AsyncCustomToolkits(client=client)

    async def update_acl(
        self,
        nanoid: str,
        *,
        allow_all_users: t.Optional[bool] = None,
        allowed_user_ids: t.Optional[t.List[str]] = None,
        not_allowed_user_ids: t.Optional[t.List[str]] = None,
    ) -> connected_account_patch_response.ConnectedAccountPatchResponse:
        """Update the per-user ACL on a SHARED connected account. Experimental —
        shape may change in future releases."""
        from composio import exceptions

        from .connected_accounts import AsyncConnectedAccounts

        if self._client is None:
            raise exceptions.ValidationError(
                "update_acl requires a Composio client. Access it via composio.connected_accounts.update_acl(...)."
            )
        return await AsyncConnectedAccounts(client=self._client).update_acl(
            nanoid,
            allow_all_users=allow_all_users,
            allowed_user_ids=allowed_user_ids,
            not_allowed_user_ids=not_allowed_user_ids,
        )

    tool = ExperimentalAPI().tool
