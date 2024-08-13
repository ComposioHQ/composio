import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetAccessTokenRequest(BaseModel):
    """Request schema for `GetAccessToken`"""

    client_id: str = Field(
        ...,
        alias="client_id",
        description="Oauth app client id",
    )
    client_secret: str = Field(
        ...,
        alias="client_secret",
        description="Oauth app client secret",
    )
    code: str = Field(
        ...,
        alias="code",
        description="Code given in redirect url",
    )


class GetAccessTokenResponse(BaseModel):
    """Response schema for `GetAccessToken`"""

    data: t.Dict[str, t.Any]


class GetAccessToken(OpenAPIAction):
    """
    The text outlines API authentication via personal tokens and OAuth flow,
    stating OAuth tokens can't be used in "Try It" feature or tested via web
    browsers.
    """

    _tags = ["Authorization"]
    _display_name = "get_access_token"
    _request_schema = GetAccessTokenRequest
    _response_schema = GetAccessTokenResponse

    url = "https://api.clickup.com/api/v2"
    path = "/oauth/token"
    method = "post"
    operation_id = "Authorization_getAccessToken"
    action_identifier = "/oauth/token_post"

    path_params = {}
    query_params = {
        "client_id": "client_id",
        "client_secret": "client_secret",
        "code": "code",
    }
    header_params = {}
    request_params = {}

    aliases = {}


class authorization_get_access_token(OpenAPIAction):
    """
    The text outlines API authentication via personal tokens and OAuth flow,
    stating OAuth tokens can't be used in "Try It" feature or tested via web
    browsers.<<DEPRECATED use get_access_token>>
    """

    _tags = ["Authorization"]
    _display_name = "authorization_get_access_token"
    _request_schema = GetAccessTokenRequest
    _response_schema = GetAccessTokenResponse

    url = "https://api.clickup.com/api/v2"
    path = "/oauth/token"
    method = "post"
    operation_id = "Authorization_getAccessToken"
    action_identifier = "/oauth/token_post"

    path_params = {}
    query_params = {
        "client_id": "client_id",
        "client_secret": "client_secret",
        "code": "code",
    }
    header_params = {}
    request_params = {}

    aliases = {}
