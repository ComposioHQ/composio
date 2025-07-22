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

        :param toolkit: The toolkit to create the auth config for.
        :param options: The options to create the auth config with.
        :return: The created auth config.
        """
        return self._client.auth_configs.create(
            toolkit={"slug": toolkit}, auth_config=options
        ).auth_config

    def get(
        self, nanoid: str
    ) -> auth_config_retrieve_response.AuthConfigRetrieveResponse:
        """
        Retrieves a specific authentication configuration by its ID

        :param nanoid: The ID of the auth config to retrieve.
        :return: The retrieved auth config.
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
        self, nanoid: str, *, options: auth_config_update_params.AuthConfigUpdateParams
    ) -> t.Dict:
        """
        Updates an existing authentication configuration.

        This method allows you to modify properties of an auth config such as credentials,
        scopes, or tool restrictions. The update type (custom or default) determines which
        fields can be updated.

        :param nanoid: The ID of the auth config to update.
        :param options: The options to update the auth config with.
        :return: The updated auth config.
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

        :param nanoid: The ID of the auth config to delete.
        :return: The deleted auth config.
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

        :param nanoid: The ID of the auth config to enable.
        :return: The enabled auth config.
        """
        return self.__update_status(nanoid, "ENABLED")

    def disable(self, nanoid: str) -> t.Dict:
        """
        Disables an existing authentication configuration.

        :param nanoid: The ID of the auth config to disable.
        :return: The disabled auth config.
        """
        return self.__update_status(nanoid, "DISABLED")
