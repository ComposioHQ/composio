import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetListMembersRequest(BaseModel):
    """Request schema for `GetListMembers`"""

    list_id: int = Field(
        ...,
        alias="list_id",
        description="",
    )


class GetListMembersResponse(BaseModel):
    """Response schema for `GetListMembers`"""

    data: t.Dict[str, t.Any]


class GetListMembers(OpenAPIAction):
    """View the people who have access to a List."""

    _tags = ["Members"]
    _display_name = "get_list_members"
    _request_schema = GetListMembersRequest
    _response_schema = GetListMembersResponse

    url = "https://api.clickup.com/api/v2"
    path = "/list/{list_id}/member"
    method = "get"
    operation_id = "Members_getListUsers"
    action_identifier = "/list/{list_id}/member_get"

    path_params = {"list_id": "list_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}


class members_get_list_users(OpenAPIAction):
    """
    View the people who have access to a List.<<DEPRECATED use get_list_members>>
    """

    _tags = ["Members"]
    _display_name = "members_get_list_users"
    _request_schema = GetListMembersRequest
    _response_schema = GetListMembersResponse

    url = "https://api.clickup.com/api/v2"
    path = "/list/{list_id}/member"
    method = "get"
    operation_id = "Members_getListUsers"
    action_identifier = "/list/{list_id}/member_get"

    path_params = {"list_id": "list_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
