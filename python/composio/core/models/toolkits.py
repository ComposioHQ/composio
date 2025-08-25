from __future__ import annotations

import typing as t

from composio import exceptions
from composio.client import HttpClient
from composio.client.types import (
    AuthSchemeL,
    toolkit_list_params,
    toolkit_list_response,
    toolkit_retrieve_response,
)
from composio.core.models.connected_accounts import ConnectedAccounts

from .base import Resource

AuthFieldsT: t.TypeAlias = t.List[
    toolkit_retrieve_response.AuthConfigDetailFieldsConnectedAccountInitiationRequired
    | toolkit_retrieve_response.AuthConfigDetailFieldsConnectedAccountInitiationOptional
    | toolkit_retrieve_response.AuthConfigDetailFieldsAuthConfigCreationRequired
    | toolkit_retrieve_response.AuthConfigDetailFieldsAuthConfigCreationOptional
]


class Toolkits(Resource):
    """
    Manage toolkits.
    """

    connected_accounts: ConnectedAccounts

    def __init__(self, client: HttpClient):
        super().__init__(client)
        self.connected_accounts = ConnectedAccounts(client)

    @t.overload
    def get(self) -> list[toolkit_list_response.Item]:
        """Get all toolkits."""

    @t.overload
    def get(self, slug: str) -> toolkit_retrieve_response.ToolkitRetrieveResponse:
        """Get a toolkit by slug."""

    @t.overload
    def get(
        self,
        *,
        query: toolkit_list_params.ToolkitListParams,
    ) -> list[toolkit_list_response.Item]:
        """Get a list of toolkits by query."""

    def get(
        self,
        slug: t.Optional[str] = None,
        *,
        query: t.Optional[toolkit_list_params.ToolkitListParams] = None,
    ) -> t.Union[
        toolkit_retrieve_response.ToolkitRetrieveResponse,
        list[toolkit_list_response.Item],
    ]:
        """
        Get a toolkit by slug or list toolkits by query.

        Args:
            slug: The slug of the toolkit to get.
            query: The query to filter toolkits by.

        Returns:
            The toolkit or list of toolkits.

        Examples:
        ```python
            # List all toolkits
            toolkits = composio.toolkits.get()
            print(toolkits)

            # Query by slug
            toolkit = composio.toolkits.get(slug="github")
            print(toolkit.name)

            # Query by category
            toolkits = composio.toolkits.get(query={"category": "Developer Tools"})
            print(toolkits)
        ```
        """
        if slug is not None:
            return self._client.toolkits.retrieve(slug=slug)
        return self._client.toolkits.list(**(query or {})).items

    def list_categories(self):
        """
        List all categories of toolkits.

        Returns:
            The list of categories.

        Examples:
        ```python
            # List all available categories
            categories = composio.toolkits.list_categories()
            print(categories)
        ```
        """
        return self._client.toolkits.retrieve_categories().items

    def _get_auth_config_id(self, toolkit: str) -> str:
        """Get the auth config ID for a toolkit.

        Args:
            toolkit: The slug of the toolkit to get the auth config ID for.

        Returns:
            The auth config ID.
        """
        auth_configs = self._client.auth_configs.list(toolkit_slug=toolkit)
        if len(auth_configs.items) > 0:
            (auth_config, *_) = sorted(
                auth_configs.items,
                key=lambda x: t.cast(str, x.created_at),
                reverse=True,
            )
            return auth_config.id

        return self._client.auth_configs.create(
            toolkit={"slug": toolkit},
            auth_config={
                "type": "use_composio_managed_auth",
                "tool_access_config": {
                    "tools_for_connected_account_creation": [],
                },
            },
        ).auth_config.id

    def authorize(self, *, user_id: str, toolkit: str):
        """
        Authorize a user to a toolkit If auth config is not found, it will be
        created using composio managed auth.

        Args:
            user_id: The ID of the user to authorize.
            toolkit: The slug of the toolkit to authorize.

        Returns:
            The connection request.

        Examples:
        ```python
            connection_request = composio.toolkits.authorize(
                user_id="1234567890",
                toolkit="github",
            )
        ```

        Note:
            This method should not be used in production.
        """
        return self.connected_accounts.initiate(
            user_id=user_id,
            auth_config_id=self._get_auth_config_id(
                toolkit=toolkit,
            ),
        )

    def get_connected_account_initiation_fields(
        self,
        toolkit: str,
        auth_scheme: AuthSchemeL,
        required_only: bool = False,
    ) -> AuthFieldsT:
        """
        Get the required property for a given toolkit and auth scheme.

        Args:
            toolkit: The slug of the toolkit to get the connected account
                initiation fields for.
            auth_scheme: The auth scheme to get the connected account initiation
                fields for.
            required_only: Whether to return only the required fields.

        Returns:
            The connected account initiation fields.

        Raises:
            InvalidParams: If the auth config details are not found.

        Examples:
        ```python
            # Get the required fields to initiate a connected account
            fields = composio.toolkits.get_connected_account_initiation_fields(
                toolkit="github",
                auth_scheme="OAUTH2",
                required_only=True,
            )
        ```
        """
        details = self._client.toolkits.retrieve(slug=toolkit).auth_config_details or []
        for auth_detail in details:
            if auth_detail.mode != auth_scheme:
                continue

            if required_only:
                return t.cast(
                    AuthFieldsT,
                    auth_detail.fields.connected_account_initiation.required,
                )

            return t.cast(
                AuthFieldsT,
                auth_detail.fields.connected_account_initiation.required
                + auth_detail.fields.connected_account_initiation.optional,
            )

        raise exceptions.InvalidParams(
            f"auth config details not found with {toolkit=} and {auth_scheme=}"
        )

    def get_auth_config_creation_fields(
        self,
        toolkit: str,
        auth_scheme: AuthSchemeL,
        required_only: bool = False,
    ) -> AuthFieldsT:
        """
        Get the required property for a given toolkit and auth scheme.

        Args:
            toolkit: The slug of the toolkit to get the auth config creation fields for.
            auth_scheme: The auth scheme to get the auth config creation fields for.
            required_only: Whether to return only the required fields.

        Returns:
            The auth config creation fields.

        Raises:
            InvalidParams: If the auth config details are not found.

        Examples:
        ```python
            # Get the required fields to create an auth config
            fields = composio.toolkits.get_auth_config_creation_fields(
                toolkit="github",
                auth_scheme="OAUTH2",
                required_only=True,
            )
        ```
        """
        info = self._client.toolkits.retrieve(slug=toolkit)
        for auth_detail in info.auth_config_details or []:
            if auth_detail.mode != auth_scheme:
                continue

            if required_only:
                return t.cast(
                    AuthFieldsT,
                    auth_detail.fields.auth_config_creation.required,
                )

            return t.cast(
                AuthFieldsT,
                auth_detail.fields.auth_config_creation.required
                + auth_detail.fields.auth_config_creation.optional,
            )

        raise exceptions.InvalidParams(
            f"auth config details not found with {toolkit=} and {auth_scheme=}"
        )
