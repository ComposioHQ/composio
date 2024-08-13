import typing as t

from pydantic import BaseModel

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetAuthorizedUserRequest(BaseModel):
    """Request schema for `GetAuthorizedUser`"""


class GetAuthorizedUserResponse(BaseModel):
    """Response schema for `GetAuthorizedUser`"""

    data: t.Dict[str, t.Any]


class GetAuthorizedUser(OpenAPIAction):
    """View the details of the authenticated user's ClickUp account."""

    _tags = ["Authorization"]
    _display_name = "get_authorized_user"
    _request_schema = GetAuthorizedUserRequest
    _response_schema = GetAuthorizedUserResponse

    url = "https://api.clickup.com/api/v2"
    path = "/user"
    method = "get"
    operation_id = "Authorization_viewAccountDetails"
    action_identifier = "/user_get"

    path_params = {}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}


class authorization_view_account_details(OpenAPIAction):
    """
    View the details of the authenticated user's ClickUp account.<<DEPRECATED
    use get_authorized_user>>
    """

    _tags = ["Authorization"]
    _display_name = "authorization_view_account_details"
    _request_schema = GetAuthorizedUserRequest
    _response_schema = GetAuthorizedUserResponse

    url = "https://api.clickup.com/api/v2"
    path = "/user"
    method = "get"
    operation_id = "Authorization_viewAccountDetails"
    action_identifier = "/user_get"

    path_params = {}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
