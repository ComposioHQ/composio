"""
Webhooks module for the Composio SDK.

Exposes ``composio.webhooks.subscriptions`` (the project-level webhook
subscription used for event delivery) and ``composio.webhooks.endpoints``
(per toolkit + OAuth app inbound ingress URLs).
"""

from __future__ import annotations

import typing as t
from enum import Enum

import pydantic

from composio import exceptions
from composio.client import HttpClient
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
from composio.core.models.base import Resource
from composio.utils.pydantic import none_to_omit


class WebhookVersion(str, Enum):
    """Webhook payload version."""

    V1 = "V1"
    V2 = "V2"
    V3 = "V3"


WebhookVersionL = t.Literal["V1", "V2", "V3"]

_WEBHOOK_VERSIONS: t.Dict[str, WebhookVersionL] = {"V1": "V1", "V2": "V2", "V3": "V3"}


def _webhook_version(version: t.Union[WebhookVersion, str]) -> WebhookVersionL:
    """Narrow a caller-supplied version to the literal the client accepts."""
    value = version.value if isinstance(version, WebhookVersion) else version
    literal = _WEBHOOK_VERSIONS.get(value)
    if literal is None:
        raise exceptions.ValidationError(
            f"unsupported webhook version {value!r}; expected one of V1, V2, V3"
        )
    return literal


class WebhookSubscription(t.TypedDict, total=False):
    """Webhook subscription returned by the Composio API."""

    id: str
    webhook_url: str
    version: str
    enabled_events: t.List[str]
    secret: str
    created_at: str
    updated_at: str


DEFAULT_WEBHOOK_SUBSCRIPTION_EVENTS = ("composio.trigger.message",)


def normalize_webhook_subscription(raw: object) -> WebhookSubscription:
    """Build a typed :class:`WebhookSubscription` from an API response.

    Accepts either the client's pydantic response models or a plain dict.
    Maps explicitly (accepting either snake_case or camelCase wire keys)
    instead of ``cast``-ing the raw object, so the returned dict always
    matches the declared shape and a shift in the wire format surfaces as a
    normalized field rather than a ``KeyError`` at the call site.
    """
    if isinstance(raw, pydantic.BaseModel):
        # The client builds response models without validation, so enum
        # fields hold plain strings; silence pydantic's serializer warnings.
        data: t.Dict[str, t.Any] = raw.model_dump(mode="json", warnings=False)
    elif isinstance(raw, dict):
        data = raw
    else:
        data = {}

    def _first_str(*keys: str) -> t.Optional[str]:
        for key in keys:
            value = data.get(key)
            if isinstance(value, str) and value:
                return value
        return None

    def _str_list(*keys: str) -> t.List[str]:
        for key in keys:
            value = data.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, str)]
        return []

    result: WebhookSubscription = {
        "id": _first_str("id") or "",
        "webhook_url": _first_str("webhook_url", "webhookUrl") or "",
        "version": _first_str("version") or WebhookVersion.V3.value,
        "enabled_events": _str_list("enabled_events", "enabledEvents"),
    }
    secret = _first_str("secret")
    if secret is not None:
        result["secret"] = secret
    created_at = _first_str("created_at", "createdAt")
    if created_at is not None:
        result["created_at"] = created_at
    updated_at = _first_str("updated_at", "updatedAt")
    if updated_at is not None:
        result["updated_at"] = updated_at
    return result


def first_webhook_subscription_id(response: object) -> t.Optional[str]:
    """Return the id of the first subscription in a list response.

    Accepts the client's typed list response (``.items`` of models with an
    ``.id``) as well as a plain dict of the same shape.
    """
    items = (
        response.get("items")
        if isinstance(response, dict)
        else getattr(response, "items", None)
    )
    if not isinstance(items, list) or len(items) == 0:
        return None

    first = items[0]
    subscription_id = (
        first.get("id") if isinstance(first, dict) else getattr(first, "id", None)
    )
    return subscription_id if isinstance(subscription_id, str) else None


