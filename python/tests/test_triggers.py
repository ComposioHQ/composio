"""Tests for Triggers class."""

import pytest
from unittest.mock import Mock, patch
from composio.core.models.triggers import Triggers
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

        mock_client.triggers_types.retrieve.assert_called_once_with(
            slug="GITHUB_COMMIT_EVENT",
            toolkit_versions=None,
        )
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
        mock_client.triggers_types.retrieve.assert_called_once_with(
            slug="GITHUB_COMMIT_EVENT",
            toolkit_versions=None,
        )

        # Verify connected accounts were fetched
        mock_client.connected_accounts.list.assert_called_once_with(
            toolkit_slugs=["github"],
            user_ids=["user-123"],
        )

        # Verify trigger was created with found connected account
        mock_client.trigger_instances.upsert.assert_called_once()
        call_kwargs = mock_client.trigger_instances.upsert.call_args.kwargs
        assert call_kwargs["connected_account_id"] == "conn-456"
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
