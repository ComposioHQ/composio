from __future__ import annotations

import functools
import logging
import time
import typing as t
import warnings

import typing_extensions as te
from composio_client import BadRequestError, omit

from composio import exceptions
from composio.client import HttpClient
from composio.client.types import (
    connected_account_create_params,
    connected_account_patch_params,
    connected_account_patch_response,
    connected_account_retrieve_response,
    connected_account_update_status_response,
    link_create_params,
)

from .base import Resource
from .experimental import ACL_ONLY_FOR_SHARED_ERROR_FRAGMENT

logger = logging.getLogger(__name__)

# Mirrors TS `ConnectionRequest.ts:terminalErrorStates`. INACTIVE is excluded
# on purpose — it can recover to ACTIVE.
_TERMINAL_CONNECTION_STATES: t.FrozenSet[str] = frozenset(
    {"FAILED", "EXPIRED", "REVOKED"}
)

# One-time-per-process guard so long-running services don't spam the deprecation
# warning on every initiate() call.
_legacy_initiate_warning_emitted = False


class ConnectionRequest(Resource):
    """
    A connection request.

    This class is used to manage connection requests.
    """

    DEFAULT_WAIT_TIMEOUT = 60.0  # Seconds

    def __init__(
        self,
        id: str,
        status: str,
        redirect_url: t.Optional[str],
        client: HttpClient,
    ):
        """
        Initialize the connection request.

        :param id: The ID of the connection request.
        :param status: The status of the connection request.
        :param redirect_url: The redirect URL of the connection request.
        :param client: The client to use for the connection request.
        """
        super().__init__(client)
        self.id = id
        self.status = status
        self.redirect_url = redirect_url

    def wait_for_connection(
        self,
        timeout: t.Optional[float] = None,
    ) -> connected_account_retrieve_response.ConnectedAccountRetrieveResponse:
        """
        Wait for the connection to be established.

        :param timeout: The timeout to wait for the connection to be established.
        :return: Connected account object.
        """
        timeout = self.DEFAULT_WAIT_TIMEOUT if timeout is None else timeout
        deadline = time.time() + timeout
        while deadline > time.time():
            connection = self._client.connected_accounts.retrieve(nanoid=self.id)
            self.status = connection.status
            if self.status == "ACTIVE":
                return connection
            if self.status in _TERMINAL_CONNECTION_STATES:
                raise exceptions.SDKError(
                    message=(
                        f"Connection {self.id} entered terminal state "
                        f"{self.status!r} before becoming active"
                    ),
                )
            time.sleep(1)

        raise exceptions.ComposioSDKTimeoutError(
            message=f"Timeout while waiting for connection {self.id} to be active",
        )

    @classmethod
    def from_id(cls, id: str, client: HttpClient) -> te.Self:
        return cls(
            id=id,
            status=client.connected_accounts.retrieve(nanoid=id).status,
            redirect_url=None,
            client=client,
        )


