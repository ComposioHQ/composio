import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class RemoveUserFromWorkspaceRequest(BaseModel):
    """Request schema for `RemoveUserFromWorkspace`"""

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


class RemoveUserFromWorkspaceResponse(BaseModel):
    """Response schema for `RemoveUserFromWorkspace`"""

    data: t.Dict[str, t.Any]


class RemoveUserFromWorkspace(OpenAPIAction):
    """
    Deactivate a user from a Workspace.    ***Note:** This endpoint is only
    available to Workspaces on our [Enterprise Plan](https://clickup.com/pricing).*
    """

    _tags = ["Users"]
    _display_name = "remove_user_from_workspace"
    _request_schema = RemoveUserFromWorkspaceRequest
    _response_schema = RemoveUserFromWorkspaceResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/user/{user_id}"
    method = "delete"
    operation_id = "Users_deactivateFromWorkspace"
    action_identifier = "/team/{team_id}/user/{user_id}_delete"

    path_params = {"team_id": "team_id", "user_id": "user_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
