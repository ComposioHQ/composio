from __future__ import annotations

import functools
import time
import typing as t

from composio import exceptions
from composio.client import HttpClient
from composio.client.types import (
    connected_account_create_params,
    connected_account_retrieve_response,
    connected_account_update_status_response,
    toolkit_retrieve_response,
)

from .base import Resource

Oauth1L: t.TypeAlias = t.Literal["OAUTH1"]
Oauth2L: t.TypeAlias = t.Literal["OAUTH2"]
ApiKeyL: t.TypeAlias = t.Literal["API_KEY"]
BasicL: t.TypeAlias = t.Literal["BASIC"]
NoAuthL: t.TypeAlias = t.Literal["NO_AUTH"]
SnowflakeL: t.TypeAlias = t.Literal["SNOWFLAKE"]
CalcomAuthL: t.TypeAlias = t.Literal["CALCOM_AUTH"]
BearerTokenL: t.TypeAlias = t.Literal["BEARER_TOKEN"]
BillcomAuthL: t.TypeAlias = t.Literal["BILLCOM_AUTH"]
ComposioLinkL: t.TypeAlias = t.Literal["COMPOSIO_LINK"]
BasicWithJwtL: t.TypeAlias = t.Literal["BASIC_WITH_JWT"]
GoogleServiceAccountL: t.TypeAlias = t.Literal["GOOGLE_SERVICE_ACCOUNT"]

AuthSchemeL: t.TypeAlias = t.Literal[
    Oauth1L,
    Oauth2L,
    ApiKeyL,
    BasicL,
    NoAuthL,
    SnowflakeL,
    CalcomAuthL,
    BearerTokenL,
    BillcomAuthL,
    ComposioLinkL,
    BasicWithJwtL,
    GoogleServiceAccountL,
]


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
                    "status": "INITIALISING",
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

    def snowflake(
        self, options: connected_account_create_params.ConnectionStateUnionMember9Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using Snowflake.
        """
        return {
            "auth_scheme": "SNOWFLAKE",
            "val": t.cast(
                connected_account_create_params.ConnectionStateUnionMember9Val,
                {
                    **options,
                    "status": "ACTIVE",
                },
            ),
        }

    def billcom_auth(
        self, options: connected_account_create_params.ConnectionStateUnionMember10Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using Bill.com auth.
        """
        return {
            "auth_scheme": "BILLCOM_AUTH",
            "val": t.cast(
                connected_account_create_params.ConnectionStateUnionMember10Val,
                {
                    **options,
                    "status": "ACTIVE",
                },
            ),
        }

    def basic_with_jwt(
        self, options: connected_account_create_params.ConnectionStateUnionMember11Val
    ) -> connected_account_create_params.ConnectionState:
        """
        Create a new connected account using basic auth with JWT.
        """
        return {
            "auth_scheme": "BASIC_WITH_JWT",
            "val": t.cast(
                connected_account_create_params.ConnectionStateUnionMember11Val,
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
        config: t.Optional[connected_account_create_params.ConnectionState] = None,
    ) -> ConnectionRequest:
        """
        Compound function to create a new coneected account. This function creates
        a new connected account and returns a connection request.

        Users can then wait for the connection to be established using the
        `wait_for_connection` method.

        :param user_id: The user ID to create the connected account for.
        :param auth_config_id: The auth config ID to create the connected account for.
        :param options: The options to create the connected account with.
        :return: The connection request.
        """
        response = self._client.connected_accounts.create(
            auth_config={"id": auth_config_id},
            connection=t.cast(
                connected_account_create_params.Connection,
                {
                    "user_id": user_id,
                    "state": config,
                },
            ),
        )
        return ConnectionRequest(
            id=response.id,
            status=response.connection_data.val.status,
            redirect_url=getattr(response.connection_data.val, "redirect_url", None),
            client=self._client,
        )

    def get_required_fields(
        self,
        toolkit: str,
        auth_scheme: AuthSchemeL,
    ) -> t.List[
        toolkit_retrieve_response.AuthConfigDetailFieldsConnectedAccountInitiationRequired
    ]:
        """
        Get the required property for a given toolkit and auth scheme.
        """
        info = self._client.toolkits.retrieve(slug=toolkit)
        for auth_detail in info.auth_config_details or []:
            if auth_detail.mode == auth_scheme:
                return auth_detail.fields.connected_account_initiation.required

        raise exceptions.InvalidParams(
            f"auth config details not found with {toolkit=} and {auth_scheme=}"
        )


auth_scheme = AuthScheme()
