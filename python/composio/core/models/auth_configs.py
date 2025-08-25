from __future__ import annotations

import typing as t

import typing_extensions as te

from composio.client.types import (
    auth_config_create_params,
    auth_config_create_response,
    auth_config_list_params,
    auth_config_list_response,
    auth_config_retrieve_response,
    auth_config_update_params,
)
from composio.core.models.base import Resource


class AuthConfigs(Resource):
    """
    Manage authentication configurations.
    """

    def list(
        self,
        **query: te.Unpack[auth_config_list_params.AuthConfigListParams],
    ) -> auth_config_list_response.AuthConfigListResponse:
        """
        Lists authentication configurations based on provided filter criteria.
        """
        return self._client.auth_configs.list(**query)

    @t.overload
    def create(
        self, toolkit: str, options: auth_config_create_params.AuthConfigUnionMember1
    ) -> auth_config_create_response.AuthConfig: ...

    @t.overload
    def create(
        self, toolkit: str, options: auth_config_create_params.AuthConfigUnionMember0
    ) -> auth_config_create_response.AuthConfig: ...

    def create(
        self, toolkit: str, options: auth_config_create_params.AuthConfig
    ) -> auth_config_create_response.AuthConfig:
        """
        Create a new auth config

        Args:
            toolkit: The toolkit to create the auth config for.
            options: The options to create the auth config with.

        Returns:
            The created auth config.

        Examples:
        ```python
            # Use composio managed auth
            auth_config = composio.auth_configs.create(
                toolkit="github",
                options={
                    "type": "use_composio_managed_auth",
                },
            )
            print(auth_config)

            # Use custom auth
            auth_config = composio.auth_configs.create(
                toolkit="gmail",
                options={
                    "name": "Gmail Auth",
                    "type": "use_custom_auth",
                    "auth_scheme": "OAUTH2",
                    "credentials": {
                        "client_id": "<AUTH_CONFIG_ID>",
                        "client_secret": "<AUTH_CONFIG_ID>",
                    },
                },
            )
            print(auth_config)

            # Restrict tool access
            auth_config = composio.auth_configs.create(
                toolkit="github",
                options={
                    "type": "use_composio_managed_auth",
                    "tool_access_config": {
                        "tools_for_connected_account_creation": [
                            "GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER"
                        ],
                    },
                },
            )
            print(auth_config)
        ```
        """
        return self._client.auth_configs.create(
            toolkit={"slug": toolkit},
            auth_config=options,
        ).auth_config

    def get(
        self, nanoid: str
    ) -> auth_config_retrieve_response.AuthConfigRetrieveResponse:
        """
        Retrieves a specific authentication configuration by its ID

        Args:
            nanoid: The ID of the auth config to retrieve.

        Returns:
            The retrieved auth config.

        Examples:
        ```python
            # Retrieve a specific auth config
            composio.auth_configs.get("<AUTH_CONFIG_ID>")
        ```
        """
        return self._client.auth_configs.retrieve(nanoid)

    @t.overload
    def update(
        self, nanoid: str, *, options: auth_config_update_params.Variant0
    ) -> t.Dict: ...

    @t.overload
    def update(
        self, nanoid: str, *, options: auth_config_update_params.Variant1
    ) -> t.Dict: ...

    # FIXME: what type is this response, in ts, it's AuthConfigUpdateResponse
    def update(
        self,
        nanoid: str,
        *,
        options: auth_config_update_params.AuthConfigUpdateParams,
    ) -> t.Dict:
        """
        Updates an existing authentication configuration.

        This method allows you to modify properties of an auth config such as credentials,
        scopes, or tool restrictions. The update type (custom or default) determines which
        fields can be updated.

        Args:
            nanoid: The ID of the auth config to update.
            options: The options to update the auth config with.

        Returns:
            The updated auth config.

        Examples:
        ```python
            composio.auth_configs.update("<AUTH_CONFIG_ID>", options={
                "type": "default",
                "credentials": {
                    "api_key": "sk-1234567890",
                },
            })
        ```
        """
        return t.cast(
            t.Dict,
            self._client.auth_configs.update(
                nanoid=nanoid,
                type=options["type"],  # type: ignore
                credentials=options.get("credentials", self._client.not_given),
                tool_access_config=options.get(
                    "tool_access_config", self._client.not_given
                ),
            ),
        )

    def delete(self, nanoid: str) -> t.Dict:
        """
        Deletes an existing authentication configuration.

        Args:
            nanoid: The ID of the auth config to delete.

        Returns:
            The deleted auth config.

        Examples:
        ```python
            composio.auth_configs.delete("<AUTH_CONFIG_ID>")
        ```
        """
        return t.cast(t.Dict, self._client.auth_configs.delete(nanoid))

    def __update_status(
        self,
        nanoid: str,
        status: t.Literal["ENABLED", "DISABLED"],
    ) -> t.Dict:
        return t.cast(
            t.Dict,
            self._client.auth_configs.update_status(
                status,
                nanoid=nanoid,
            ),
        )

    def enable(self, nanoid: str) -> t.Dict:
        """
        Enables an existing authentication configuration.

        Args:
            nanoid: The ID of the auth config to enable.

        Returns:
            The enabled auth config.

        Examples:
        ```python
            composio.auth_configs.enable("<AUTH_CONFIG_ID>")
        ```
        """
        return self.__update_status(nanoid, "ENABLED")

    def disable(self, nanoid: str) -> t.Dict:
        """
        Disables an existing authentication configuration.

        Args:
            nanoid: The ID of the auth config to disable.

        Returns:
            The disabled auth config.

        Examples:
        ```python
            composio.auth_configs.disable("<AUTH_CONFIG_ID>")
        ```
        """
        return self.__update_status(nanoid, "DISABLED")
