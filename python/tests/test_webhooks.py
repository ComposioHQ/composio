"""Tests for the ``composio.webhooks`` namespace."""

import warnings
from unittest.mock import Mock

import pytest
from composio_client import omit
from composio_client.types import (
    WebhookSubscriptionCreateResponse,
    WebhookSubscriptionListResponse,
)

from composio import exceptions
from composio.core.models.triggers import Triggers
from composio.core.models.triggers import WebhookVersion as TriggersWebhookVersion
from composio.core.models.webhooks import (
    WebhookEndpoints,
    Webhooks,
    WebhookSubscriptions,
    WebhookVersion,
)
from tests.conftest import mock_http_client


@pytest.fixture
def mock_client() -> Mock:
    client = mock_http_client()
    client.webhook_subscriptions = Mock()
    client.webhook_endpoints = Mock()
    return client


@pytest.fixture
def subscriptions(mock_client: Mock) -> WebhookSubscriptions:
    return WebhookSubscriptions(client=mock_client)


@pytest.fixture
def endpoints(mock_client: Mock) -> WebhookEndpoints:
    return WebhookEndpoints(client=mock_client)


class TestWebhooksNamespace:
    def test_mounts_sub_namespaces(self, mock_client):
        webhooks = Webhooks(client=mock_client)

        assert isinstance(webhooks.subscriptions, WebhookSubscriptions)
        assert isinstance(webhooks.endpoints, WebhookEndpoints)
        assert webhooks.subscriptions._client is mock_client
        assert webhooks.endpoints._client is mock_client

    def test_webhook_version_is_shared_with_triggers(self):
        assert TriggersWebhookVersion is WebhookVersion


class TestWebhookSubscriptions:
    def test_list(self, subscriptions, mock_client):
        mock_client.webhook_subscriptions.list.return_value = "listed"

        assert subscriptions.list() == "listed"
        mock_client.webhook_subscriptions.list.assert_called_once_with(
            limit=omit, cursor=omit
        )

    def test_list_forwards_pagination(self, subscriptions, mock_client):
        subscriptions.list(limit=5, cursor="abc")

        mock_client.webhook_subscriptions.list.assert_called_once_with(
            limit=5, cursor="abc"
        )

    def test_get(self, subscriptions, mock_client):
        mock_client.webhook_subscriptions.retrieve.return_value = "sub"

        assert subscriptions.get("sub_123") == "sub"
        mock_client.webhook_subscriptions.retrieve.assert_called_once_with("sub_123")

    def test_update_omits_absent_fields(self, subscriptions, mock_client):
        mock_client.webhook_subscriptions.update.return_value = "updated"

        assert subscriptions.update("sub_123", webhook_url="https://x") == "updated"
        mock_client.webhook_subscriptions.update.assert_called_once_with(
            "sub_123", webhook_url="https://x", enabled_events=omit, version=omit
        )

    def test_update_normalizes_events_and_version(self, subscriptions, mock_client):
        subscriptions.update(
            "sub_123",
            enabled_events=("composio.trigger.message",),
            version=WebhookVersion.V2,
        )

        mock_client.webhook_subscriptions.update.assert_called_once_with(
            "sub_123",
            webhook_url=omit,
            enabled_events=["composio.trigger.message"],
            version="V2",
        )

    def test_delete(self, subscriptions, mock_client):
        mock_client.webhook_subscriptions.delete.return_value = "deleted"

        assert subscriptions.delete("sub_123") == "deleted"
        mock_client.webhook_subscriptions.delete.assert_called_once_with("sub_123")

    def test_rotate_secret(self, subscriptions, mock_client):
        mock_client.webhook_subscriptions.rotate_secret.return_value = "rotated"

        assert subscriptions.rotate_secret("sub_123") == "rotated"
        mock_client.webhook_subscriptions.rotate_secret.assert_called_once_with(
            "sub_123"
        )

    def test_list_event_types(self, subscriptions, mock_client):
        mock_client.webhook_subscriptions.list_event_types.return_value = "types"

        assert subscriptions.list_event_types() == "types"
        mock_client.webhook_subscriptions.list_event_types.assert_called_once_with()


