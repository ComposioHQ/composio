import logging
import time
from unittest.mock import Mock, patch

import pytest

from composio import exceptions
from composio.core.models.connected_accounts import (
    AuthScheme,
    ConnectionRequest,
    ConnectedAccounts,
)


class TestAuthScheme:
    def test_oauth2_sets_initializing_status(self):
        scheme = AuthScheme()
        options = {"client_id": "id", "client_secret": "secret"}

        state = scheme.oauth2(options)

        assert state["auth_scheme"] == "OAUTH2"
        assert state["val"]["client_id"] == "id"
        assert state["val"]["client_secret"] == "secret"
        assert state["val"]["status"] == "INITIALIZING"

    @pytest.mark.parametrize(
        "method_name, expected_auth_scheme, expected_status",
        [
            ("api_key", "API_KEY", "ACTIVE"),
            ("basic", "BASIC", "ACTIVE"),
            ("bearer_token", "BEARER_TOKEN", "ACTIVE"),
            ("google_service_account", "GOOGLE_SERVICE_ACCOUNT", "ACTIVE"),
            ("no_auth", "NO_AUTH", "ACTIVE"),
            ("calcom_auth", "CALCOM_AUTH", "ACTIVE"),
            ("billcom_auth", "BILLCOM_AUTH", "ACTIVE"),
            ("basic_with_jwt", "BASIC_WITH_JWT", "ACTIVE"),
        ],
    )
    def test_auth_scheme_helpers_set_expected_auth_scheme_and_status(
        self, method_name, expected_auth_scheme, expected_status
    ):
        scheme = AuthScheme()
        method = getattr(scheme, method_name)
        options = {"foo": "bar"}

        state = method(options)  # type: ignore[misc]

        assert state["auth_scheme"] == expected_auth_scheme
        assert state["val"]["foo"] == "bar"
        assert state["val"]["status"] == expected_status


class TestConnectionRequest:
    def test_wait_for_connection_returns_when_active(self, monkeypatch):
        mock_client = Mock()
        pending = Mock()
        pending.status = "PENDING"
        active = Mock()
        active.status = "ACTIVE"
        mock_client.connected_accounts.retrieve.side_effect = [pending, active]

        req = ConnectionRequest(
            id="conn-123",
            status="PENDING",
            redirect_url=None,
            client=mock_client,
        )

        # Control time to avoid real sleep. Use a monotonic counter instead of a
        # finite list, because other code (e.g. tracing) may also call time.time().
        current_time = {"value": 0.0}

        def fake_time():
            value = current_time["value"]
            current_time["value"] += 0.1
            return value

        monkeypatch.setattr(time, "time", fake_time)
        monkeypatch.setattr(time, "sleep", lambda *_args, **_kwargs: None)

        result = req.wait_for_connection(timeout=1.0)

        assert result is active
        assert req.status == "ACTIVE"
        assert mock_client.connected_accounts.retrieve.call_count == 2
        mock_client.connected_accounts.retrieve.assert_called_with(nanoid="conn-123")

    def test_wait_for_connection_times_out(self, monkeypatch):
        mock_client = Mock()
        pending = Mock()
        pending.status = "PENDING"
        mock_client.connected_accounts.retrieve.return_value = pending

        req = ConnectionRequest(
            id="conn-timeout",
            status="PENDING",
            redirect_url=None,
            client=mock_client,
        )

        # Simulate time moving forward until the timeout is exceeded. Again, use
        # a monotonic counter so extra calls to time.time() do not exhaust test
        # data.
        current_time = {"value": 0.0}

        def fake_time():
            value = current_time["value"]
            current_time["value"] += 0.6
            return value

        monkeypatch.setattr(time, "time", fake_time)
        monkeypatch.setattr(time, "sleep", lambda *_args, **_kwargs: None)

        with pytest.raises(exceptions.ComposioSDKTimeoutError) as excinfo:
            req.wait_for_connection(timeout=1.0)

        assert "Timeout while waiting for connection conn-timeout" in str(excinfo.value)

    def test_from_id_uses_client_retrieve(self):
        mock_client = Mock()
        retrieved = Mock()
        retrieved.status = "PENDING"
        mock_client.connected_accounts.retrieve.return_value = retrieved

        req = ConnectionRequest.from_id("conn-from-id", client=mock_client)

        mock_client.connected_accounts.retrieve.assert_called_once_with(
            nanoid="conn-from-id"
        )
        assert req.id == "conn-from-id"
        assert req.status == "PENDING"
        assert req.redirect_url is None