class WebhookSubscriptions(Resource):
    """Manage the project webhook subscription.

    The API allows one subscription per project; the signing secret is
    returned in responses.
    """

    def list(
        self,
        *,
        limit: t.Optional[float] = None,
        cursor: t.Optional[str] = None,
    ) -> webhook_subscription_list_response.WebhookSubscriptionListResponse:
        """
        List webhook subscriptions for the project.

        :param limit: Maximum number of subscriptions to return.
        :param cursor: Pagination cursor from a previous response.
        :return: Paginated list of subscriptions.

        Example:
            subscriptions = composio.webhooks.subscriptions.list()
        """
        return self._client.webhook_subscriptions.list(
            limit=none_to_omit(limit),
            cursor=none_to_omit(cursor),
        )

    def get(
        self, id: str
    ) -> webhook_subscription_retrieve_response.WebhookSubscriptionRetrieveResponse:
        """
        Retrieve a webhook subscription by id.

        :param id: The subscription id.
        :return: The subscription, including its signing secret.

        Example:
            subscription = composio.webhooks.subscriptions.get("sub_123")
        """
        return self._client.webhook_subscriptions.retrieve(id)

    def set(
        self,
        *,
        webhook_url: str,
        enabled_events: t.Optional[t.Sequence[str]] = None,
        version: t.Union[WebhookVersion, str] = WebhookVersion.V3,
    ) -> WebhookSubscription:
        """
        Create or update the project webhook subscription used for webhook delivery.

        If a subscription already exists, the first subscription is updated. Otherwise a
        new subscription is created. By default this subscribes to V3 trigger message
        events.

        :param webhook_url: The URL Composio delivers events to.
        :param enabled_events: Event types to subscribe to. Defaults to
            ``composio.trigger.message``.
        :param version: Webhook payload version. Defaults to ``V3``.
        :return: The normalized subscription.

        Example:
            composio.webhooks.subscriptions.set(
                webhook_url=f"{APP_URL}/webhooks/composio",
            )
        """
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

        existing = self._client.webhook_subscriptions.list(limit=1)
        subscription_id = first_webhook_subscription_id(existing)

        if subscription_id:
            return normalize_webhook_subscription(
                self._client.webhook_subscriptions.update(
                    subscription_id,
                    webhook_url=webhook_url,
                    enabled_events=events,
                    version=version_value,
                )
            )

        return normalize_webhook_subscription(
            self._client.webhook_subscriptions.create(
                webhook_url=webhook_url,
                enabled_events=events,
                version=version_value,
            )
        )

    def update(
        self,
        id: str,
        *,
        webhook_url: t.Optional[str] = None,
        enabled_events: t.Optional[t.Sequence[str]] = None,
        version: t.Union[WebhookVersion, str, None] = None,
    ) -> webhook_subscription_update_response.WebhookSubscriptionUpdateResponse:
        """
        Update an existing webhook subscription. Omitted fields are preserved.

        :param id: The subscription id.
        :param webhook_url: New delivery URL.
        :param enabled_events: New list of subscribed event types.
        :param version: New webhook payload version.
        :return: The updated subscription.

        Example:
            composio.webhooks.subscriptions.update(
                "sub_123",
                enabled_events=["composio.trigger.message"],
            )
        """
        version_value = None if version is None else _webhook_version(version)
        return self._client.webhook_subscriptions.update(
            id,
            webhook_url=none_to_omit(webhook_url),
            enabled_events=none_to_omit(
                list(enabled_events) if enabled_events is not None else None
            ),
            version=none_to_omit(version_value),
        )

    def delete(
        self, id: str
    ) -> webhook_subscription_delete_response.WebhookSubscriptionDeleteResponse:
        """
        Delete a webhook subscription.

        :param id: The subscription id.
        :return: The deletion response.

        Example:
            composio.webhooks.subscriptions.delete("sub_123")
        """
        return self._client.webhook_subscriptions.delete(id)

    def rotate_secret(
        self, id: str
    ) -> webhook_subscription_rotate_secret_response.WebhookSubscriptionRotateSecretResponse:
        """
        Rotate the signing secret of a webhook subscription.

        :param id: The subscription id.
        :return: The subscription with its new signing secret.

        Example:
            rotated = composio.webhooks.subscriptions.rotate_secret("sub_123")
            new_secret = rotated.secret
        """
        return self._client.webhook_subscriptions.rotate_secret(id)

    def list_event_types(
        self,
    ) -> webhook_subscription_list_event_types_response.WebhookSubscriptionListEventTypesResponse:
        """
        List the event types a subscription can be enabled for.

        :return: The available event types.

        Example:
            event_types = composio.webhooks.subscriptions.list_event_types()
        """
        return self._client.webhook_subscriptions.list_event_types()