class TestWebhookSubscriptionsSet:
    def test_creates_when_none_exists(self, subscriptions, mock_client):
        webhook_url = "https://example.com/webhooks/composio"
        raw = {
            "id": "sub_123",
            "webhook_url": webhook_url,
            "version": "V3",
            "enabled_events": ["composio.trigger.message"],
            "secret": "whsec_abc",
        }
        mock_client.webhook_subscriptions.list.return_value = Mock(items=[])
        mock_client.webhook_subscriptions.create.return_value = raw

        result = subscriptions.set(webhook_url=webhook_url)

        mock_client.webhook_subscriptions.list.assert_called_once_with(limit=1)
        mock_client.webhook_subscriptions.create.assert_called_once_with(
            webhook_url=webhook_url,
            enabled_events=["composio.trigger.message"],
            version="V3",
        )
        mock_client.webhook_subscriptions.update.assert_not_called()
        assert result == raw

    def test_updates_first_existing(self, subscriptions, mock_client):
        webhook_url = "https://example.com/webhooks/composio"
        raw = {
            "id": "sub_123",
            "webhook_url": webhook_url,
            "version": "V2",
            "enabled_events": ["composio.connected_account.expired"],
        }
        mock_client.webhook_subscriptions.list.return_value = Mock(
            items=[Mock(id="sub_123")]
        )
        mock_client.webhook_subscriptions.update.return_value = raw

        result = subscriptions.set(
            webhook_url=webhook_url,
            enabled_events=["composio.connected_account.expired"],
            version=WebhookVersion.V2,
        )

        mock_client.webhook_subscriptions.list.assert_called_once_with(limit=1)
        mock_client.webhook_subscriptions.update.assert_called_once_with(
            "sub_123",
            webhook_url=webhook_url,
            enabled_events=["composio.connected_account.expired"],
            version="V2",
        )
        mock_client.webhook_subscriptions.create.assert_not_called()
        assert result == raw

    def test_normalizes_pydantic_response_models(self, subscriptions, mock_client):
        mock_client.webhook_subscriptions.list.return_value = (
            WebhookSubscriptionListResponse.model_validate(
                {
                    "items": [],
                    "total_pages": 0,
                    "current_page": 1,
                    "total_items": 0,
                }
            )
        )
        mock_client.webhook_subscriptions.create.return_value = (
            WebhookSubscriptionCreateResponse.model_validate(
                {
                    "id": "sub_1",
                    "webhook_url": "https://x",
                    "version": "V3",
                    "enabled_events": ["composio.trigger.message"],
                    "secret": "whsec_abc",
                    "created_at": "2026-01-01",
                    "updated_at": "2026-01-02",
                }
            )
        )

        result = subscriptions.set(webhook_url="https://x")

        assert result == {
            "id": "sub_1",
            "webhook_url": "https://x",
            "version": "V3",
            "enabled_events": ["composio.trigger.message"],
            "secret": "whsec_abc",
            "created_at": "2026-01-01",
            "updated_at": "2026-01-02",
        }
        assert isinstance(result["version"], str)
        assert type(result["version"]) is str

    def test_normalizes_unvalidated_response_models_without_warnings(
        self, subscriptions, mock_client
    ):
        # The client builds response models without validation, so enum fields
        # hold plain strings.
        mock_client.webhook_subscriptions.list.return_value = (
            WebhookSubscriptionListResponse.model_construct(items=[])
        )
        mock_client.webhook_subscriptions.create.return_value = (
            WebhookSubscriptionCreateResponse.model_construct(
                id="sub_1",
                webhook_url="https://x",
                version="V3",
                enabled_events=["composio.trigger.message"],
                secret="whsec_abc",
                created_at="2026-01-01",
                updated_at="2026-01-02",
            )
        )

        with warnings.catch_warnings():
            warnings.simplefilter("error")
            result = subscriptions.set(webhook_url="https://x")

        assert result["version"] == "V3"

    def test_normalizes_camel_case_wire_keys(self, subscriptions, mock_client):
        mock_client.webhook_subscriptions.list.return_value = Mock(items=[])
        mock_client.webhook_subscriptions.create.return_value = {
            "id": "sub_1",
            "webhookUrl": "https://x",
            "enabledEvents": ["composio.trigger.message", 42],
            "createdAt": "2026-01-01",
        }

        result = subscriptions.set(webhook_url="https://x")

        assert result == {
            "id": "sub_1",
            "webhook_url": "https://x",
            "version": "V3",
            "enabled_events": ["composio.trigger.message"],
            "created_at": "2026-01-01",
        }

    def test_rejects_empty_webhook_url(self, subscriptions, mock_client):
        with pytest.raises(exceptions.ValidationError):
            subscriptions.set(webhook_url="")
        mock_client.webhook_subscriptions.list.assert_not_called()

    def test_rejects_empty_events(self, subscriptions, mock_client):
        with pytest.raises(exceptions.ValidationError):
            subscriptions.set(webhook_url="https://x", enabled_events=[])
        mock_client.webhook_subscriptions.list.assert_not_called()


