from __future__ import annotations

import functools
import logging
import time
import typing as t

import typing_extensions as te

from composio import exceptions
from composio.client import HttpClient
from composio.client.types import (
    connected_account_create_params,
    connected_account_retrieve_response,
    connected_account_update_status_response,
)

from .base import Resource

logger = logging.getLogger(__name__)


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
            if self.status != "ACTIVE":
                time.sleep(1)
                continue
            return connection

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
        """
        return {
            "auth_scheme": "OAUTH1",
            "val": t.cast(
                connected_account_create_params.ConnectionStateUnionMember0Val,
                {
                    **options,
                    "status": "INITIALIZING",
                },
            ),
        }

    def oauth2(
        self, options: connected_account_create_params.ConnectionStateUnionMember1Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using OAuth 1.0.
        """
        return {
            "auth_scheme": "OAUTH2",
            "val": t.cast(
                connected_account_create_params.ConnectionStateUnionMember1Val,
                {
                    **options,
                    "status": "INITIALIZING",
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
                        **options,
                        "status": "INITIALIZING",
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
                        **options,
                        "status": "ACTIVE",
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
                        **options,
                        "status": "ACTIVE",
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
                        **options,
                        "status": "ACTIVE",
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
                        **options,
                        "status": "ACTIVE",
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
                    **options,
                    "status": "ACTIVE",
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
                    **options,
                    "status": "ACTIVE",
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
                        **options,
                        "status": "ACTIVE",
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
                        **options,
                        "status": "ACTIVE",
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

    def initiate(
        self,
        user_id: str,
        auth_config_id: str,
        *,
        callback_url: t.Optional[str] = None,
        allow_multiple: bool = False,
        config: t.Optional[connected_account_create_params.ConnectionState] = None,
    ) -> ConnectionRequest:
        """
        Compound function to create a new connected account. This function creates
        a new connected account and returns a connection request.

        Users can then wait for the connection to be established using the
        `wait_for_connection` method.

        :param user_id: The user ID to create the connected account for.
        :param auth_config_id: The auth config ID to create the connected account for.
        :param callback_url: Callback URL to use for OAuth apps.
        :param config: The configuration to create the connected account with.
        :param allow_multiple: Whether to allow multiple connected accounts for the same user and auth config.
        :return: The connection request.
        """
        # Check if there are multiple connected accounts for the authConfig of the user
        connected_accounts = self.list(
            user_ids=[user_id],
            auth_config_ids=[auth_config_id],
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

        response = self._client.connected_accounts.create(
            auth_config={"id": auth_config_id},
            connection=t.cast(connected_account_create_params.Connection, connection),
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
    ) -> ConnectionRequest:
        """
        Create a Composio Connect Link for a user to connect their account to a given auth config.

        This method will return an external link which you can use for the user to connect their account.

        :param user_id: The external user ID to create the connected account for.
        :param auth_config_id: The auth config ID to create the connected account for.
        :param callback_url: The URL to redirect the user to post connecting their account.
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
        """
        # Prepare the request payload
        payload: dict[str, t.Any] = {
            "auth_config_id": auth_config_id,
            "user_id": user_id,
        }

        # Add callback_url only if provided
        if callback_url is not None:
            payload["callback_url"] = callback_url

        # Call the link creation endpoint
        response = self._client.link.create(**payload)

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
