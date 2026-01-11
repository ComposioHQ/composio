"""Tests for Triggers class."""

import base64
import hashlib
import hmac
import json
import time
import pytest
from datetime import datetime, timezone
from unittest.mock import Mock, patch
from composio_client import omit
from composio.core.models.triggers import Triggers, WebhookVersion
from composio import exceptions


class TestTriggers:
    """Test cases for Triggers class."""

    @pytest.fixture
    def mock_client(self):
        """Create a mock HTTP client."""
        client = Mock()
        client.triggers_types = Mock()
        client.trigger_instances = Mock()
        client.trigger_instances.manage = Mock()
        client.connected_accounts = Mock()
        return client

    @pytest.fixture
    def triggers(self, mock_client):
        """Create a Triggers instance with default toolkit versions."""
        return Triggers(client=mock_client)

    @pytest.fixture
    def triggers_with_versions(self, mock_client):
        """Create a Triggers instance with custom toolkit versions."""
        return Triggers(
            client=mock_client,
            toolkit_versions={"github": "12082025_00", "slack": "10082025_01"},
        )

    @pytest.fixture
    def mock_trigger_type(self):
        """Mock trigger type response."""
        mock_type = Mock()
        mock_type.slug = "GITHUB_COMMIT_EVENT"
        mock_type.name = "GitHub Commit Event"
        mock_type.description = "Triggered when a commit is pushed"
        mock_type.toolkit = Mock()
        mock_type.toolkit.slug = "github"
        mock_type.toolkit.name = "GitHub"
        return mock_type

    @pytest.fixture
    def mock_trigger_instances(self):
        """Mock trigger instances list response."""
        mock_response = Mock()
        mock_response.items = [
            Mock(
                id="trigger-1",
                connected_account_id="conn-123",
                disabled_at=None,
                state={"lastRun": "2024-01-01T00:00:00Z"},
                trigger_config={"webhook_url": "https://example.com/webhook"},
                trigger_name="GITHUB_COMMIT_EVENT",
                updated_at="2024-01-01T00:00:00Z",
                trigger_data='{"event":"push"}',
            ),
        ]
        mock_response.next_cursor = None
        mock_response.total_pages = 1
        return mock_response

    def test_init_with_default_versions(self, mock_client):
        """Test Triggers initialization with default toolkit versions."""
        triggers = Triggers(client=mock_client)

        assert triggers._client == mock_client
        assert triggers._toolkit_versions is None
        assert callable(triggers.list_enum)
        assert callable(triggers.delete)
        assert callable(triggers.enable)
        assert callable(triggers.disable)

    def test_init_with_custom_versions(self, mock_client):
        """Test Triggers initialization with custom toolkit versions."""
        custom_versions = {"github": "12082025_00", "slack": "10082025_01"}
        triggers = Triggers(client=mock_client, toolkit_versions=custom_versions)

        assert triggers._toolkit_versions == custom_versions

    def test_get_type_with_default_versions(
        self, triggers, mock_client, mock_trigger_type
    ):
        """Test get_type with default toolkit versions."""
        mock_client.triggers_types.retrieve.return_value = mock_trigger_type

        result = triggers.get_type("GITHUB_COMMIT_EVENT")

        # When toolkit_versions is None, it should be converted to omit
        call_kwargs = mock_client.triggers_types.retrieve.call_args.kwargs
        assert call_kwargs["slug"] == "GITHUB_COMMIT_EVENT"
        assert call_kwargs["toolkit_versions"] is omit
        assert result == mock_trigger_type

    def test_get_type_with_custom_versions(
        self, triggers_with_versions, mock_client, mock_trigger_type
    ):
        """Test get_type with custom toolkit versions."""
        mock_client.triggers_types.retrieve.return_value = mock_trigger_type
        custom_versions = {"github": "12082025_00", "slack": "10082025_01"}

        result = triggers_with_versions.get_type("GITHUB_COMMIT_EVENT")

        mock_client.triggers_types.retrieve.assert_called_once_with(
            slug="GITHUB_COMMIT_EVENT",
            toolkit_versions=custom_versions,
        )
        assert result == mock_trigger_type

    def test_list_active_without_filters(
        self, triggers, mock_client, mock_trigger_instances
    ):
        """Test list_active without any filters."""
        mock_client.trigger_instances.list_active.return_value = mock_trigger_instances

        result = triggers.list_active()

        mock_client.trigger_instances.list_active.assert_called_once()
        assert result == mock_trigger_instances

    def test_list_active_with_filters(
        self, triggers, mock_client, mock_trigger_instances
    ):
        """Test list_active with filters."""
        mock_client.trigger_instances.list_active.return_value = mock_trigger_instances

        result = triggers.list_active(
            trigger_ids=["trigger-1"],
            trigger_names=["GITHUB_COMMIT_EVENT"],
            auth_config_ids=["auth-123"],
            connected_account_ids=["conn-123"],
            show_disabled=False,
            limit=10,
            page=1,
        )

        mock_client.trigger_instances.list_active.assert_called_once()
        call_kwargs = mock_client.trigger_instances.list_active.call_args.kwargs
        assert call_kwargs["query_trigger_ids_1"] == ["trigger-1"]
        assert call_kwargs["query_trigger_names_1"] == ["GITHUB_COMMIT_EVENT"]
        assert call_kwargs["query_auth_config_ids_1"] == ["auth-123"]
        assert call_kwargs["query_connected_account_ids_1"] == ["conn-123"]
        assert call_kwargs["query_show_disabled_1"] is False
        assert call_kwargs["limit"] == 10
        assert call_kwargs["page"] == 1
        assert result == mock_trigger_instances

    def test_list_trigger_types_without_filters(self, triggers, mock_client):
        """Test list trigger types without filters."""
        mock_response = Mock()
        mock_client.triggers_types.list.return_value = mock_response

        result = triggers.list()

        mock_client.triggers_types.list.assert_called_once()
        assert result == mock_response

    def test_list_trigger_types_with_filters(self, triggers_with_versions, mock_client):
        """Test list trigger types with filters and custom versions."""
        mock_response = Mock()
        mock_client.triggers_types.list.return_value = mock_response
        custom_versions = {"github": "12082025_00", "slack": "10082025_01"}

        result = triggers_with_versions.list(
            cursor="cursor-123",
            limit=10,
            toolkit_slugs=["github", "slack"],
        )

        mock_client.triggers_types.list.assert_called_once()
        call_kwargs = mock_client.triggers_types.list.call_args.kwargs
        assert call_kwargs["cursor"] == "cursor-123"
        assert call_kwargs["limit"] == 10
        assert call_kwargs["toolkit_slugs"] == ["github", "slack"]
        assert call_kwargs["toolkit_versions"] == custom_versions
        assert result == mock_response

    def test_create_with_connected_account_id(self, triggers, mock_client):
        """Test create trigger with connected_account_id."""
        mock_response = Mock()
        mock_response.trigger_id = "trigger-123"
        mock_client.trigger_instances.upsert.return_value = mock_response

        result = triggers.create(
            slug="GITHUB_COMMIT_EVENT",
            connected_account_id="conn-123",
            trigger_config={"webhook_url": "https://example.com/webhook"},
        )

        mock_client.trigger_instances.upsert.assert_called_once()
        call_kwargs = mock_client.trigger_instances.upsert.call_args.kwargs
        assert call_kwargs["slug"] == "GITHUB_COMMIT_EVENT"
        assert call_kwargs["connected_account_id"] == "conn-123"
        assert call_kwargs["body_trigger_config_1"] == {
            "webhook_url": "https://example.com/webhook"
        }
        assert call_kwargs["toolkit_versions"] is None
        assert result == mock_response

    def test_create_with_user_id(self, triggers, mock_client, mock_trigger_type):
        """Test create trigger with user_id."""
        mock_response = Mock()
        mock_response.trigger_id = "trigger-123"
        mock_client.trigger_instances.upsert.return_value = mock_response
        mock_client.triggers_types.retrieve.return_value = mock_trigger_type

        # Mock connected accounts list
        mock_accounts = Mock()
        mock_account = Mock()
        mock_account.id = "conn-456"
        mock_account.created_at = "2024-01-01T00:00:00Z"
        mock_accounts.items = [mock_account]
        mock_client.connected_accounts.list.return_value = mock_accounts

        result = triggers.create(
            slug="GITHUB_COMMIT_EVENT",
            user_id="user-123",
            trigger_config={"webhook_url": "https://example.com/webhook"},
        )

        # Verify get_type was called to get toolkit
        # Note: toolkit_versions=None gets converted to omit
        call_kwargs = mock_client.triggers_types.retrieve.call_args.kwargs
        assert call_kwargs["slug"] == "GITHUB_COMMIT_EVENT"
        assert call_kwargs["toolkit_versions"] is omit

        # Verify connected accounts were fetched
        mock_client.connected_accounts.list.assert_called_once_with(
            toolkit_slugs=["github"],
            user_ids=["user-123"],
        )

        # Verify trigger was created with found connected account
        mock_client.trigger_instances.upsert.assert_called_once()
        call_kwargs = mock_client.trigger_instances.upsert.call_args.kwargs
        assert call_kwargs["connected_account_id"] == "conn-456"
        assert call_kwargs["toolkit_versions"] is None
        assert result == mock_response

    def test_create_with_custom_toolkit_versions(
        self, triggers_with_versions, mock_client
    ):
        """Test create trigger with custom toolkit versions."""
        mock_response = Mock()
        mock_response.trigger_id = "trigger-123"
        mock_client.trigger_instances.upsert.return_value = mock_response
        custom_versions = {"github": "12082025_00", "slack": "10082025_01"}

        result = triggers_with_versions.create(
            slug="GITHUB_COMMIT_EVENT",
            connected_account_id="conn-123",
            trigger_config={"webhook_url": "https://example.com/webhook"},
        )

        mock_client.trigger_instances.upsert.assert_called_once()
        call_kwargs = mock_client.trigger_instances.upsert.call_args.kwargs
        assert call_kwargs["slug"] == "GITHUB_COMMIT_EVENT"
        assert call_kwargs["connected_account_id"] == "conn-123"
        assert call_kwargs["body_trigger_config_1"] == {
            "webhook_url": "https://example.com/webhook"
        }
        assert call_kwargs["toolkit_versions"] == custom_versions
        assert result == mock_response

    def test_create_without_user_id_or_connected_account_raises_error(
        self, triggers, mock_client
    ):
        """Test create trigger without user_id or connected_account_id raises error."""
        with pytest.raises(exceptions.InvalidParams) as exc_info:
            triggers.create(
                slug="GITHUB_COMMIT_EVENT",
                trigger_config={"webhook_url": "https://example.com/webhook"},
            )

        assert "please provide valid `connected_account` or `user_id`" in str(
            exc_info.value
        )

    def test_create_with_user_id_no_connected_accounts_raises_error(
        self, triggers, mock_client, mock_trigger_type
    ):
        """Test create trigger with user_id but no connected accounts raises error."""
        mock_client.triggers_types.retrieve.return_value = mock_trigger_type

        # Mock empty connected accounts list
        mock_accounts = Mock()
        mock_accounts.items = []
        mock_client.connected_accounts.list.return_value = mock_accounts

        with pytest.raises(exceptions.NoItemsFound) as exc_info:
            triggers.create(
                slug="GITHUB_COMMIT_EVENT",
                user_id="user-123",
            )

        assert "No connected accounts found" in str(exc_info.value)

    def test_get_connected_account_for_user(
        self, triggers, mock_client, mock_trigger_type
    ):
        """Test _get_connected_account_for_user method."""
        mock_client.triggers_types.retrieve.return_value = mock_trigger_type

        # Mock connected accounts
        mock_accounts = Mock()
        mock_account1 = Mock()
        mock_account1.id = "conn-old"
        mock_account1.created_at = "2024-01-01T00:00:00Z"
        mock_account2 = Mock()
        mock_account2.id = "conn-new"
        mock_account2.created_at = "2024-01-02T00:00:00Z"
        mock_accounts.items = [mock_account1, mock_account2]
        mock_client.connected_accounts.list.return_value = mock_accounts

        result = triggers._get_connected_account_for_user(
            trigger="GITHUB_COMMIT_EVENT",
            user_id="user-123",
        )

        # Should return the most recent account
        assert result == "conn-new"

    def test_get_connected_account_for_user_no_accounts(
        self, triggers, mock_client, mock_trigger_type
    ):
        """Test _get_connected_account_for_user with no accounts raises error."""
        mock_client.triggers_types.retrieve.return_value = mock_trigger_type

        # Mock empty connected accounts
        mock_accounts = Mock()
        mock_accounts.items = []
        mock_client.connected_accounts.list.return_value = mock_accounts

        with pytest.raises(exceptions.NoItemsFound) as exc_info:
            triggers._get_connected_account_for_user(
                trigger="GITHUB_COMMIT_EVENT",
                user_id="user-123",
            )

        assert "No connected accounts found" in str(exc_info.value)

    def test_enable_trigger(self, triggers, mock_client):
        """Test enable trigger."""
        mock_response = Mock()
        mock_client.trigger_instances.manage.update.return_value = mock_response

        result = triggers.enable(trigger_id="trigger-123")

        mock_client.trigger_instances.manage.update.assert_called_once_with(
            trigger_id="trigger-123",
            status="enable",
        )
        assert result == mock_response

    def test_disable_trigger(self, triggers, mock_client):
        """Test disable trigger."""
        mock_response = Mock()
        mock_client.trigger_instances.manage.update.return_value = mock_response

        result = triggers.disable(trigger_id="trigger-123")

        mock_client.trigger_instances.manage.update.assert_called_once_with(
            trigger_id="trigger-123",
            status="disable",
        )
        assert result == mock_response

    def test_delete_trigger(self, triggers, mock_client):
        """Test delete trigger."""
        mock_response = Mock()
        mock_client.trigger_instances.manage.delete.return_value = mock_response

        result = triggers.delete(trigger_id="trigger-123")

        mock_client.trigger_instances.manage.delete.assert_called_once_with(
            trigger_id="trigger-123"
        )
        assert result == mock_response

    def test_list_enum(self, triggers, mock_client):
        """Test list_enum method."""
        mock_response = Mock()
        mock_response.enum = ["GITHUB_COMMIT_EVENT", "SLACK_MESSAGE_RECEIVED"]
        mock_client.triggers_types.retrieve_enum.return_value = mock_response

        result = triggers.list_enum()

        mock_client.triggers_types.retrieve_enum.assert_called_once()
        assert result == mock_response

    def test_subscribe(self, triggers, mock_client):
        """Test subscribe method."""
        with patch(
            "composio.core.models.triggers._SubcriptionBuilder"
        ) as mock_builder_class:
            mock_builder = Mock()
            mock_subscription = Mock()
            mock_builder.connect.return_value = mock_subscription
            mock_builder_class.return_value = mock_builder

            result = triggers.subscribe(timeout=20.0)

            mock_builder_class.assert_called_once_with(client=mock_client)
            mock_builder.connect.assert_called_once_with(timeout=20.0)
            assert result == mock_subscription

    def test_subscribe_with_default_timeout(self, triggers, mock_client):
        """Test subscribe method with default timeout."""
        with patch(
            "composio.core.models.triggers._SubcriptionBuilder"
        ) as mock_builder_class:
            mock_builder = Mock()
            mock_subscription = Mock()
            mock_builder.connect.return_value = mock_subscription
            mock_builder_class.return_value = mock_builder

            result = triggers.subscribe()

            mock_builder.connect.assert_called_once_with(timeout=15.0)
            assert result == mock_subscription


