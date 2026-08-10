"""
This module is a light wrapper around the auto-generated composio client types.

It supports both generations of the generated client package:

- v1 (Stainless ``composio-client`` 1.x): re-exports the generated
  ``composio_client.types`` modules verbatim.
- v2 (self-managed ``composio_client`` 2.x): there is no
  ``composio_client.types`` package. Aliases with a runtime (non-typing) use —
  model construction, ``Mock(spec=...)``, subclassing — point at the
  equivalent pydantic models from ``composio_client._generated.pydantic_gen``;
  typing-only aliases resolve to ``t.Any`` through a namespace shim.
"""

import typing as t

from composio.client import compat

if t.TYPE_CHECKING or not compat.IS_V2:
    # Static type checkers always analyze this branch (the Stainless v1
    # surface); at runtime it is taken only when v1 is installed.
    from composio_client import NotGiven
    from composio_client._types import SequenceNotStr
    from composio_client.types import (
        TriggersTypeRetrieveResponse,
        auth_config_create_params,
        auth_config_create_response,
        auth_config_list_params,
        auth_config_list_response,
        auth_config_retrieve_response,
        auth_config_update_params,
        connected_account_create_params,
        connected_account_create_response,
        connected_account_list_params,
        connected_account_list_response,
        connected_account_patch_params,
        connected_account_patch_response,
        connected_account_retrieve_response,
        connected_account_update_status_response,
        link_create_params,
        tool_execute_params,
        tool_execute_response,
        tool_list_response,
        tool_proxy_params,
        tool_proxy_response,
        toolkit_list_params,
        toolkit_list_response,
        toolkit_retrieve_response,
        trigger_instance_upsert_response,
    )
    from composio_client.types.mcp import custom_create_response
    from composio_client.types.tool_router import (
        session_attach_params,
        session_attach_response,
        session_create_params,
        session_create_response,
        session_execute_params,
        session_execute_response,
        session_link_params,
        session_patch_params,
        session_proxy_execute_params,
        session_proxy_execute_response,
        session_retrieve_response,
        session_search_params,
        session_search_response,
    )
    from composio_client.types.tool_router.session import (
        file_create_download_url_response,
        file_delete_response,
        file_list_response,
    )

    Tool: t.TypeAlias = tool_list_response.Item
    ToolkitMinimal: t.TypeAlias = tool_list_response.ItemToolkit
    AuthConfig: t.TypeAlias = connected_account_create_params.AuthConfig
