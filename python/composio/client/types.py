"""
This module is a light wrapper around the auto-generated composio client types.
"""

import typing as t

from composio_client import NotGiven
from composio_client.types import (
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
    connected_account_retrieve_response,
    connected_account_update_status_response,
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

Tool: t.TypeAlias = tool_list_response.Item
ToolkitMinimal: t.TypeAlias = tool_list_response.ItemToolkit
AuthConfig: t.TypeAlias = connected_account_create_params.AuthConfig

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
    "connected_account_retrieve_response",
    "connected_account_update_status_response",
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
    "AuthSchemeL",
)