class WebhookEndpoints(Resource):
    """Manage inbound webhook endpoints (per toolkit + OAuth app ingress URLs)."""

    def list(
        self,
        *,
        toolkit_slug: t.Optional[str] = None,
    ) -> webhook_endpoint_list_response.WebhookEndpointListResponse:
        """
        List webhook endpoints, optionally filtered by toolkit.

        :param toolkit_slug: Only return endpoints for this toolkit.
        :return: The list of endpoints.

        Example:
            endpoints = composio.webhooks.endpoints.list(toolkit_slug="github")
        """
        return self._client.webhook_endpoints.list(
            toolkit_slug=none_to_omit(toolkit_slug),
        )

    def get(
        self, nano_id: str
    ) -> webhook_endpoint_retrieve_response.WebhookEndpointRetrieveResponse:
        """
        Retrieve a webhook endpoint by id.

        :param nano_id: The endpoint id.
        :return: The endpoint.

        Example:
            endpoint = composio.webhooks.endpoints.get("we_123")
        """
        return self._client.webhook_endpoints.retrieve(nano_id)

    def create(
        self,
        *,
        toolkit_slug: str,
        client_id: str,
    ) -> webhook_endpoint_create_response.WebhookEndpointCreateResponse:
        """
        Create a webhook endpoint for a toolkit and OAuth app.

        :param toolkit_slug: The toolkit the endpoint receives events for.
        :param client_id: The OAuth app client id the endpoint is bound to.
        :return: The created endpoint, including its ingress ``webhook_url``.

        Example:
            endpoint = composio.webhooks.endpoints.create(
                toolkit_slug="github",
                client_id="Iv1.abc123",
            )
        """
        return self._client.webhook_endpoints.create(
            toolkit_slug=toolkit_slug,
            client_id=client_id,
        )

    def replace(
        self,
        nano_id: str,
        *,
        data: t.Dict[str, t.Any],
    ) -> webhook_endpoint_replace_response.WebhookEndpointReplaceResponse:
        """
        Replace the stored data of a webhook endpoint (full replacement).

        :param nano_id: The endpoint id.
        :param data: The complete new endpoint data.
        :return: The updated endpoint.

        Example:
            composio.webhooks.endpoints.replace(
                "we_123",
                data={"secret": "new-signing-secret"},
            )
        """
        return self._client.webhook_endpoints.replace(nano_id, data=data)

    def update(
        self,
        nano_id: str,
        *,
        data: t.Dict[str, t.Any],
    ) -> webhook_endpoint_update_response.WebhookEndpointUpdateResponse:
        """
        Merge new data into a webhook endpoint (partial update).

        :param nano_id: The endpoint id.
        :param data: The fields to merge into the endpoint data.
        :return: The updated endpoint.

        Example:
            composio.webhooks.endpoints.update(
                "we_123",
                data={"secret": "new-signing-secret"},
            )
        """
        return self._client.webhook_endpoints.update(nano_id, data=data)


class Webhooks(Resource):
    """Webhooks namespace, exposed as ``composio.webhooks``."""

    subscriptions: WebhookSubscriptions
    """Project webhook subscription used for event delivery."""

    endpoints: WebhookEndpoints
    """Inbound webhook endpoints (per toolkit + OAuth app)."""

    def __init__(self, client: HttpClient):
        super().__init__(client)
        self.subscriptions = WebhookSubscriptions(client)
        self.endpoints = WebhookEndpoints(client)
