import logging
import time
import warnings
from unittest.mock import Mock, patch

import pytest
from composio_client import omit

from composio import exceptions
from composio.core.models.connected_accounts import (
    AuthScheme,
    ConnectedAccounts,
    ConnectionRequest,
)


def _set_initiate_response(mock_client, body, headers=None):
    """SEC-339: route an `initiate()` mock response through the
    ``with_raw_response.create`` surface that the SDK consumes for
    deprecation-header gating.

    ``headers`` defaults to ``None`` (no Deprecation header → no warning,
    matching custom-auth-config / non-OAuth-scheme behavior). Pass
    ``{"Deprecation": "@..."}`` to simulate the apollo retiring branch.
    """
    raw = Mock()
    raw.parse.return_value = body
    raw.headers = headers or {}
    mock_client.connected_accounts.with_raw_response.create.return_value = raw
    return raw


class TestAuthScheme:
    def test_oauth2_with_access_token_sets_active_status(self):
        scheme = AuthScheme()
        options = {"access_token": "test_token", "refresh_token": "test_refresh"}

        state = scheme.oauth2(options)

        assert state["auth_scheme"] == "OAUTH2"
        assert state["val"]["access_token"] == "test_token"
        assert state["val"]["refresh_token"] == "test_refresh"
        assert state["val"]["status"] == "ACTIVE"

    def test_oauth2_without_access_token_sets_initializing_status(self):
        scheme = AuthScheme()
        options = {"client_id": "id", "client_secret": "secret"}

        state = scheme.oauth2(options)

        assert state["auth_scheme"] == "OAUTH2"
        assert state["val"]["client_id"] == "id"
        assert state["val"]["client_secret"] == "secret"
        assert state["val"]["status"] == "INITIALIZING"

    def test_oauth2_with_empty_access_token_sets_initializing_status(self):
        scheme = AuthScheme()
        state = scheme.oauth2({"access_token": ""})

        assert state["val"]["status"] == "INITIALIZING"

    def test_oauth2_honors_explicit_status_override(self):
        scheme = AuthScheme()
        state = scheme.oauth2({"access_token": "test_token", "status": "INITIALIZING"})

        assert state["val"]["status"] == "INITIALIZING"

    def test_oauth1_with_both_tokens_sets_active_status(self):
        scheme = AuthScheme()
        state = scheme.oauth1({"oauth_token": "tok", "oauth_token_secret": "secret"})

        assert state["auth_scheme"] == "OAUTH1"
        assert state["val"]["oauth_token"] == "tok"
        assert state["val"]["oauth_token_secret"] == "secret"
        assert state["val"]["status"] == "ACTIVE"

    def test_oauth1_without_secret_sets_initializing_status(self):
        scheme = AuthScheme()
        state = scheme.oauth1({"oauth_token": "tok"})

        assert state["auth_scheme"] == "OAUTH1"
        assert state["val"]["status"] == "INITIALIZING"

    def test_oauth1_with_empty_token_sets_initializing_status(self):
        scheme = AuthScheme()
        state = scheme.oauth1({"oauth_token": "", "oauth_token_secret": "secret"})

        assert state["val"]["status"] == "INITIALIZING"

    def test_oauth1_honors_explicit_status_override(self):
        scheme = AuthScheme()
        state = scheme.oauth1(
            {
                "oauth_token": "tok",
                "oauth_token_secret": "secret",
                "status": "INITIALIZING",
            }
        )

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

    @pytest.mark.parametrize("terminal_status", ["FAILED", "EXPIRED", "REVOKED"])
    def test_wait_for_connection_fails_fast_on_terminal_status(
        self, monkeypatch, terminal_status
    ):
        mock_client = Mock()
        terminal = Mock()
        terminal.status = terminal_status
        mock_client.connected_accounts.retrieve.return_value = terminal

        req = ConnectionRequest(
            id="conn-terminal",
            status="PENDING",
            redirect_url=None,
            client=mock_client,
        )

        # Patch `time.time` defensively — matches sibling tests.
        current_time = {"value": 0.0}

        def fake_time():
            value = current_time["value"]
            current_time["value"] += 0.1
            return value

        monkeypatch.setattr(time, "time", fake_time)
        monkeypatch.setattr(time, "sleep", lambda *_args, **_kwargs: None)

        with pytest.raises(exceptions.SDKError) as excinfo:
            req.wait_for_connection(timeout=10.0)

        assert "conn-terminal" in str(excinfo.value)
        assert terminal_status in str(excinfo.value)
        # One retrieve call only — no polling once we hit a terminal state.
        assert mock_client.connected_accounts.retrieve.call_count == 1

    def test_wait_for_connection_does_not_treat_inactive_as_terminal(self, monkeypatch):
        mock_client = Mock()
        inactive = Mock()
        inactive.status = "INACTIVE"
        active = Mock()
        active.status = "ACTIVE"
        mock_client.connected_accounts.retrieve.side_effect = [inactive, active]

        req = ConnectionRequest(
            id="conn-inactive-recover",
            status="PENDING",
            redirect_url=None,
            client=mock_client,
        )

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
        client.connected_accounts.patch = Mock()
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

    def test_initiate_filters_by_active_status_when_checking_existing_accounts(
        self, connected_accounts, mock_client
    ):
        """
        Test that initiate only considers ACTIVE accounts when checking for duplicates.
        This ensures expired or inactive accounts don't block new connection creation.
        """
        mock_accounts = Mock()
        mock_accounts.items = []
        mock_client.connected_accounts.list.return_value = mock_accounts

        mock_response = Mock()
        mock_response.id = "conn-123"
        mock_response.connection_data.val.status = "PENDING"
        mock_response.connection_data.val.redirect_url = "https://redirect"
        _set_initiate_response(mock_client, mock_response)

        connected_accounts.initiate(user_id="user-1", auth_config_id="auth-1")

        # Verify that list is called with statuses=["ACTIVE"] to filter only active accounts
        mock_client.connected_accounts.list.assert_called_once_with(
            user_ids=["user-1"], auth_config_ids=["auth-1"], statuses=["ACTIVE"]
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
        _set_initiate_response(mock_client, mock_response)

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
            user_ids=["user-1"], auth_config_ids=["auth-1"], statuses=["ACTIVE"]
        )
        call_kwargs = (
            mock_client.connected_accounts.with_raw_response.create.call_args.kwargs
        )
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
        # link() now mirrors initiate() and pre-flights list() to enforce the
        # allow_multiple guard; default to no existing connections here.
        no_accounts = Mock()
        no_accounts.items = []
        mock_client.connected_accounts.list.return_value = no_accounts

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
        no_accounts = Mock()
        no_accounts.items = []
        mock_client.connected_accounts.list.return_value = no_accounts

        mock_response = Mock()
        mock_response.connected_account_id = "conn-000"
        mock_response.redirect_url = None
        mock_client.link.create.return_value = mock_response

        connected_accounts.link(user_id="user-1", auth_config_id="auth-1")

        call_kwargs = mock_client.link.create.call_args.kwargs
        assert call_kwargs["auth_config_id"] == "auth-1"
        assert call_kwargs["user_id"] == "user-1"
        assert call_kwargs["callback_url"] is omit

    def test_link_raises_when_active_connection_exists_and_not_allow_multiple(
        self, connected_accounts, mock_client
    ):
        """link() guards against duplicate connections, mirroring initiate()."""
        existing = Mock()
        existing.items = [Mock()]
        mock_client.connected_accounts.list.return_value = existing

        with pytest.raises(exceptions.ComposioMultipleConnectedAccountsError):
            connected_accounts.link(user_id="user-1", auth_config_id="auth-1")

        mock_client.connected_accounts.list.assert_called_once_with(
            user_ids=["user-1"], auth_config_ids=["auth-1"], statuses=["ACTIVE"]
        )
        mock_client.link.create.assert_not_called()

    def test_link_skips_guard_when_allow_multiple_is_true(
        self, connected_accounts, mock_client
    ):
        """allow_multiple=True bypasses the guard and proceeds with link.create."""
        existing = Mock()
        existing.items = [Mock()]
        mock_client.connected_accounts.list.return_value = existing

        mock_response = Mock()
        mock_response.connected_account_id = "conn-new"
        mock_response.redirect_url = "https://redirect"
        mock_client.link.create.return_value = mock_response

        result = connected_accounts.link(
            user_id="user-1",
            auth_config_id="auth-1",
            alias="work",
            allow_multiple=True,
        )

        call_kwargs = mock_client.link.create.call_args.kwargs
        assert call_kwargs["alias"] == "work"
        assert result.id == "conn-new"

    def test_initiate_with_oauth2_tokens_returns_active_connection_request(
        self, connected_accounts, mock_client
    ):
        mock_accounts = Mock()
        mock_accounts.items = []
        mock_client.connected_accounts.list.return_value = mock_accounts

        mock_response = Mock()
        mock_response.id = "conn-active"
        mock_response.connection_data.val.status = "ACTIVE"
        mock_response.connection_data.val.redirect_url = None
        _set_initiate_response(mock_client, mock_response)

        scheme = AuthScheme()
        config = scheme.oauth2(
            {"access_token": "tok", "refresh_token": "ref", "expires_in": 3600}
        )

        result = connected_accounts.initiate(
            user_id="user-1", auth_config_id="auth-1", config=config
        )

        assert isinstance(result, ConnectionRequest)
        assert result.id == "conn-active"
        assert result.status == "ACTIVE"
        assert result.redirect_url is None

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


