from __future__ import annotations

import functools
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
                    "status": "INITIALISING",
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
                    "status": "INITIALISING",
                },
            ),
        }

    def composio_link(
        self, options: connected_account_create_params.ConnectionStateUnionMember2Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using Composio Link.
        """
        return {
            "auth_scheme": "COMPOSIO_LINK",
            "val": t.cast(
                connected_account_create_params.ConnectionStateUnionMember2Val,
                {
                    **options,
                    "status": "INITIALIZING",
                },
            ),
        }

    def api_key(
        self, options: connected_account_create_params.ConnectionStateUnionMember3Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using an API key.
        """
        return {
            "auth_scheme": "API_KEY",
            "val": t.cast(
                connected_account_create_params.ConnectionStateUnionMember3Val,
                {
                    **options,
                    "status": "ACTIVE",
                },
            ),
        }

    def basic(
        self, options: connected_account_create_params.ConnectionStateUnionMember4Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using basic auth.
        """
        return {
            "auth_scheme": "BASIC",
            "val": t.cast(
                connected_account_create_params.ConnectionStateUnionMember4Val,
                {
                    **options,
                    "status": "ACTIVE",
                },
            ),
        }

    def bearer_token(
        self, options: connected_account_create_params.ConnectionStateUnionMember5Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using a bearer token.
        """
        return {
            "auth_scheme": "BEARER_TOKEN",
            "val": t.cast(
                connected_account_create_params.ConnectionStateUnionMember5Val,
                {
                    **options,
                    "status": "ACTIVE",
                },
            ),
        }

    def google_service_account(
        self, options: connected_account_create_params.ConnectionStateUnionMember6Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using a Google service account.
        """
        return {
            "auth_scheme": "GOOGLE_SERVICE_ACCOUNT",
            "val": t.cast(
                connected_account_create_params.ConnectionStateUnionMember6Val,
                {
                    **options,
                    "status": "ACTIVE",
                },
            ),
        }

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
        return {
            "auth_scheme": "BILLCOM_AUTH",
            "val": t.cast(
                connected_account_create_params.ConnectionStateUnionMember9Val,
                {
                    **options,
                    "status": "ACTIVE",
                },
            ),
        }

    def basic_with_jwt(
        self, options: connected_account_create_params.ConnectionStateUnionMember10Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using basic auth with JWT.
        """
        return {
            "auth_scheme": "BASIC_WITH_JWT",
            "val": t.cast(
                connected_account_create_params.ConnectionStateUnionMember10Val,
                {
                    **options,
                    "status": "ACTIVE",
                },
            ),
        }


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
        config: t.Optional[connected_account_create_params.ConnectionState] = None,
    ) -> ConnectionRequest:
        """
        Compound function to create a new coneected account. This function creates
        a new connected account and returns a connection request.

        Users can then wait for the connection to be established using the
        `wait_for_connection` method.

        :param user_id: The user ID to create the connected account for.
        :param auth_config_id: The auth config ID to create the connected account for.
        :param callback_url: Callback URL to use for OAuth apps.
        :param options: The options to create the connected account with.
        :return: The connection request.
        """
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

    def wait_for_connection(
        self,
        id: str,
        timeout: t.Optional[float] = None,
    ) -> connected_account_retrieve_response.ConnectedAccountRetrieveResponse:
        """
        Wait for connected account with given ID to be active
        """
        return ConnectionRequest.from_id(
            id=id, client=self._client
        ).wait_for_connection(
            timeout=timeout,
        )


auth_scheme = AuthScheme()
