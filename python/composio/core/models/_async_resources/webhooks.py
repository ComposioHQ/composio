from __future__ import annotations

import typing as t

from composio import exceptions
from composio.client._async import AsyncHttpClient
from composio.client.types import (
    webhook_endpoint_create_response,
    webhook_endpoint_list_response,
    webhook_endpoint_replace_response,
    webhook_endpoint_retrieve_response,
    webhook_endpoint_update_response,
    webhook_subscription_delete_response,
    webhook_subscription_list_event_types_response,
    webhook_subscription_list_response,
    webhook_subscription_retrieve_response,
    webhook_subscription_rotate_secret_response,
    webhook_subscription_update_response,
)
from composio.core.models.base import AsyncResource
from composio.core.models.webhooks import (
    DEFAULT_WEBHOOK_SUBSCRIPTION_EVENTS,
    WebhookSubscription,
    WebhookVersion,
    _webhook_version,
    first_webhook_subscription_id,
    normalize_webhook_subscription,
)
from composio.utils.pydantic import none_to_omit


class AsyncWebhookSubscriptions(AsyncResource):
    """Async counterpart to WebhookSubscriptions."""

    async def list(
        self, *, limit: t.Optional[float] = None, cursor: t.Optional[str] = None
    ) -> webhook_subscription_list_response.WebhookSubscriptionListResponse:
        """List webhook subscriptions for the project."""
        return await self._client.webhook_subscriptions.list(
            limit=none_to_omit(limit), cursor=none_to_omit(cursor)
        )

    async def get(
        self, id: str
    ) -> webhook_subscription_retrieve_response.WebhookSubscriptionRetrieveResponse:
        """Retrieve a webhook subscription by id."""
        return await self._client.webhook_subscriptions.retrieve(id)

    async def set(
        self,
        *,
        webhook_url: str,
        enabled_events: t.Optional[t.Sequence[str]] = None,
        version: t.Union[WebhookVersion, str] = WebhookVersion.V3,
    ) -> WebhookSubscription:
        """Create or update the project webhook subscription used for webhook delivery."""
        if not webhook_url:
            raise exceptions.ValidationError("please provide a valid `webhook_url`")
        events = list(
            DEFAULT_WEBHOOK_SUBSCRIPTION_EVENTS
            if enabled_events is None
            else enabled_events
        )
        if len(events) == 0:
            raise exceptions.ValidationError(
                "please provide at least one enabled event"
            )
        version_value = _webhook_version(version)
        existing = await self._client.webhook_subscriptions.list(limit=1)
        subscription_id = first_webhook_subscription_id(existing)
        if subscription_id:
            return normalize_webhook_subscription(
                await self._client.webhook_subscriptions.update(
                    subscription_id,
                    webhook_url=webhook_url,
                    enabled_events=events,
                    version=version_value,
                )
            )
        return normalize_webhook_subscription(
            await self._client.webhook_subscriptions.create(
                webhook_url=webhook_url, enabled_events=events, version=version_value
            )
        )

    async def update(
        self,
        id: str,
        *,
        webhook_url: t.Optional[str] = None,
        enabled_events: t.Optional[t.Sequence[str]] = None,
        version: t.Union[WebhookVersion, str, None] = None,
    ) -> webhook_subscription_update_response.WebhookSubscriptionUpdateResponse:
        """Update an existing webhook subscription. Omitted fields are preserved."""
        version_value = None if version is None else _webhook_version(version)
        return await self._client.webhook_subscriptions.update(
            id,
            webhook_url=none_to_omit(webhook_url),
            enabled_events=none_to_omit(
                list(enabled_events) if enabled_events is not None else None
            ),
            version=none_to_omit(version_value),
        )

    async def delete(
        self, id: str
    ) -> webhook_subscription_delete_response.WebhookSubscriptionDeleteResponse:
        """Delete a webhook subscription."""
        return await self._client.webhook_subscriptions.delete(id)

    async def rotate_secret(
        self, id: str
    ) -> webhook_subscription_rotate_secret_response.WebhookSubscriptionRotateSecretResponse:
        """Rotate the signing secret of a webhook subscription."""
        return await self._client.webhook_subscriptions.rotate_secret(id)

    async def list_event_types(
        self,
    ) -> webhook_subscription_list_event_types_response.WebhookSubscriptionListEventTypesResponse:
        """List the event types a subscription can be enabled for."""
        return await self._client.webhook_subscriptions.list_event_types()


class AsyncWebhookEndpoints(AsyncResource):
    """Async counterpart to WebhookEndpoints."""

    async def list(
        self, *, toolkit_slug: t.Optional[str] = None
    ) -> webhook_endpoint_list_response.WebhookEndpointListResponse:
        """List webhook endpoints, optionally filtered by toolkit."""
        return await self._client.webhook_endpoints.list(
            toolkit_slug=none_to_omit(toolkit_slug)
        )

    async def get(
        self, nano_id: str
    ) -> webhook_endpoint_retrieve_response.WebhookEndpointRetrieveResponse:
        """Retrieve a webhook endpoint by id."""
        return await self._client.webhook_endpoints.retrieve(nano_id)

    async def create(
        self, *, toolkit_slug: str, client_id: str
    ) -> webhook_endpoint_create_response.WebhookEndpointCreateResponse:
        """Create a webhook endpoint for a toolkit and OAuth app."""
        return await self._client.webhook_endpoints.create(
            toolkit_slug=toolkit_slug, client_id=client_id
        )

    async def replace(
        self, nano_id: str, *, data: t.Dict[str, t.Any]
    ) -> webhook_endpoint_replace_response.WebhookEndpointReplaceResponse:
        """Replace the stored data of a webhook endpoint (full replacement)."""
        return await self._client.webhook_endpoints.replace(nano_id, data=data)

    async def update(
        self, nano_id: str, *, data: t.Dict[str, t.Any]
    ) -> webhook_endpoint_update_response.WebhookEndpointUpdateResponse:
        """Merge new data into a webhook endpoint (partial update)."""
        return await self._client.webhook_endpoints.update(nano_id, data=data)


class AsyncWebhooks(AsyncResource):
    """Async counterpart to Webhooks."""

    subscriptions: AsyncWebhookSubscriptions
    endpoints: AsyncWebhookEndpoints

    def __init__(self, client: AsyncHttpClient):
        super().__init__(client)
        self.subscriptions = AsyncWebhookSubscriptions(client)
        self.endpoints = AsyncWebhookEndpoints(client)