class TestConnectedAccounts:
    @pytest.fixture
    def mock_client(self):
        client = Mock()
        client.connected_accounts.retrieve = Mock()
        client.connected_accounts.list = Mock()
        client.connected_accounts.delete = Mock()
        client.connected_accounts.update_status = Mock()
        client.connected_accounts.refresh = Mock()
        client.connected_accounts.create = Mock()
        client.link.create = Mock()
        return client

    @pytest.fixture
    def connected_accounts(self, mock_client):
        return ConnectedAccounts(client=mock_client)

    def test_constructor_binds_methods(self, connected_accounts, mock_client):
        assert connected_accounts.get is mock_client.connected_accounts.retrieve
        assert connected_accounts.list is mock_client.connected_accounts.list
        assert connected_accounts.delete is mock_client.connected_accounts.delete
        assert (
            connected_accounts.update_status
            is mock_client.connected_accounts.update_status
        )
        assert connected_accounts.refresh is mock_client.connected_accounts.refresh

    def test_enable_and_disable_partials(self, connected_accounts, mock_client):
        connected_accounts.enable("conn-1")
        connected_accounts.disable("conn-2")

        mock_client.connected_accounts.update_status.assert_any_call(
            "conn-1", enabled=True
        )
        mock_client.connected_accounts.update_status.assert_any_call(
            "conn-2", enabled=False
        )

    def test_initiate_raises_when_multiple_accounts_and_not_allow_multiple(
        self, connected_accounts, mock_client
    ):
        mock_accounts = Mock()
        mock_accounts.items = [Mock(), Mock()]
        mock_client.connected_accounts.list.return_value = mock_accounts

        with pytest.raises(exceptions.ComposioMultipleConnectedAccountsError):
            connected_accounts.initiate(
                user_id="user-1", auth_config_id="auth-1", allow_multiple=False
            )

    def test_initiate_warns_and_creates_when_allow_multiple(
        self, connected_accounts, mock_client, caplog
    ):
        mock_accounts = Mock()
        mock_accounts.items = [Mock(), Mock()]
        mock_client.connected_accounts.list.return_value = mock_accounts

        mock_response = Mock()
        mock_response.id = "conn-123"
        mock_response.connection_data.val.status = "PENDING"
        mock_response.connection_data.val.redirect_url = "https://redirect"
        mock_client.connected_accounts.create.return_value = mock_response

        config = {
            "auth_scheme": "API_KEY",
            "val": {"key": "secret", "status": "ACTIVE"},
        }

        with caplog.at_level(logging.WARNING):
            result = connected_accounts.initiate(
                user_id="user-1",
                auth_config_id="auth-1",
                callback_url="https://cb",
                allow_multiple=True,
                config=config,
            )

        mock_client.connected_accounts.list.assert_called_once_with(
            user_ids=["user-1"], auth_config_ids=["auth-1"]
        )
        call_kwargs = mock_client.connected_accounts.create.call_args.kwargs
        assert call_kwargs["auth_config"] == {"id": "auth-1"}
        assert call_kwargs["connection"]["user_id"] == "user-1"
        assert call_kwargs["connection"]["callback_url"] == "https://cb"
        assert call_kwargs["connection"]["state"] == config

        assert isinstance(result, ConnectionRequest)
        assert result.id == "conn-123"
        assert result.status == "PENDING"
        assert result.redirect_url == "https://redirect"
        assert "[Warn:AllowMultiple] Multiple connected accounts found" in caplog.text

    def test_link_builds_payload_and_returns_connection_request(
        self, connected_accounts, mock_client
    ):
        mock_response = Mock()
        mock_response.connected_account_id = "conn-999"
        mock_response.redirect_url = "https://redirect"
        mock_client.link.create.return_value = mock_response

        result = connected_accounts.link(
            user_id="user-1",
            auth_config_id="auth-1",
            callback_url="https://cb",
        )

        call_kwargs = mock_client.link.create.call_args.kwargs
        assert call_kwargs["auth_config_id"] == "auth-1"
        assert call_kwargs["user_id"] == "user-1"
        assert call_kwargs["callback_url"] == "https://cb"

        assert isinstance(result, ConnectionRequest)
        assert result.id == "conn-999"
        assert result.status == "INITIATED"
        assert result.redirect_url == "https://redirect"

    def test_link_omits_callback_url_when_not_provided(
        self, connected_accounts, mock_client
    ):
        mock_response = Mock()
        mock_response.connected_account_id = "conn-000"
        mock_response.redirect_url = None
        mock_client.link.create.return_value = mock_response

        connected_accounts.link(user_id="user-1", auth_config_id="auth-1")

        call_kwargs = mock_client.link.create.call_args.kwargs
        assert call_kwargs["auth_config_id"] == "auth-1"
        assert call_kwargs["user_id"] == "user-1"
        assert "callback_url" not in call_kwargs

    def test_wait_for_connection_delegates_to_connection_request(self, mock_client):
        connected_accounts = ConnectedAccounts(client=mock_client)

        with patch(
            "composio.core.models.connected_accounts.ConnectionRequest.from_id"
        ) as mock_from_id:
            mock_request = Mock()
            mock_request.wait_for_connection.return_value = "connected"
            mock_from_id.return_value = mock_request

            result = connected_accounts.wait_for_connection(id="conn-123", timeout=42.0)

        mock_from_id.assert_called_once_with(id="conn-123", client=mock_client)
        mock_request.wait_for_connection.assert_called_once_with(timeout=42.0)
        assert result == "connected"