else:

    class _TypesNamespace:
        """Stand-in for a generated ``composio_client.types`` module.

        Known (runtime-used) attributes are set explicitly; any other
        attribute resolves to ``t.Any`` so typing-only accesses (e.g.
        ``t.cast`` targets) keep working.
        """

        def __init__(self, _name: str, **attrs: t.Any) -> None:
            self.__dict__["__shim_name__"] = _name
            self.__dict__.update(attrs)

        def __getattr__(self, name: str) -> t.Any:
            if name.startswith("__"):
                raise AttributeError(name)
            return t.Any

        def __repr__(self) -> str:
            return f"<composio.client.types shim {self.__dict__['__shim_name__']!r}>"

    from composio_client._generated import pydantic_gen as _g  # type: ignore[import-not-found]

    NotGiven = compat.OmitType
    SequenceNotStr = t.Sequence

    Tool = _g.Tool
    ToolkitMinimal = _g.ToolToolkit
    AuthConfig: t.Any = t.Any

    TriggersTypeRetrieveResponse = _g.GetV31TriggersTypesBySlugResponse

    # ---- request-param modules: typing-only under v2 ----
    auth_config_create_params = _TypesNamespace("auth_config_create_params")
    auth_config_list_params = _TypesNamespace("auth_config_list_params")
    auth_config_update_params = _TypesNamespace("auth_config_update_params")
    connected_account_create_params = _TypesNamespace("connected_account_create_params")
    connected_account_list_params = _TypesNamespace("connected_account_list_params")
    connected_account_patch_params = _TypesNamespace("connected_account_patch_params")
    link_create_params = _TypesNamespace("link_create_params")
    tool_execute_params = _TypesNamespace("tool_execute_params")
    tool_proxy_params = _TypesNamespace("tool_proxy_params")
    toolkit_list_params = _TypesNamespace("toolkit_list_params")
    session_create_params = _TypesNamespace("session_create_params")
    session_link_params = _TypesNamespace("session_link_params")
    session_patch_params = _TypesNamespace("session_patch_params")
    session_attach_params = _TypesNamespace("session_attach_params")
    session_execute_params = _TypesNamespace("session_execute_params")
    session_search_params = _TypesNamespace("session_search_params")
    # ``Parameter`` is a TypedDict under v1; a plain ``dict`` keeps the
    # ``Parameter(name=..., type=..., value=...)`` construction sites working.
    session_proxy_execute_params = _TypesNamespace(
        "session_proxy_execute_params", Parameter=dict
    )

    # ---- response modules: alias the runtime-used models ----
    auth_config_create_response = _TypesNamespace(
        "auth_config_create_response",
        AuthConfigCreateResponse=_g.PostV31AuthConfigsResponse,
        AuthConfig=_g.PostV31AuthConfigsAuthConfig,
    )
    auth_config_list_response = _TypesNamespace(
        "auth_config_list_response",
        AuthConfigListResponse=_g.GetV31AuthConfigsResponse,
    )
    auth_config_retrieve_response = _TypesNamespace(
        "auth_config_retrieve_response",
        AuthConfigRetrieveResponse=_g.GetV31AuthConfigsByNanoidResponse,
    )
    connected_account_create_response = _TypesNamespace(
        "connected_account_create_response",
        ConnectedAccountCreateResponse=_g.PostV31ConnectedAccountsResponse,
    )
    connected_account_list_response = _TypesNamespace(
        "connected_account_list_response",
        ConnectedAccountListResponse=_g.GetV31ConnectedAccountsResponse,
    )
    connected_account_patch_response = _TypesNamespace(
        "connected_account_patch_response",
        ConnectedAccountPatchResponse=_g.PatchV31ConnectedAccountsByNanoidResponse,
    )
    connected_account_retrieve_response = _TypesNamespace(
        "connected_account_retrieve_response",
        ConnectedAccountRetrieveResponse=_g.GetV31ConnectedAccountsByNanoidResponse,
    )
    connected_account_update_status_response = _TypesNamespace(
        "connected_account_update_status_response",
        ConnectedAccountUpdateStatusResponse=_g.PatchV31ConnectedAccountsByNanoIdStatusResponse,
    )
    tool_execute_response = _TypesNamespace(
        "tool_execute_response",
        ToolExecuteResponse=_g.PostV31ToolsExecuteByToolSlugResponse,
    )
    tool_list_response = _TypesNamespace(
        "tool_list_response",
        ToolListResponse=_g.ToolsPaginated,
        Item=_g.Tool,
        ItemToolkit=_g.ToolToolkit,
        ItemDeprecated=_g.ToolDeprecated,
        ItemDeprecatedToolkit=_g.ToolDeprecatedToolkit,
    )
    tool_proxy_response = _TypesNamespace(
        "tool_proxy_response",
        ToolProxyResponse=_g.PostV31ToolsExecuteProxyResponse,
    )
    toolkit_list_response = _TypesNamespace(
        "toolkit_list_response",
        ToolkitListResponse=_g.GetV31ToolkitsResponse,
    )
    toolkit_retrieve_response = _TypesNamespace(
        "toolkit_retrieve_response",
        ToolkitRetrieveResponse=_g.GetV31ToolkitsBySlugResponse,
    )
    trigger_instance_upsert_response = _TypesNamespace(
        "trigger_instance_upsert_response",
        TriggerInstanceUpsertResponse=_g.PostV31TriggerInstancesBySlugUpsertResponse,
    )

    # ---- tool_router session modules ----
    session_execute_response = _TypesNamespace(
        "session_execute_response",
        SessionExecuteResponse=_g.PostV31ToolRouterSessionBySessionIdExecuteResponse,
    )
    session_proxy_execute_response = _TypesNamespace(
        "session_proxy_execute_response",
        SessionProxyExecuteResponse=_g.PostV31ToolRouterSessionBySessionIdProxyExecuteResponse,
    )
    session_search_response = _TypesNamespace(
        "session_search_response",
        SessionSearchResponse=_g.PostV31ToolRouterSessionBySessionIdSearchResponse,
    )
    session_attach_response = _TypesNamespace(
        "session_attach_response",
        SessionAttachResponse=_g.PostV31ToolRouterSessionBySessionIdAttachResponse,
    )
    session_retrieve_response = _TypesNamespace(
        "session_retrieve_response",
        SessionRetrieveResponse=_g.GetV31ToolRouterSessionBySessionIdResponse,
    )
    session_create_response = _TypesNamespace(
        "session_create_response",
        SessionCreateResponse=_g.PostV31ToolRouterSessionResponse,
    )
    file_create_download_url_response = _TypesNamespace(
        "file_create_download_url_response",
        FileCreateDownloadURLResponse=_g.PostV31ToolRouterSessionBySessionIdMountsByMountIdDownloadUrlResponse,
    )
    file_delete_response = _TypesNamespace(
        "file_delete_response",
        FileDeleteResponse=_g.PostV31ToolRouterSessionBySessionIdMountsByMountIdDeleteResponse,
    )
    file_list_response = _TypesNamespace(
        "file_list_response",
        FileListResponse=_g.GetV31ToolRouterSessionBySessionIdMountsByMountIdItemsResponse,
    )

    # ---- mcp modules ----
    custom_create_response = _TypesNamespace(
        "custom_create_response",
        CustomCreateResponse=_g.PostV31McpServersCustomResponse,
    )

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

__all__ = (
    "auth_config_create_params",
    "auth_config_create_response",
    "auth_config_list_params",
    "auth_config_list_response",
    "auth_config_retrieve_response",
    "auth_config_update_params",
    "connected_account_create_params",
    "connected_account_create_response",
    "connected_account_list_params",
    "connected_account_list_response",
    "connected_account_patch_params",
    "connected_account_patch_response",
    "connected_account_retrieve_response",
    "connected_account_update_status_response",
    "custom_create_response",
    "file_create_download_url_response",
    "file_delete_response",
    "file_list_response",
    "link_create_params",
    "session_attach_params",
    "session_attach_response",
    "session_create_params",
    "session_create_response",
    "session_execute_params",
    "session_execute_response",
    "session_link_params",
    "session_patch_params",
    "session_proxy_execute_params",
    "session_proxy_execute_response",
    "session_retrieve_response",
    "session_search_params",
    "session_search_response",
    "trigger_instance_upsert_response",
    "tool_execute_params",
    "tool_execute_response",
    "tool_list_response",
    "tool_proxy_params",
    "tool_proxy_response",
    "toolkit_list_params",
    "toolkit_list_response",
    "toolkit_retrieve_response",
    "Tool",
    "ToolkitMinimal",
    "AuthConfig",
    "NotGiven",
    "SequenceNotStr",
    "TriggersTypeRetrieveResponse",
    "AuthSchemeL",
)