class TestVerifyWebhook:
    """Test cases for verify_webhook method."""

    @pytest.fixture
    def mock_client(self):
        """Create a mock HTTP client."""
        client = Mock()
        client.triggers_types = Mock()
        client.trigger_instances = Mock()
        client.trigger_instances.manage = Mock()
        client.connected_accounts = Mock()
        return client

    @pytest.fixture
    def triggers(self, mock_client):
        """Create a Triggers instance."""
        return Triggers(client=mock_client)

    @pytest.fixture
    def test_secret(self):
        """Test webhook secret."""
        return "test-webhook-secret-12345"

    @pytest.fixture
    def test_webhook_id(self):
        """Test webhook ID."""
        return "msg_test123"

    @pytest.fixture
    def test_timestamp(self):
        """Test webhook timestamp (current time in Unix seconds)."""
        return str(int(time.time()))

    @pytest.fixture
    def mock_v1_payload(self):
        """Create mock V1 webhook payload."""
        return {
            "trigger_name": "GITHUB_PUSH_EVENT",
            "connection_id": "conn-123",
            "trigger_id": "trigger-123",
            "payload": {"action": "push", "repository": "test-repo"},
            "log_id": "log-123",
        }

    @pytest.fixture
    def mock_v2_payload(self):
        """Create mock V2 webhook payload."""
        return {
            "type": "github_push_event",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "log_id": "log-123",
            "data": {
                "connection_id": "conn-123",
                "connection_nano_id": "conn-nano-123",
                "trigger_nano_id": "trigger-nano-123",
                "trigger_id": "trigger-123",
                "user_id": "user-456",
                "action": "push",
                "repository": "test-repo",
            },
        }

    @pytest.fixture
    def mock_v3_payload(self):
        """Create mock V3 webhook payload."""
        return {
            "id": "evt-123",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "type": "composio.trigger.message",
            "metadata": {
                "log_id": "log-123",
                "trigger_slug": "GITHUB_PUSH_EVENT",
                "trigger_id": "trigger-nano-123",
                "connected_account_id": "conn-nano-123",
                "auth_config_id": "auth-nano-123",
                "user_id": "user-456",
            },
            "data": {"action": "push", "repository": "test-repo"},
        }

    def create_signature(
        self, webhook_id: str, timestamp: str, payload: str, secret: str
    ) -> str:
        """Helper to create a valid v1,base64 signature."""
        to_sign = f"{webhook_id}.{timestamp}.{payload}"
        signature_bytes = hmac.new(
            key=secret.encode("utf-8"),
            msg=to_sign.encode("utf-8"),
            digestmod=hashlib.sha256,
        ).digest()
        return f"v1,{base64.b64encode(signature_bytes).decode('utf-8')}"

    # Successful verification tests with V3 payload

    def test_verify_webhook_v3_payload(
        self, triggers, test_secret, test_webhook_id, test_timestamp, mock_v3_payload
    ):
        """Test successful V3 webhook verification."""
        payload = json.dumps(mock_v3_payload)
        signature = self.create_signature(
            test_webhook_id, test_timestamp, payload, test_secret
        )

        result = triggers.verify_webhook(
            id=test_webhook_id,
            payload=payload,
            signature=signature,
            timestamp=test_timestamp,
            secret=test_secret,
        )

        assert result["version"] == WebhookVersion.V3
        assert result["payload"]["trigger_slug"] == "GITHUB_PUSH_EVENT"
        assert result["payload"]["user_id"] == "user-456"
        assert result["raw_payload"] == mock_v3_payload

    def test_verify_webhook_v3_normalizes_payload(
        self, triggers, test_secret, test_webhook_id, test_timestamp, mock_v3_payload
    ):
        """Test V3 payload normalization."""
        payload = json.dumps(mock_v3_payload)
        signature = self.create_signature(
            test_webhook_id, test_timestamp, payload, test_secret
        )

        result = triggers.verify_webhook(
            id=test_webhook_id,
            payload=payload,
            signature=signature,
            timestamp=test_timestamp,
            secret=test_secret,
        )

        assert (
            result["payload"]["metadata"]["connected_account"]["id"] == "conn-nano-123"
        )
        assert (
            result["payload"]["metadata"]["connected_account"]["auth_config_id"]
            == "auth-nano-123"
        )
        assert (
            result["payload"]["metadata"]["connected_account"]["user_id"] == "user-456"
        )

    # Successful verification with V2 payload

    def test_verify_webhook_v2_payload(
        self, triggers, test_secret, test_webhook_id, test_timestamp, mock_v2_payload
    ):
        """Test successful V2 webhook verification."""
        payload = json.dumps(mock_v2_payload)
        signature = self.create_signature(
            test_webhook_id, test_timestamp, payload, test_secret
        )

        result = triggers.verify_webhook(
            id=test_webhook_id,
            payload=payload,
            signature=signature,
            timestamp=test_timestamp,
            secret=test_secret,
        )

        assert result["version"] == WebhookVersion.V2
        assert result["payload"]["user_id"] == "user-456"

    # Successful verification with V1 payload

    def test_verify_webhook_v1_payload(
        self, triggers, test_secret, test_webhook_id, test_timestamp, mock_v1_payload
    ):
        """Test successful V1 webhook verification."""
        payload = json.dumps(mock_v1_payload)
        signature = self.create_signature(
            test_webhook_id, test_timestamp, payload, test_secret
        )

        result = triggers.verify_webhook(
            id=test_webhook_id,
            payload=payload,
            signature=signature,
            timestamp=test_timestamp,
            secret=test_secret,
        )

        assert result["version"] == WebhookVersion.V1
        assert result["payload"]["trigger_slug"] == "GITHUB_PUSH_EVENT"
        assert result["payload"]["id"] == "trigger-123"

    # Tolerance tests

    def test_verify_webhook_with_tolerance_zero(
        self, triggers, test_secret, test_webhook_id, mock_v3_payload
    ):
        """Test webhook verification with tolerance set to 0 (skip timestamp validation)."""
        # Use an old timestamp (1 hour ago)
        old_timestamp = str(int(time.time()) - 3600)
        payload = json.dumps(mock_v3_payload)
        signature = self.create_signature(
            test_webhook_id, old_timestamp, payload, test_secret
        )

        result = triggers.verify_webhook(
            id=test_webhook_id,
            payload=payload,
            signature=signature,
            timestamp=old_timestamp,
            secret=test_secret,
            tolerance=0,
        )

        assert result["version"] == WebhookVersion.V3

    def test_verify_webhook_with_custom_tolerance(
        self, triggers, test_secret, test_webhook_id, test_timestamp, mock_v3_payload
    ):
        """Test webhook verification with custom tolerance."""
        payload = json.dumps(mock_v3_payload)
        signature = self.create_signature(
            test_webhook_id, test_timestamp, payload, test_secret
        )

        result = triggers.verify_webhook(
            id=test_webhook_id,
            payload=payload,
            signature=signature,
            timestamp=test_timestamp,
            secret=test_secret,
            tolerance=600,  # 10 minutes
        )

        assert result is not None

    # Signature verification error tests

    def test_verify_webhook_empty_payload_raises_error(
        self, triggers, test_secret, test_webhook_id, test_timestamp
    ):
        """Test that empty payload raises WebhookSignatureVerificationError."""
        with pytest.raises(exceptions.WebhookSignatureVerificationError) as exc_info:
            triggers.verify_webhook(
                id=test_webhook_id,
                payload="",
                signature="v1,somesignature",
                timestamp=test_timestamp,
                secret=test_secret,
            )

        assert "No webhook payload was provided" in str(exc_info.value)

    def test_verify_webhook_empty_signature_raises_error(
        self, triggers, test_secret, test_webhook_id, test_timestamp, mock_v3_payload
    ):
        """Test that empty signature raises WebhookSignatureVerificationError."""
        payload = json.dumps(mock_v3_payload)

        with pytest.raises(exceptions.WebhookSignatureVerificationError) as exc_info:
            triggers.verify_webhook(
                id=test_webhook_id,
                payload=payload,
                signature="",
                timestamp=test_timestamp,
                secret=test_secret,
            )

        assert "No signature header value was provided" in str(exc_info.value)

    def test_verify_webhook_empty_secret_raises_error(
        self, triggers, test_webhook_id, test_timestamp, mock_v3_payload
    ):
        """Test that empty secret raises WebhookSignatureVerificationError."""
        payload = json.dumps(mock_v3_payload)

        with pytest.raises(exceptions.WebhookSignatureVerificationError) as exc_info:
            triggers.verify_webhook(
                id=test_webhook_id,
                payload=payload,
                signature="v1,somesignature",
                timestamp=test_timestamp,
                secret="",
            )

        assert "No webhook secret was provided" in str(exc_info.value)

    def test_verify_webhook_empty_webhook_id_raises_error(
        self, triggers, test_secret, test_timestamp, mock_v3_payload
    ):
        """Test that empty webhook ID raises WebhookSignatureVerificationError."""
        payload = json.dumps(mock_v3_payload)

        with pytest.raises(exceptions.WebhookSignatureVerificationError) as exc_info:
            triggers.verify_webhook(
                id="",
                payload=payload,
                signature="v1,somesignature",
                timestamp=test_timestamp,
                secret=test_secret,
            )

        assert "No webhook ID was provided" in str(exc_info.value)

    def test_verify_webhook_empty_timestamp_raises_error(
        self, triggers, test_secret, test_webhook_id, mock_v3_payload
    ):
        """Test that empty timestamp raises WebhookPayloadError."""
        payload = json.dumps(mock_v3_payload)

        with pytest.raises(exceptions.WebhookPayloadError) as exc_info:
            triggers.verify_webhook(
                id=test_webhook_id,
                payload=payload,
                signature="v1,somesignature",
                timestamp="",
                secret=test_secret,
            )

        assert "Invalid webhook timestamp" in str(exc_info.value)

    def test_verify_webhook_invalid_signature_format_raises_error(
        self, triggers, test_secret, test_webhook_id, test_timestamp, mock_v3_payload
    ):
        """Test that signature without v1 prefix raises error."""
        payload = json.dumps(mock_v3_payload)

        with pytest.raises(exceptions.WebhookSignatureVerificationError) as exc_info:
            triggers.verify_webhook(
                id=test_webhook_id,
                payload=payload,
                signature="invalid-signature-no-prefix",
                timestamp=test_timestamp,
                secret=test_secret,
            )

        assert "No valid v1 signature found" in str(exc_info.value)

    def test_verify_webhook_invalid_signature_raises_error(
        self, triggers, test_secret, test_webhook_id, test_timestamp, mock_v3_payload
    ):
        """Test that invalid signature raises WebhookSignatureVerificationError."""
        payload = json.dumps(mock_v3_payload)

        with pytest.raises(exceptions.WebhookSignatureVerificationError) as exc_info:
            triggers.verify_webhook(
                id=test_webhook_id,
                payload=payload,
                signature="v1,invalidbase64signature==",
                timestamp=test_timestamp,
                secret=test_secret,
            )

        assert "The signature provided is invalid" in str(exc_info.value)

    def test_verify_webhook_wrong_secret_raises_error(
        self, triggers, test_secret, test_webhook_id, test_timestamp, mock_v3_payload
    ):
        """Test that signature created with different secret raises error."""
        payload = json.dumps(mock_v3_payload)
        signature = self.create_signature(
            test_webhook_id, test_timestamp, payload, "different-secret"
        )

        with pytest.raises(exceptions.WebhookSignatureVerificationError) as exc_info:
            triggers.verify_webhook(
                id=test_webhook_id,
                payload=payload,
                signature=signature,
                timestamp=test_timestamp,
                secret=test_secret,
            )

        assert "The signature provided is invalid" in str(exc_info.value)

    def test_verify_webhook_modified_payload_raises_error(
        self, triggers, test_secret, test_webhook_id, test_timestamp, mock_v3_payload
    ):
        """Test that modified payload after signing raises error."""
        original_payload = json.dumps(mock_v3_payload)
        signature = self.create_signature(
            test_webhook_id, test_timestamp, original_payload, test_secret
        )

        # Modify the payload
        mock_v3_payload["data"] = {"modified": True}
        modified_payload = json.dumps(mock_v3_payload)

        with pytest.raises(exceptions.WebhookSignatureVerificationError):
            triggers.verify_webhook(
                id=test_webhook_id,
                payload=modified_payload,
                signature=signature,
                timestamp=test_timestamp,
                secret=test_secret,
            )

    # Payload parsing error tests

    def test_verify_webhook_invalid_json_raises_error(
        self, triggers, test_secret, test_webhook_id, test_timestamp
    ):
        """Test that invalid JSON payload raises WebhookPayloadError."""
        invalid_json = "not-valid-json{"
        signature = self.create_signature(
            test_webhook_id, test_timestamp, invalid_json, test_secret
        )

        with pytest.raises(exceptions.WebhookPayloadError) as exc_info:
            triggers.verify_webhook(
                id=test_webhook_id,
                payload=invalid_json,
                signature=signature,
                timestamp=test_timestamp,
                secret=test_secret,
            )

        assert "Failed to parse webhook payload as JSON" in str(exc_info.value)

    def test_verify_webhook_unrecognized_payload_raises_error(
        self, triggers, test_secret, test_webhook_id, test_timestamp
    ):
        """Test that unrecognized payload format raises WebhookPayloadError."""
        unknown_payload = json.dumps({"unknown": "format"})
        signature = self.create_signature(
            test_webhook_id, test_timestamp, unknown_payload, test_secret
        )

        with pytest.raises(exceptions.WebhookPayloadError) as exc_info:
            triggers.verify_webhook(
                id=test_webhook_id,
                payload=unknown_payload,
                signature=signature,
                timestamp=test_timestamp,
                secret=test_secret,
            )

        assert "does not match any known version" in str(exc_info.value)

    # Timestamp validation tests

    def test_verify_webhook_timestamp_within_tolerance(
        self, triggers, test_secret, test_webhook_id, mock_v3_payload
    ):
        """Test that timestamp within tolerance passes validation."""
        recent_timestamp = str(int(time.time()))
        payload = json.dumps(mock_v3_payload)
        signature = self.create_signature(
            test_webhook_id, recent_timestamp, payload, test_secret
        )

        result = triggers.verify_webhook(
            id=test_webhook_id,
            payload=payload,
            signature=signature,
            timestamp=recent_timestamp,
            secret=test_secret,
            tolerance=300,
        )

        assert result is not None

    def test_verify_webhook_timestamp_outside_tolerance_raises_error(
        self, triggers, test_secret, test_webhook_id, mock_v3_payload
    ):
        """Test that timestamp outside tolerance raises error."""
        # 10 minutes ago
        old_timestamp = str(int(time.time()) - 600)
        payload = json.dumps(mock_v3_payload)
        signature = self.create_signature(
            test_webhook_id, old_timestamp, payload, test_secret
        )

        with pytest.raises(exceptions.WebhookSignatureVerificationError) as exc_info:
            triggers.verify_webhook(
                id=test_webhook_id,
                payload=payload,
                signature=signature,
                timestamp=old_timestamp,
                secret=test_secret,
                tolerance=300,  # 5 minutes
            )

        assert "outside the allowed tolerance" in str(exc_info.value)

    def test_verify_webhook_invalid_timestamp_format_raises_error(
        self, triggers, test_secret, test_webhook_id, mock_v3_payload
    ):
        """Test that invalid timestamp format raises WebhookPayloadError."""
        invalid_timestamp = "not-a-timestamp"
        payload = json.dumps(mock_v3_payload)
        signature = self.create_signature(
            test_webhook_id, invalid_timestamp, payload, test_secret
        )

        with pytest.raises(exceptions.WebhookPayloadError) as exc_info:
            triggers.verify_webhook(
                id=test_webhook_id,
                payload=payload,
                signature=signature,
                timestamp=invalid_timestamp,
                secret=test_secret,
                tolerance=300,
            )

        assert "Invalid webhook timestamp" in str(exc_info.value)

    # Security tests

    def test_verify_webhook_uses_timing_safe_comparison(
        self, triggers, test_secret, test_webhook_id, test_timestamp, mock_v3_payload
    ):
        """Test that signature comparison is timing-safe."""
        payload = json.dumps(mock_v3_payload)
        valid_signature = self.create_signature(
            test_webhook_id, test_timestamp, payload, test_secret
        )

        # Valid signature should work
        result = triggers.verify_webhook(
            id=test_webhook_id,
            payload=payload,
            signature=valid_signature,
            timestamp=test_timestamp,
            secret=test_secret,
        )
        assert result is not None

        # Invalid signature with same format should fail
        invalid_signature = "v1," + "a" * 44  # base64 SHA256 is 44 chars
        with pytest.raises(exceptions.WebhookSignatureVerificationError):
            triggers.verify_webhook(
                id=test_webhook_id,
                payload=payload,
                signature=invalid_signature,
                timestamp=test_timestamp,
                secret=test_secret,
            )

    def test_verify_webhook_handles_unicode_payload(
        self, triggers, test_secret, test_webhook_id, test_timestamp, mock_v3_payload
    ):
        """Test that unicode in payload is handled correctly."""
        mock_v3_payload["data"] = {"message": "你好世界 🌍 مرحبا"}
        payload = json.dumps(mock_v3_payload, ensure_ascii=False)
        signature = self.create_signature(
            test_webhook_id, test_timestamp, payload, test_secret
        )

        result = triggers.verify_webhook(
            id=test_webhook_id,
            payload=payload,
            signature=signature,
            timestamp=test_timestamp,
            secret=test_secret,
        )

        assert result["payload"]["payload"]["message"] == "你好世界 🌍 مرحبا"

    def test_verify_webhook_handles_special_characters_in_secret(
        self, triggers, test_webhook_id, test_timestamp, mock_v3_payload
    ):
        """Test that special characters in secret are handled correctly."""
        special_secret = "secret!@#$%^&*()_+-=[]{}|;:,.<>?"
        payload = json.dumps(mock_v3_payload)
        signature = self.create_signature(
            test_webhook_id, test_timestamp, payload, special_secret
        )

        result = triggers.verify_webhook(
            id=test_webhook_id,
            payload=payload,
            signature=signature,
            timestamp=test_timestamp,
            secret=special_secret,
        )

        assert result is not None

    def test_verify_webhook_supports_multiple_signatures(
        self, triggers, test_secret, test_webhook_id, test_timestamp, mock_v3_payload
    ):
        """Test that multiple signatures in header are supported."""
        payload = json.dumps(mock_v3_payload)
        valid_signature = self.create_signature(
            test_webhook_id, test_timestamp, payload, test_secret
        )
        # Multiple signatures space-separated
        multiple_signatures = f"v1,invalidsig== {valid_signature}"

        result = triggers.verify_webhook(
            id=test_webhook_id,
            payload=payload,
            signature=multiple_signatures,
            timestamp=test_timestamp,
            secret=test_secret,
        )

        assert result is not None

    # Error class tests

    def test_webhook_signature_verification_error_is_trigger_error(self):
        """Test that WebhookSignatureVerificationError inherits from TriggerError."""
        error = exceptions.WebhookSignatureVerificationError("test")
        assert isinstance(error, exceptions.TriggerError)

    def test_webhook_payload_error_is_trigger_error(self):
        """Test that WebhookPayloadError inherits from TriggerError."""
        error = exceptions.WebhookPayloadError("test")
        assert isinstance(error, exceptions.TriggerError)