class AuthScheme:
    """
    Collection of auth scheme helpers.
    """

    def oauth1(
        self, options: connected_account_create_params.ConnectionStateUnionMember0Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using OAuth 1.0.

        When both ``oauth_token`` and ``oauth_token_secret`` are provided,
        status defaults to ACTIVE (token import). When either is omitted,
        status defaults to INITIALIZING (redirect-based OAuth flow).
        Pass an explicit ``status`` in options to override.
        """
        has_tokens = bool(
            options.get("oauth_token")  # type: ignore[union-attr]
        ) and bool(
            options.get("oauth_token_secret")  # type: ignore[union-attr]
        )
        status = "ACTIVE" if has_tokens else "INITIALIZING"
        return {
            "auth_scheme": "OAUTH1",
            "val": t.cast(
                connected_account_create_params.ConnectionStateUnionMember0Val,
                {
                    "status": status,
                    **options,
                },
            ),
        }

    def oauth2(
        self, options: connected_account_create_params.ConnectionStateUnionMember1Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using OAuth 2.0.

        When ``access_token`` is provided, status defaults to ACTIVE
        (token import). When omitted, status defaults to INITIALIZING
        (redirect-based OAuth flow). Pass an explicit ``status`` in
        options to override.
        """
        has_token = bool(options.get("access_token"))  # type: ignore[union-attr]
        status = "ACTIVE" if has_token else "INITIALIZING"
        return {
            "auth_scheme": "OAUTH2",
            "val": t.cast(
                connected_account_create_params.ConnectionStateUnionMember1Val,
                {
                    "status": status,
                    **options,
                },
            ),
        }

    def composio_link(
        self, options: connected_account_create_params.ConnectionStateUnionMember2Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using Composio Link.
        """
        return t.cast(
            connected_account_create_params.ConnectionState,
            {
                "auth_scheme": "COMPOSIO_LINK",
                "val": t.cast(
                    connected_account_create_params.ConnectionStateUnionMember2Val,
                    {
                        "status": "INITIALIZING",
                        **options,
                    },
                ),
            },
        )

    def api_key(
        self, options: connected_account_create_params.ConnectionStateUnionMember3Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using an API key.
        """
        return t.cast(
            connected_account_create_params.ConnectionState,
            {
                "auth_scheme": "API_KEY",
                "val": t.cast(
                    connected_account_create_params.ConnectionStateUnionMember3Val,
                    {
                        "status": "ACTIVE",
                        **options,
                    },
                ),
            },
        )

    def basic(
        self, options: connected_account_create_params.ConnectionStateUnionMember4Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using basic auth.
        """
        return t.cast(
            connected_account_create_params.ConnectionState,
            {
                "auth_scheme": "BASIC",
                "val": t.cast(
                    connected_account_create_params.ConnectionStateUnionMember4Val,
                    {
                        "status": "ACTIVE",
                        **options,
                    },
                ),
            },
        )

    def bearer_token(
        self, options: connected_account_create_params.ConnectionStateUnionMember5Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using a bearer token.
        """
        return t.cast(
            connected_account_create_params.ConnectionState,
            {
                "auth_scheme": "BEARER_TOKEN",
                "val": t.cast(
                    connected_account_create_params.ConnectionStateUnionMember5Val,
                    {
                        "status": "ACTIVE",
                        **options,
                    },
                ),
            },
        )

    def google_service_account(
        self, options: connected_account_create_params.ConnectionStateUnionMember6Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using a Google service account.
        """
        return t.cast(
            connected_account_create_params.ConnectionState,
            {
                "auth_scheme": "GOOGLE_SERVICE_ACCOUNT",
                "val": t.cast(
                    connected_account_create_params.ConnectionStateUnionMember6Val,
                    {
                        "status": "ACTIVE",
                        **options,
                    },
                ),
            },
        )

    def no_auth(
        self, options: connected_account_create_params.ConnectionStateUnionMember7Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using no auth.
        """
        return {
            "auth_scheme": "NO_AUTH",
            "val": t.cast(
                connected_account_create_params.ConnectionStateUnionMember7Val,
                {
                    "status": "ACTIVE",
                    **options,
                },
            ),
        }

    def calcom_auth(
        self, options: connected_account_create_params.ConnectionStateUnionMember8Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using Cal.com auth.
        """
        return {
            "auth_scheme": "CALCOM_AUTH",
            "val": t.cast(
                connected_account_create_params.ConnectionStateUnionMember8Val,
                {
                    "status": "ACTIVE",
                    **options,
                },
            ),
        }

    def billcom_auth(
        self, options: connected_account_create_params.ConnectionStateUnionMember9Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using Bill.com auth.
        """
        return t.cast(
            connected_account_create_params.ConnectionState,
            {
                "auth_scheme": "BILLCOM_AUTH",
                "val": t.cast(
                    connected_account_create_params.ConnectionStateUnionMember9Val,
                    {
                        "status": "ACTIVE",
                        **options,
                    },
                ),
            },
        )

    def basic_with_jwt(
        self, options: connected_account_create_params.ConnectionStateUnionMember10Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using basic auth with JWT.
        """
        return t.cast(
            connected_account_create_params.ConnectionState,
            {
                "auth_scheme": "BASIC_WITH_JWT",
                "val": t.cast(
                    connected_account_create_params.ConnectionStateUnionMember10Val,
                    {
                        "status": "ACTIVE",
                        **options,
                    },
                ),
            },
        )


class ConnectedAccounts:
    """
    Manage connected accounts.

    This class is used to manage connected accounts in the Composio SDK.
    These are used to authenticate with third-party services.
    """

    enable: t.Callable[
        [str],
        connected_account_update_status_response.ConnectedAccountUpdateStatusResponse,
    ]
    """Enable a connected account."""

    disable: t.Callable[
        [str],
        connected_account_update_status_response.ConnectedAccountUpdateStatusResponse,
    ]
    """Disable a connected account."""

    def __init__(self, client: HttpClient):
        """
        Initialize the connected accounts resource.

        :param client: The client to use for the connected accounts resource.
        """
        self._client = client
        self.get = self._client.connected_accounts.retrieve
        self.list = self._client.connected_accounts.list
        self.delete = self._client.connected_accounts.delete
        self.update_status = self._client.connected_accounts.update_status
        self.refresh = self._client.connected_accounts.refresh
        self.enable = functools.partial(
            self._client.connected_accounts.update_status,
            enabled=True,
        )
        self.disable = functools.partial(
            self._client.connected_accounts.update_status,
            enabled=False,
        )

    def update(
        self,
        nanoid: str,
        *,
        alias: t.Optional[str] = None,
        connection: t.Optional[connected_account_patch_params.Connection] = None,
    ) -> connected_account_patch_response.ConnectedAccountPatchResponse:
        """
        Update a connected account's alias and/or credentials.

        :param nanoid: The connected account ID (ca_xxx).
        :param alias: Human-readable alias. Pass an empty string to clear.
                      Must be unique per entity and toolkit within the project.
        :param connection: Credential update with authScheme and val fields.
        :return: Response with ``id``, ``status``, and ``success``.

        Example:
            # Set an alias
            composio.connected_accounts.update('ca_abc123', alias='work-gmail')

            # Clear an alias
            composio.connected_accounts.update('ca_abc123', alias='')
        """
        return self._client.connected_accounts.patch(
            nanoid,
            alias=alias if alias is not None else omit,
            connection=connection if connection is not None else omit,
        )

    def update_acl(
        self,
        nanoid: str,
        *,
        allow_all_users: t.Optional[bool] = None,
        allowed_user_ids: t.Optional[t.List[str]] = None,
        not_allowed_user_ids: t.Optional[t.List[str]] = None,
    ) -> connected_account_patch_response.ConnectedAccountPatchResponse:
        """
        Update the per-user ACL on a SHARED connected account. Experimental —
        shape may change in future releases.

        Only valid on SHARED connections; raises
        ``ComposioAclOnlyForSharedError`` on a PRIVATE connection. Omit a
        parameter to leave it unchanged; pass an empty list to clear an
        allow/deny list. At least one parameter must be provided.

        :param nanoid: The connected account ID (``ca_xxx``).
        :param allow_all_users: When True, any ``user_id`` may use this
            SHARED connection (subject to the deny list).
        :param allowed_user_ids: Explicit list of allowed ``user_id`` strings.
            Pass ``[]`` to clear.
        :param not_allowed_user_ids: Explicit deny list (wins over allow on
            conflict). Pass ``[]`` to clear — note that clearing the deny
            list silently re-grants access to previously-blocked users.
        :return: Response with ``id``, ``status``, and ``success``.

        Example:
            composio.connected_accounts.update_acl(
                'ca_abc',
                allow_all_users=True,
                not_allowed_user_ids=['user_bob'],
            )
        """
        if (
            allow_all_users is None
            and allowed_user_ids is None
            and not_allowed_user_ids is None
        ):
            raise exceptions.ValidationError(
                "update_acl requires at least one of allow_all_users, "
                "allowed_user_ids, or not_allowed_user_ids"
            )

        acl: t.Dict[str, t.Any] = {}
        if allow_all_users is not None:
            acl["allow_all_users"] = allow_all_users
        if allowed_user_ids is not None:
            acl["allowed_user_ids"] = allowed_user_ids
        if not_allowed_user_ids is not None:
            acl["not_allowed_user_ids"] = not_allowed_user_ids

        try:
            return self._client.connected_accounts.patch(
                nanoid,
                experimental={
                    "acl_config_for_shared": t.cast(
                        connected_account_patch_params.ExperimentalACLConfigForShared,
                        acl,
                    ),
                },
            )
        except BadRequestError as error:
            message = str(error)
            if ACL_ONLY_FOR_SHARED_ERROR_FRAGMENT in message:
                raise exceptions.ComposioAclOnlyForSharedError(message) from error
            raise

    def initiate(
        self,
        user_id: str,
        auth_config_id: str,
        *,
        callback_url: t.Optional[str] = None,
        allow_multiple: bool = False,
        config: t.Optional[connected_account_create_params.ConnectionState] = None,
        alias: t.Optional[str] = None,
    ) -> ConnectionRequest:
        """
        Compound function to create a new connected account. This function creates
        a new connected account and returns a connection request.

        Users can then wait for the connection to be established using the
        ``wait_for_connection`` method.

        .. deprecated::
            For Composio-managed (default) auth configs on redirectable OAuth
            schemes (OAuth1, OAuth2, DCR_OAUTH), the legacy endpoint this
            method wraps is being retired: **2026-05-08** for new
            organizations and **2026-07-03** for all remaining organizations.
            After your org's cutover, this method will raise
            :class:`composio.exceptions.ComposioLegacyConnectedAccountsEndpointRetiredError`
            for that specific combination.

            Use :meth:`ConnectedAccounts.link` for Composio-managed OAuth — it
            works for every redirectable scheme regardless of whether the
            auth config is Composio-managed or custom, and the return shape
            is the same.

            Custom auth configs (your own OAuth app) and non-OAuth schemes
            (API key, bearer token, basic auth) are unaffected and continue
            to work on ``initiate()``. See
            https://docs.composio.dev/docs/changelog/2026/04/24

        :param user_id: The user ID to create the connected account for.
        :param auth_config_id: The auth config ID to create the connected account for.
        :param callback_url: Callback URL to use for OAuth apps.
        :param config: The configuration to create the connected account with.
        :param allow_multiple: Whether to allow multiple connected accounts for the same user and auth config.
        :param alias: Optional human-readable alias for the account. Must be unique per userId and toolkit within the project.
        :return: The connection request.
        """
        # Check if there are multiple connected accounts for the authConfig of the user
        connected_accounts = self.list(
            user_ids=[user_id], auth_config_ids=[auth_config_id], statuses=["ACTIVE"]
        )
        if connected_accounts.items and not allow_multiple:
            raise exceptions.ComposioMultipleConnectedAccountsError(
                f"Multiple connected accounts found for user {user_id} in auth config {auth_config_id}. "
                "Please use the allow_multiple option to allow multiple connected accounts."
            )
        elif connected_accounts.items:
            logger.warning(
                "[Warn:AllowMultiple] Multiple connected accounts found for user %s in auth config %s",
                user_id,
                auth_config_id,
            )

        connection: dict[str, t.Any] = {"user_id": user_id}
        if callback_url is not None:
            connection["callback_url"] = callback_url
        if config is not None:
            connection["state"] = config
        if alias is not None:
            connection["alias"] = alias

        # Use `with_raw_response.create` so we can read the SEC-339
        # `Deprecation` header (RFC 9745) the apollo retiring branch sets —
        # that header is emitted only when the auth config is Composio-managed
        # AND on a redirectable OAuth scheme, so it's the canonical signal
        # that this caller needs to migrate. Custom auth configs and non-OAuth
        # schemes never see the header, eliminating the false-positive warning
        # that an auth_scheme-only check produced for link()-unaffected callers.
        deprecation_header: t.Optional[str] = None
        try:
            ca_client = self._client.connected_accounts
            raw_create = getattr(
                getattr(ca_client, "with_raw_response", None), "create", None
            )
            if callable(raw_create):
                raw = raw_create(
                    auth_config={"id": auth_config_id},
                    connection=t.cast(
                        connected_account_create_params.Connection, connection
                    ),
                )
                response = raw.parse() if callable(getattr(raw, "parse", None)) else raw
                headers = getattr(raw, "headers", None)
                if headers is not None and hasattr(headers, "get"):
                    value = headers.get("Deprecation") or headers.get("deprecation")
                    if isinstance(value, str):
                        deprecation_header = value
            else:
                # Test mocks may not stub `with_raw_response`. Fall back to
                # the parsed-only path; the deprecation gate stays off (no
                # header to read).
                response = ca_client.create(
                    auth_config={"id": auth_config_id},
                    connection=t.cast(
                        connected_account_create_params.Connection, connection
                    ),
                )
        except BadRequestError as error:
            # When the server has flipped this org to the retired path, the
            # legacy endpoint returns 400 with a stable migration message.
            # Surface it as a typed error so callers get an actionable hint
            # instead of a generic BadRequestError.
            message = str(error)
            if (
                "no longer supported" in message
                and "/api/v3/connected_accounts/link" in message
            ):
                raise exceptions.ComposioLegacyConnectedAccountsEndpointRetiredError(
                    message
                ) from error
            raise

        # Warn once per process when apollo flags this response as on the
        # retiring path. Header presence is a 1:1 signal — custom auth
        # configs and non-OAuth schemes get a clean response and stay silent,
        # fixing the false-positive that auth_scheme-based detection
        # produced.
        global _legacy_initiate_warning_emitted
        if not _legacy_initiate_warning_emitted and deprecation_header:
            _legacy_initiate_warning_emitted = True
            warnings.warn(
                "composio.connected_accounts.initiate() will stop working "
                "for this auth config on or before 2026-07-03 (see Sunset "
                "header on the response). Switch to "
                "composio.connected_accounts.link() — same return shape, "
                "same allow_multiple semantics. "
                "https://docs.composio.dev/docs/changelog/2026/04/24",
                DeprecationWarning,
                stacklevel=2,
            )

        return ConnectionRequest(
            id=response.id,
            status=response.connection_data.val.status,
            redirect_url=getattr(response.connection_data.val, "redirect_url", None),
            client=self._client,
        )

    def link(
        self,
        user_id: str,
        auth_config_id: str,
        *,
        callback_url: t.Optional[str] = None,
        alias: t.Optional[str] = None,
        allow_multiple: bool = False,
        experimental: t.Optional[link_create_params.Experimental] = None,
    ) -> ConnectionRequest:
        """
        Create a Composio Connect Link for a user to connect their account to a given auth config.

        This method will return an external link which you can use for the user to connect their account.

        :param user_id: The external user ID to create the connected account for.
        :param auth_config_id: The auth config ID to create the connected account for.
        :param callback_url: The URL to redirect the user to post connecting their account.
        :param alias: Optional human-readable alias for the connection. Must be unique
            per userId and toolkit within the project.
        :param allow_multiple: Whether to allow multiple connected accounts for the same
            user and auth config. When False (default), raises
            ``ComposioMultipleConnectedAccountsError`` if the user already has an
            ``ACTIVE`` connection on this auth config. Pair with ``alias`` and a
            session-level ``multi_account`` config to disambiguate at execution time.
        :param experimental: Experimental options for this connection. Pass an
            ``Experimental`` dict with ``account_type`` and/or
            ``acl_config_for_shared`` to create a SHARED connection with a
            per-user ACL. Experimental — shape may change in future releases.
        :return: Connection request object.

        Example:
            # Create a connection request and redirect the user to the redirect url
            connection_request = composio.connected_accounts.link('user_123', 'auth_config_123')
            redirect_url = connection_request.redirect_url
            print(f"Visit: {redirect_url} to authenticate your account")

            # Wait for the connection to be established
            connected_account = connection_request.wait_for_connection()

        Example with callback URL:
            # Create a connection request with callback URL
            connection_request = composio.connected_accounts.link(
                'user_123',
                'auth_config_123',
                callback_url='https://your-app.com/callback'
            )
            redirect_url = connection_request.redirect_url
            print(f"Visit: {redirect_url} to authenticate your account")

            # Wait for the connection to be established
            connected_account = composio.connected_accounts.wait_for_connection(connection_request.id)

        Example creating a SHARED connection with an ACL (experimental):
            connection_request = composio.connected_accounts.link(
                'user_creator',
                'auth_config_123',
                experimental={
                    'account_type': 'SHARED',
                    'acl_config_for_shared': {
                        'allow_all_users': True,
                        'not_allowed_user_ids': ['user_bob'],
                    },
                },
            )
        """
        # Mirror ``initiate()``: guard against silently creating extra
        # connections on the same auth config.
        connected_accounts = self.list(
            user_ids=[user_id], auth_config_ids=[auth_config_id], statuses=["ACTIVE"]
        )
        if connected_accounts.items and not allow_multiple:
            raise exceptions.ComposioMultipleConnectedAccountsError(
                f"Multiple connected accounts found for user {user_id} in auth config {auth_config_id}. "
                "Please use the allow_multiple option to allow multiple connected accounts."
            )
        elif connected_accounts.items:
            logger.warning(
                "[Warn:AllowMultiple] Multiple connected accounts found for user %s in auth config %s",
                user_id,
                auth_config_id,
            )

        try:
            response = self._client.link.create(
                auth_config_id=auth_config_id,
                user_id=user_id,
                callback_url=callback_url if callback_url is not None else omit,
                alias=alias if alias is not None else omit,
                experimental=experimental if experimental is not None else omit,
            )
        except BadRequestError as error:
            # The server rejects ACL on PRIVATE connections — surface that
            # as a typed error so callers can ``except`` instead of grepping
            # messages.
            message = str(error)
            if ACL_ONLY_FOR_SHARED_ERROR_FRAGMENT in message:
                raise exceptions.ComposioAclOnlyForSharedError(message) from error
            raise

        return ConnectionRequest(
            id=response.connected_account_id,
            status="INITIATED",
            redirect_url=getattr(response, "redirect_url", None),
            client=self._client,
        )

    def wait_for_connection(
        self,
        id: str,
        timeout: t.Optional[float] = None,
    ) -> connected_account_retrieve_response.ConnectedAccountRetrieveResponse:
        """
        Wait for connected account with given ID to be active
        """
        return ConnectionRequest.from_id(
            id=id,
            client=self._client,
        ).wait_for_connection(
            timeout=timeout,
        )


auth_scheme = AuthScheme()