class TestTriggersDelegation:
    def test_set_webhook_subscription_delegates_to_webhooks(self, mock_client):
        """``triggers.set_webhook_subscription`` issues the same call sequence
        as ``webhooks.subscriptions.set`` and returns the same shape."""
        mock_client.triggers_types = Mock()
        mock_client.trigger_instances = Mock()
        resource = mock_client.webhook_subscriptions
        resource.list.return_value = Mock(items=[Mock(id="sub_9")])
        resource.update.return_value = {"id": "sub_9", "webhook_url": "https://x"}

        via_triggers = Triggers(client=mock_client).set_webhook_subscription(
            webhook_url="https://x"
        )
        triggers_calls = (
            resource.list.call_args_list,
            resource.update.call_args_list,
            resource.create.call_args_list,
        )
        mock_client.reset_mock()
        resource.list.return_value = Mock(items=[Mock(id="sub_9")])
        resource.update.return_value = {"id": "sub_9", "webhook_url": "https://x"}

        via_webhooks = WebhookSubscriptions(client=mock_client).set(
            webhook_url="https://x"
        )

        assert via_triggers == via_webhooks
        assert triggers_calls == (
            resource.list.call_args_list,
            resource.update.call_args_list,
            resource.create.call_args_list,
        )


class TestWebhookEndpoints:
    def test_list(self, endpoints, mock_client):
        mock_client.webhook_endpoints.list.return_value = "listed"

        assert endpoints.list() == "listed"
        mock_client.webhook_endpoints.list.assert_called_once_with(toolkit_slug=omit)

    def test_list_with_toolkit_filter(self, endpoints, mock_client):
        endpoints.list(toolkit_slug="github")

        mock_client.webhook_endpoints.list.assert_called_once_with(
            toolkit_slug="github"
        )

    def test_get(self, endpoints, mock_client):
        mock_client.webhook_endpoints.retrieve.return_value = "endpoint"

        assert endpoints.get("we_1") == "endpoint"
        mock_client.webhook_endpoints.retrieve.assert_called_once_with("we_1")

    def test_create(self, endpoints, mock_client):
        mock_client.webhook_endpoints.create.return_value = "created"

        assert endpoints.create(toolkit_slug="github", client_id="cid") == "created"
        mock_client.webhook_endpoints.create.assert_called_once_with(
            toolkit_slug="github", client_id="cid"
        )

    def test_replace(self, endpoints, mock_client):
        mock_client.webhook_endpoints.replace.return_value = "replaced"

        assert endpoints.replace("we_1", data={"secret": "s"}) == "replaced"
        mock_client.webhook_endpoints.replace.assert_called_once_with(
            "we_1", data={"secret": "s"}
        )

    def test_update(self, endpoints, mock_client):
        mock_client.webhook_endpoints.update.return_value = "updated"

        assert endpoints.update("we_1", data={"secret": "s"}) == "updated"
        mock_client.webhook_endpoints.update.assert_called_once_with(
            "we_1", data={"secret": "s"}
        )