def _make_bad_request_error(message: str):
    """Build a BadRequestError instance for testing the error mapper.

    The composio_client BadRequestError constructor signature is internal —
    rather than depend on it, we stub a minimal object that ``str(error)``
    surfaces the message and which is recognized as the BadRequestError type
    by ``isinstance``. This mirrors how production responses arrive: the
    error class with a message body.
    """
    from composio_client import BadRequestError

    error = BadRequestError.__new__(BadRequestError)
    Exception.__init__(error, message)
    return error


class TestConnectedAccountsAcl:
    """Tests for ``account_type`` + per-user ACL surfacing on ``link()``
    and ``update_acl()``."""

    @pytest.fixture
    def mock_client(self):
        client = Mock()
        client.connected_accounts.retrieve = Mock()
        client.connected_accounts.list = Mock()
        client.connected_accounts.delete = Mock()
        client.connected_accounts.update_status = Mock()
        client.connected_accounts.refresh = Mock()
        client.connected_accounts.create = Mock()
        client.connected_accounts.patch = Mock()
        client.link.create = Mock()
        # Default: no existing connections, so link() doesn't trip the guard.
        no_accounts = Mock()
        no_accounts.items = []
        client.connected_accounts.list.return_value = no_accounts
        # Default link.create response — overridden per test where the
        # response shape matters.
        default_link = Mock()
        default_link.connected_account_id = "ca_test_shared"
        default_link.redirect_url = "https://redirect"
        client.link.create.return_value = default_link
        return client

    @pytest.fixture
    def connected_accounts(self, mock_client):
        return ConnectedAccounts(client=mock_client)

    # -- link() with accountType + ACL forwarding ---------------------------

    def test_link_forwards_account_type_and_nested_acl(
        self, connected_accounts, mock_client
    ):
        connected_accounts.link(
            user_id="user_creator",
            auth_config_id="auth_config_123",
            account_type="SHARED",
            acl_config_for_shared={
                "allow_all_users": True,
                "not_allowed_user_ids": ["user_bob"],
            },
        )

        call_kwargs = mock_client.link.create.call_args.kwargs
        assert call_kwargs["account_type"] == "SHARED"
        assert call_kwargs["acl_config_for_shared"] == {
            "allow_all_users": True,
            "not_allowed_user_ids": ["user_bob"],
        }

    def test_link_omits_acl_when_not_provided(self, connected_accounts, mock_client):
        connected_accounts.link(
            user_id="user_creator",
            auth_config_id="auth_config_123",
            account_type="SHARED",
        )

        call_kwargs = mock_client.link.create.call_args.kwargs
        assert call_kwargs["account_type"] == "SHARED"
        assert call_kwargs["acl_config_for_shared"] is omit

    def test_link_forwards_only_provided_acl_fields(
        self, connected_accounts, mock_client
    ):
        connected_accounts.link(
            user_id="user_creator",
            auth_config_id="auth_config_123",
            account_type="SHARED",
            acl_config_for_shared={"allowed_user_ids": ["user_alice"]},
        )

        call_kwargs = mock_client.link.create.call_args.kwargs
        assert call_kwargs["acl_config_for_shared"] == {
            "allowed_user_ids": ["user_alice"]
        }

    def test_link_preserves_explicit_empty_lists(self, connected_accounts, mock_client):
        """An empty list is meaningful (clear the allow/deny list)."""
        connected_accounts.link(
            user_id="user_creator",
            auth_config_id="auth_config_123",
            account_type="SHARED",
            acl_config_for_shared={
                "allowed_user_ids": [],
                "not_allowed_user_ids": [],
            },
        )

        call_kwargs = mock_client.link.create.call_args.kwargs
        assert call_kwargs["acl_config_for_shared"] == {
            "allowed_user_ids": [],
            "not_allowed_user_ids": [],
        }

    def test_link_maps_acl_only_for_shared_to_typed_error(
        self, connected_accounts, mock_client
    ):
        mock_client.link.create.side_effect = _make_bad_request_error(
            "acl_config_for_shared is only valid on SHARED connections."
        )

        with pytest.raises(exceptions.ComposioAclOnlyForSharedError):
            connected_accounts.link(
                user_id="user_creator",
                auth_config_id="auth_config_123",
                account_type="PRIVATE",
                acl_config_for_shared={"allow_all_users": True},
            )

    def test_link_rethrows_non_acl_bad_request_errors(
        self, connected_accounts, mock_client
    ):
        unrelated = _make_bad_request_error("auth_config_id is required")
        mock_client.link.create.side_effect = unrelated

        from composio_client import BadRequestError

        with pytest.raises(BadRequestError):
            connected_accounts.link(
                user_id="user_creator", auth_config_id="auth_config_123"
            )

    # -- update_acl() body construction + mapper ----------------------------

    def test_update_acl_serializes_nested_body(self, connected_accounts, mock_client):
        response = Mock()
        response.id = "ca_abc"
        response.status = "ACTIVE"
        response.success = True
        mock_client.connected_accounts.patch.return_value = response

        result = connected_accounts.update_acl(
            "ca_abc",
            allow_all_users=True,
            not_allowed_user_ids=["user_bob"],
        )

        mock_client.connected_accounts.patch.assert_called_once_with(
            "ca_abc",
            acl_config_for_shared={
                "allow_all_users": True,
                "not_allowed_user_ids": ["user_bob"],
            },
        )
        assert result is response

    def test_update_acl_omits_absent_fields(self, connected_accounts, mock_client):
        connected_accounts.update_acl("ca_abc", allowed_user_ids=["user_alice"])

        mock_client.connected_accounts.patch.assert_called_once_with(
            "ca_abc",
            acl_config_for_shared={"allowed_user_ids": ["user_alice"]},
        )

    def test_update_acl_preserves_empty_array(self, connected_accounts, mock_client):
        connected_accounts.update_acl("ca_abc", allowed_user_ids=[])

        mock_client.connected_accounts.patch.assert_called_once_with(
            "ca_abc",
            acl_config_for_shared={"allowed_user_ids": []},
        )

    def test_update_acl_rejects_all_none(self, connected_accounts, mock_client):
        with pytest.raises(exceptions.ValidationError):
            connected_accounts.update_acl("ca_abc")
        mock_client.connected_accounts.patch.assert_not_called()

    def test_update_acl_maps_acl_only_for_shared_to_typed_error(
        self, connected_accounts, mock_client
    ):
        mock_client.connected_accounts.patch.side_effect = _make_bad_request_error(
            "acl_config_for_shared is only valid on SHARED connections."
        )

        with pytest.raises(exceptions.ComposioAclOnlyForSharedError):
            connected_accounts.update_acl("ca_abc", allow_all_users=True)

    def test_update_acl_rethrows_non_acl_bad_request_errors(
        self, connected_accounts, mock_client
    ):
        unrelated = _make_bad_request_error("some other 400")
        mock_client.connected_accounts.patch.side_effect = unrelated

        from composio_client import BadRequestError

        with pytest.raises(BadRequestError):
            connected_accounts.update_acl("ca_abc", allow_all_users=True)


