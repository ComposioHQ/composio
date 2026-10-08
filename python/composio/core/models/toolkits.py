from __future__ import annotations

import typing as t

import typing_extensions as te

from composio import exceptions
from composio.client import HttpClient
from composio.client.types import (
    AuthSchemeL,
    toolkit_list_params,
    toolkit_list_response,
    toolkit_recommend_scopes_params,
    toolkit_recommend_scopes_response,
    toolkit_retrieve_changelog_response,
    toolkit_retrieve_response,
    toolkit_retrieve_scopes_grant_context_params,
    toolkit_retrieve_scopes_grant_context_response,
)
from composio.core.models.connected_accounts import ConnectedAccounts
from composio.utils.pydantic import none_to_omit

from .base import Resource

AuthFieldsT: t.TypeAlias = t.List[
    toolkit_retrieve_response.AuthConfigDetailFieldsConnectedAccountInitiationRequired
    | toolkit_retrieve_response.AuthConfigDetailFieldsConnectedAccountInitiationOptional
    | toolkit_retrieve_response.AuthConfigDetailFieldsAuthConfigCreationRequired
    | toolkit_retrieve_response.AuthConfigDetailFieldsAuthConfigCreationOptional
]


class Toolkits(Resource):
    """
    Toolkits are a collectiono of tools that can be used to perform various tasks.
    They're conceptualized as a set of tools. Ex: Github toolkit can perform
    Github actions via its collection of tools. This is a replacement of the
    `apps` concept in the earlier versions of the SDK.
    """

    connected_accounts: ConnectedAccounts

    def __init__(self, client: HttpClient):
        super().__init__(client)
        self.connected_accounts = ConnectedAccounts(client)

    def list(
        self,
        *,
        category: t.Optional[str] = None,
        cursor: t.Optional[str] = None,
        limit: t.Optional[float] = None,
        sort_by: t.Optional[t.Literal["usage", "alphabetically"]] = None,
        managed_by: t.Optional[t.Literal["composio", "all", "project"]] = None,
    ) -> toolkit_list_response.ToolkitListResponse:
        """List all toolkits."""
        return self._client.toolkits.list(
            category=none_to_omit(category),
            cursor=none_to_omit(cursor),
            limit=none_to_omit(limit),
            managed_by=none_to_omit(managed_by),
            sort_by=none_to_omit(sort_by),
        )

    @t.overload
    def get(self) -> t.List[toolkit_list_response.Item]:
        """Get all toolkits."""

    @t.overload
    def get(self, slug: str) -> toolkit_retrieve_response.ToolkitRetrieveResponse:
        """Get a toolkit by slug."""

    @t.overload
    def get(
        self,
        *,
        query: toolkit_list_params.ToolkitListParams,
    ) -> t.List[toolkit_list_response.Item]:
        """Get a list of toolkits by query."""

    def get(
        self,
        slug: t.Optional[str] = None,
        *,
        query: t.Optional[toolkit_list_params.ToolkitListParams] = None,
    ) -> t.Union[
        toolkit_retrieve_response.ToolkitRetrieveResponse,
        t.List[toolkit_list_response.Item],
    ]:
        if slug is not None:
            return self._client.toolkits.retrieve(slug=slug)
        return self._client.toolkits.list(**(query or {})).items

    def get_many(
        self,
        slugs: t.Sequence[str],
        *,
        category: t.Optional[str] = None,
        managed_by: t.Optional[t.Literal["composio", "all", "project"]] = None,
        sort_by: t.Optional[t.Literal["usage", "alphabetically"]] = None,
        limit: t.Optional[float] = None,
        cursor: t.Optional[str] = None,
    ) -> t.List[t.Any]:
        """
        Fetch several toolkits by slug in one request.

        :param slugs: The toolkit slugs to fetch.
        :param category: Only return toolkits in this category.
        :param managed_by: Filter by who manages the toolkit.
        :param sort_by: Sort order of the returned toolkits.
        :param limit: Maximum number of toolkits to return.
        :param cursor: Pagination cursor from a previous response.
        :return: The matching toolkits.

        Example:
            toolkits = composio.toolkits.get_many(["github", "slack"])
            for toolkit in toolkits:
                print(toolkit.slug, toolkit.name)
        """
        return self._client.toolkits.retrieve_multi(
            toolkits=list(slugs),
            category=none_to_omit(category),
            managed_by=none_to_omit(managed_by),
            sort_by=none_to_omit(sort_by),
            limit=none_to_omit(limit),
            cursor=none_to_omit(cursor),
        ).items

    def changelog(
        self,
    ) -> toolkit_retrieve_changelog_response.ToolkitRetrieveChangelogResponse:
        """
        Retrieve the toolkit changelog (the last 10 versions per toolkit).

        :return: The changelog entries under ``.items``.

        Example:
            changelog = composio.toolkits.changelog()
            for entry in changelog.items:
                print(entry.slug, [v.version for v in entry.versions])
        """
        return self._client.toolkits.retrieve_changelog()

    def recommend_scopes(
        self,
        toolkit_slug: str,
        **params: te.Unpack[
            toolkit_recommend_scopes_params.ToolkitRecommendScopesParams
        ],
    ) -> toolkit_recommend_scopes_response.ToolkitRecommendScopesResponse:
        """
        Recommend the OAuth scopes to request so a connection can run the
        given tools. Experimental — the API marks this endpoint beta.

        :param toolkit_slug: The toolkit to recommend scopes for.
        :param tools: Tool slugs to cover; ``[]`` covers every tool in the toolkit.
        :param auth_scheme: Auth scheme the connection will use (API default ``OAUTH2``).
        :param toolkit_version: Toolkit version to compute from (API default: latest).
        :param grant_context: Dimension to selected value, e.g.
            ``{"account_type": "Google Workspace"}``. See :meth:`list_grant_contexts`.
        :param include: Scopes the recommendation must include.
        :param exclude: Scopes the recommendation must not include.
        :param available_scopes: Scopes your OAuth app can request; the
            recommendation never goes outside this list.
        :return: The ``least_privilege`` and ``fewest`` scope sets plus the
            ``conditional`` scopes, under ``.scopes``.

        Example:
            recommendation = composio.toolkits.recommend_scopes(
                "gmail",
                tools=["GMAIL_SEND_EMAIL", "GMAIL_FETCH_EMAILS"],
            )
            print(recommendation.scopes.least_privilege)
        """
        return self._client.toolkits.recommend_scopes(toolkit_slug, **params)

    def list_grant_contexts(
        self,
        toolkit_slug: str,
        **params: te.Unpack[
            toolkit_retrieve_scopes_grant_context_params.ToolkitRetrieveScopesGrantContextParams
        ],
    ) -> toolkit_retrieve_scopes_grant_context_response.ToolkitRetrieveScopesGrantContextResponse:
        """
        List the grant-context dimensions a toolkit's scope recommendation
        depends on, with their allowed values and the default the API
        assumes. Experimental — the API marks this endpoint beta.

        :param toolkit_slug: The toolkit to list grant contexts for.
        :param auth_scheme: Auth scheme the connection will use (API default ``OAUTH2``).
        :param toolkit_version: Toolkit version to read from (API default: latest).
        :return: ``grant_context_dimensions`` and ``default_grant_context``.

        Example:
            contexts = composio.toolkits.list_grant_contexts("gmail")
            for dimension in contexts.grant_context_dimensions:
                print(dimension.dimension, dimension.values)
        """
        return self._client.toolkits.retrieve_scopes_grant_context(
            toolkit_slug, **params
        )

    def list_categories(self):
        """List all categories of toolkits."""
        return self._client.toolkits.retrieve_categories().items

    def _get_auth_config_id(self, toolkit: str) -> str:
        """Get the auth config ID for a toolkit."""
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
        Authorize a user to a toolkit

        If auth config is not found, it will be created using composio managed auth.

        :param user_id: The ID of the user to authorize.
        :param toolkit: The slug of the toolkit to authorize.
        :return: The connection request.
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
