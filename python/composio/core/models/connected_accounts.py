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
    connected_account_list_response,
    connected_account_list_params,
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

        Args:
            id: The ID of the connection request.
            status: The status of the connection request.
            redirect_url: The redirect URL of the connection request.
            client: The client to use for the connection request.

        Returns:
            The connection request.

        Examples:
            ```python
            connection_request = ConnectionRequest(
                id="1234567890",
                status="ACTIVE",
                redirect_url="https://example.com",
                client=client,
            )
            connection_request.wait_for_connection()
            print(connection_request.status)
            ```
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

        Args:
            timeout: The timeout to wait for the connection to be established.

        Returns:
            The connected account object.

        Examples:
            ```python
            connection_request = ConnectionRequest(
                id="1234567890",
                status="ACTIVE",
                redirect_url="https://example.com",
                client=client,
            )
            connection_request.wait_for_connection()
            print(connection_request.status)
            ```
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
        """
        Create a connection request from an ID.

        Args:
            id: The ID of the connection request.
            client: The client to use for the connection request.

        Returns:
            The connection request.

        Examples:
            ```python
            connection_request = ConnectionRequest.from_id("1234567890", client)
            print(connection_request.status)
            ```
        """
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


class ConnectedAccounts(Resource):
    """
    Manage connected accounts.
    """

    def get(
        self, id: str
    ) -> connected_account_retrieve_response.ConnectedAccountRetrieveResponse:
        """
        Get a connected account by ID.

        Args:
            id: The nanoid of the connected account to get.

        Returns:
            The connected account object.

        Examples:
            ```python
            connected_account = composio.connected_accounts.get(id="1234567890")
            print(connected_account.status)
            ```
        """
        return self._client.connected_accounts.retrieve(nanoid=id)

    def list(
        self,
        **options: te.Unpack[connected_account_list_params.ConnectedAccountListParams],
    ) -> connected_account_list_response.ConnectedAccountListResponse:
        """
        List all connected accounts.

        Args:
            auth_config_ids: The auth config ids of the connected accounts
            connected_account_ids: The connected account ids to filter by
            cursor: The cursor to paginate through the connected accounts
            labels: The labels of the connected accounts
            limit: The limit of the connected accounts to return
            order_by: The order by of the connected accounts
            order_direction: The order direction of the connected accounts
            statuses: The status of the connected account
            toolkit_slugs: The toolkit slugs of the connected accounts
            user_ids: The user ids of the connected accounts

        Returns:
            The connected accounts object.

        Examples:
            ```python
            # List all connected accounts
            connected_accounts = composio.connected_accounts.list()
            print(connected_accounts.items)

            # List all connected accounts for given users
            connected_accounts = composio.connected_accounts.list(
                user_ids=["<USER_ID>"],
            )
            print(connected_accounts.items)

            # List all connected accounts for given toolkits
            connected_accounts = composio.connected_accounts.list(
                toolkit_slugs=["<TOOLKIT_SLUG>"],
            )
            print(connected_accounts.items)

            # List all connected accounts for given auth config
            connected_accounts = composio.connected_accounts.list(
                auth_config_ids=["<AUTH_CONFIG_ID>"],
            )
            print(connected_accounts.items)
            ```
        """
        return self._client.connected_accounts.list(**options)

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

        Args:
            user_id: The user ID to create the connected account for.
            auth_config_id: The auth config ID to create the connected account for.
            callback_url: Callback URL to use for OAuth apps.
            config: The options to create the connected account with.

        Returns:
            The connection request.

        Examples:
            ```python
            connection_request = composio.connected_accounts.initiate(
                user_id="1234567890",
                auth_config_id="1234567890",
            )
            connection_request.wait_for_connection()
            print(connection_request.status)
            ```
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

        Args:
            id: The ID of the connected account to wait for.
            timeout: The timeout to wait for the connected account to be active.

        Returns:
            The connected account object.

        Examples:
            ```python
            connection_request = composio.connected_accounts.wait_for_connection(
                id="1234567890",
                timeout=10,
            )
            print(connection_request.status)
            ```
        """
        return ConnectionRequest.from_id(
            id=id,
            client=self._client,
        ).wait_for_connection(
            timeout=timeout,
        )

    def update_status(
        self,
        id: str,
        enabled: bool,
    ) -> bool:
        """
        Update the status of a connected account by ID.

        Args:
            id: The ID of the connected account to update the status of.
            enabled: Whether the connected account should be enabled.

        Returns:
            True if the connected account was updated, False otherwise.

        Examples:
            ```python
            # Enable a connected account
            composio.connected_accounts.update_status(id="<CONNECTED_ACCOUNT_ID>", enabled=True)

            # Disable a connected account
            composio.connected_accounts.update_status(id="<CONNECTED_ACCOUNT_ID>", enabled=False)
            ```
        """
        return self._client.connected_accounts.update_status(
            nano_id=id,
            enabled=enabled,
        ).success

    def delete(
        self,
        id: str,
    ) -> bool:
        """
        Delete a connected account by ID.

        Args:
            id: The ID of the connected account to delete.

        Returns:
            True if the connected account was deleted, False otherwise.

        Examples:
            ```python
            composio.connected_accounts.delete(id="<CONNECTED_ACCOUNT_ID>")
            ```
        """
        return self._client.connected_accounts.delete(nanoid=id).success

    def enable(self, id: str) -> bool:
        """
        Enable a connected account by ID.

        Args:
            id: The ID of the connected account to enable.

        Returns:
            True if the connected account was enabled, False otherwise.

        Examples:
            ```python
            composio.connected_accounts.enable(id="<CONNECTED_ACCOUNT_ID>")
            ```
        """
        return self._client.connected_accounts.update_status(
            nano_id=id,
            enabled=True,
        ).success

    def disable(
        self,
        id: str,
    ) -> bool:
        """
        Disable a connected account by ID.

        Args:
            id: The ID of the connected account to disable.

        Returns:
            True if the connected account was disabled, False otherwise.

        Examples:
            ```python
            composio.connected_accounts.disable(id="<CONNECTED_ACCOUNT_ID>")
            ```
        """
        return self._client.connected_accounts.update_status(
            nano_id=id,
            enabled=False,
        ).success


auth_scheme = AuthScheme()
