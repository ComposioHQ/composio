from __future__ import annotations

import asyncio
import functools
import typing as t
import weakref

from composio_client import APIStatusError, Omit, omit
from composio_client.types import TriggersTypeRetrieveResponse

from composio import exceptions
from composio.client._async import AsyncHttpClient
from composio.client.types import trigger_instance_upsert_response
from composio.core.models.base import AsyncResource
from composio.core.models.triggers import VerifyWebhookResult, _WebhookParser
from composio.core.models.webhooks import (
    WebhookSubscription,
    WebhookVersion,
)
from composio.core.types import ToolkitVersionParam
from composio.utils.pydantic import none_to_omit

from .subscription import AsyncTriggerSubscription, SubscriptionErrorHandler
from .webhooks import AsyncWebhookSubscriptions


class AsyncTriggers(AsyncResource, _WebhookParser):
    """Async counterpart to Triggers."""

    def __init__(
        self,
        client: AsyncHttpClient,
        toolkit_versions: t.Optional[ToolkitVersionParam] = None,
    ):
        super().__init__(client)
        self._closed = False
        self._connections: set[asyncio.Task[None]] = set()
        self._subscriptions: weakref.WeakSet[AsyncTriggerSubscription] = (
            weakref.WeakSet()
        )
        self._toolkit_versions = toolkit_versions
        self.list_enum = self._client.triggers_types.retrieve_enum
        self.delete = self._client.trigger_instances.manage.delete
        self.enable = functools.partial(
            self._client.trigger_instances.manage.update, status="enable"
        )
        self.disable = functools.partial(
            self._client.trigger_instances.manage.update, status="disable"
        )

    async def set_webhook_subscription(
        self,
        *,
        webhook_url: str,
        enabled_events: t.Optional[t.Sequence[str]] = None,
        version: t.Union[WebhookVersion, str] = WebhookVersion.V3,
    ) -> WebhookSubscription:
        """Create or update the project webhook subscription used for webhook delivery."""
        return await AsyncWebhookSubscriptions(client=self._client).set(
            webhook_url=webhook_url, enabled_events=enabled_events, version=version
        )

    async def get_type(self, slug: str) -> TriggersTypeRetrieveResponse:
        """Get a trigger type by its slug
        Uses the global toolkit version provided when initializing composio instance to fetch trigger for specific toolkit version"""
        return await self._client.triggers_types.retrieve(
            slug=slug, toolkit_versions=none_to_omit(self._toolkit_versions)
        )

    async def list_active(
        self,
        trigger_ids: t.Optional[list[str]] = None,
        trigger_names: t.Optional[list[str]] = None,
        auth_config_ids: t.Optional[list[str]] = None,
        connected_account_ids: t.Optional[list[str]] = None,
        show_disabled: t.Optional[bool] = None,
        limit: t.Optional[int] = None,
        cursor: t.Optional[str] = None,
    ):
        """List all active triggers"""
        return await self._client.trigger_instances.list_active(
            query_trigger_ids_1=trigger_ids,
            query_trigger_names_1=trigger_names,
            query_auth_config_ids_1=auth_config_ids,
            query_connected_account_ids_1=connected_account_ids,
            query_show_disabled_1=show_disabled,
            limit=limit if limit is not None else omit,
            cursor=cursor if cursor is not None else omit,
        )

    async def list(
        self,
        *,
        cursor: t.Optional[str] = None,
        limit: t.Optional[int] = None,
        toolkit_slugs: t.Optional[list[str]] = None,
    ):
        """List all the trigger types."""
        return await self._client.triggers_types.list(
            cursor=none_to_omit(cursor),
            limit=none_to_omit(limit),
            toolkit_slugs=none_to_omit(toolkit_slugs),
            toolkit_versions=none_to_omit(self._toolkit_versions),
        )

    @t.overload
    async def create(
        self,
        slug: str,
        *,
        connected_account_id: str,
        trigger_config: t.Optional[t.Dict[str, t.Any]] = None,
        type: t.Optional[t.Literal["webhook", "poll"]] = None,
        polling_interval: t.Optional[int] = None,
    ) -> trigger_instance_upsert_response.TriggerInstanceUpsertResponse: ...

    @t.overload
    async def create(
        self,
        slug: str,
        *,
        user_id: str,
        trigger_config: t.Optional[t.Dict[str, t.Any]] = None,
        type: t.Optional[t.Literal["webhook", "poll"]] = None,
        polling_interval: t.Optional[int] = None,
    ) -> trigger_instance_upsert_response.TriggerInstanceUpsertResponse: ...

    async def create(
        self,
        slug: str,
        *,
        user_id: t.Optional[str] = None,
        connected_account_id: t.Optional[str] = None,
        trigger_config: t.Optional[t.Dict[str, t.Any]] = None,
        type: t.Optional[t.Literal["webhook", "poll"]] = None,
        polling_interval: t.Optional[int] = None,
    ) -> trigger_instance_upsert_response.TriggerInstanceUpsertResponse:
        """Create a trigger instance"""
        if isinstance(user_id, str) and not user_id.strip():
            user_id = None
        if isinstance(connected_account_id, str) and not connected_account_id.strip():
            connected_account_id = None
        if user_id is None and connected_account_id is None:
            raise exceptions.InvalidParams(
                "please provide valid `connected_account_id` or `user_id`"
            )
        try:
            await self.get_type(slug=slug)
        except APIStatusError as error:
            if error.status_code in (400, 404):
                raise exceptions.TriggerTypeNotFound(
                    f"Trigger type {slug} not found"
                ) from error
            raise
        return await self._client.trigger_instances.upsert(
            slug=slug,
            connected_account_id=none_to_omit(connected_account_id),
            toolkit_versions=self._toolkit_versions,
            body_trigger_config_1=none_to_omit(trigger_config),
            type=none_to_omit(type),
            polling_interval=none_to_omit(polling_interval),
            user_id=none_to_omit(user_id),
        )

    async def subscribe(
        self,
        timeout: float = 15.0,
        on_subscription_error: SubscriptionErrorHandler | None = None,
    ) -> AsyncTriggerSubscription:
        """Open a realtime subscription and deliver coroutine handlers on this loop."""
        if self._closed:
            raise RuntimeError("Cannot subscribe with a closed client")
        subscription = AsyncTriggerSubscription(self._client, on_subscription_error)
        self._subscriptions.add(subscription)
        connection = asyncio.create_task(subscription.connect(timeout))
        self._connections.add(connection)
        try:
            await connection
        except BaseException:
            await subscription.stop()
            self._subscriptions.discard(subscription)
            raise
        finally:
            self._connections.discard(connection)
        return subscription

    async def aclose(self) -> None:
        self._closed = True
        connections = tuple(self._connections)
        for connection in connections:
            connection.cancel()
        await asyncio.gather(*connections, return_exceptions=True)
        for subscription in tuple(self._subscriptions):
            await subscription.stop()
            self._subscriptions.discard(subscription)

    def verify_webhook(
        self,
        *,
        id: str,
        payload: str,
        secret: str,
        signature: str,
        timestamp: str,
        tolerance: int = 300,
    ) -> VerifyWebhookResult:
        """Verify an incoming webhook payload and signature."""
        return super().verify_webhook(
            id=id,
            payload=payload,
            secret=secret,
            signature=signature,
            timestamp=timestamp,
            tolerance=tolerance,
        )

    def parse(
        self,
        request: t.Any = None,
        *,
        body: t.Union[str, bytes, t.Mapping[str, t.Any], None] = None,
        headers: t.Union[t.Mapping[str, t.Any], None] = None,
        verify_secret: t.Union[str, None, Omit] = omit,
        tolerance: int = 300,
    ) -> VerifyWebhookResult:
        """Parse an incoming webhook request into a typed, normalized trigger payload."""
        return super().parse(
            request=request,
            body=body,
            headers=headers,
            verify_secret=verify_secret,
            tolerance=tolerance,
        )
