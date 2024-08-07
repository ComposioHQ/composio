import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetUserRequest(BaseModel):
    """Request schema for `GetUser`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )
    user_id: int = Field(
        ...,
        alias="user_id",
        description="",
    )


class GetUserResponse(BaseModel):
    """Response schema for `GetUser`"""

    data: t.Dict[str, t.Any]


class GetUser(OpenAPIAction):
    """
    View information about a user in a Workspace.    ***Note:** This endpoint
    is only available to Workspaces on our [Enterprise Plan](https://clickup.com/pricing).*
    """

    _tags = ["Users"]
    _display_name = "get_user"
    _request_schema = GetUserRequest
    _response_schema = GetUserResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/user/{user_id}"
    method = "get"
    operation_id = "Users_getUserDetails"
    action_identifier = "/team/{team_id}/user/{user_id}_get"

    path_params = {"team_id": "team_id", "user_id": "user_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