# SEC-339: initiate() must gate its DeprecationWarning on the response
# `Deprecation` HTTP header (RFC 9745) that apollo emits only on the
# retiring branch (Composio-managed + redirectable OAuth). These tests pin
# that contract so the previous false-positive behavior — warning purely
# off auth_scheme, which over-fired for custom auth configs — can't come
# back. See https://docs.composio.dev/docs/changelog/2026/04/24
class TestInitiateDeprecationHeaderGate:
    @pytest.fixture
    def mock_client(self):
        client = Mock()
        client.connected_accounts.list = Mock()
        return client

    @pytest.fixture(autouse=True)
    def _reset_warning_flag(self):
        """Reset the module-level one-time warning guard before each test
        so warning emission is deterministic regardless of test order."""
        import composio.core.models.connected_accounts as ca_mod

        ca_mod._legacy_initiate_warning_emitted = False
        yield
        ca_mod._legacy_initiate_warning_emitted = False

    @staticmethod
    def _no_existing_accounts(mock_client):
        empty = Mock()
        empty.items = []
        mock_client.connected_accounts.list.return_value = empty

    @staticmethod
    def _make_response():
        body = Mock()
        body.id = "conn-dep"
        body.connection_data.val.status = "INITIATED"
        body.connection_data.val.redirect_url = "https://redirect"
        return body

    def test_warns_once_when_response_carries_deprecation_header(self, mock_client):
        """Managed + redirectable-OAuth path: apollo sets `Deprecation`,
        SDK emits a `DeprecationWarning` pointing callers at link()."""
        self._no_existing_accounts(mock_client)
        body = self._make_response()
        _set_initiate_response(
            mock_client,
            body,
            headers={
                "Deprecation": "@1776988800",
                "Sunset": "Fri, 08 May 2026 00:00:00 GMT",
                "Link": (
                    "<https://docs.composio.dev/docs/changelog/2026/04/24>; "
                    'rel="deprecation"'
                ),
            },
        )

        connected_accounts = ConnectedAccounts(client=mock_client)
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            req = connected_accounts.initiate(user_id="user-1", auth_config_id="auth-1")

        assert isinstance(req, ConnectionRequest)
        deprecations = [w for w in caught if issubclass(w.category, DeprecationWarning)]
        assert len(deprecations) == 1
        message = str(deprecations[0].message)
        assert "composio.connected_accounts.link()" in message
        assert "2026-07-03" in message

    def test_does_not_warn_when_response_has_no_deprecation_header(self, mock_client):
        """Custom auth config / non-OAuth scheme: apollo returns a clean
        response, SDK must stay silent. Regression for the prior
        auth_scheme-only check that over-fired here."""
        self._no_existing_accounts(mock_client)
        _set_initiate_response(mock_client, self._make_response(), headers={})

        connected_accounts = ConnectedAccounts(client=mock_client)
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            connected_accounts.initiate(user_id="user-1", auth_config_id="auth-1")

        deprecations = [w for w in caught if issubclass(w.category, DeprecationWarning)]
        assert deprecations == []

    def test_warns_at_most_once_per_process_across_calls(self, mock_client):
        """The one-time guard must hold across multiple calls in the same
        process even when each response carries the Deprecation header."""
        self._no_existing_accounts(mock_client)
        # Same headers for both calls; helper rewires the same return on
        # each invocation, so both calls see the Deprecation header.
        _set_initiate_response(
            mock_client,
            self._make_response(),
            headers={"Deprecation": "@1776988800"},
        )

        connected_accounts = ConnectedAccounts(client=mock_client)
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            connected_accounts.initiate(user_id="user-1", auth_config_id="auth-1")
            empty = Mock()
            empty.items = []
            mock_client.connected_accounts.list.return_value = empty
            connected_accounts.initiate(user_id="user-1", auth_config_id="auth-1")

        deprecations = [w for w in caught if issubclass(w.category, DeprecationWarning)]
        assert len(deprecations) == 1
