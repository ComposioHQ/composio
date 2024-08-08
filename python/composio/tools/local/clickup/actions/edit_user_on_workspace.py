import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class EditUserOnWorkspaceRequest(BaseModel):
    """Request schema for `EditUserOnWorkspace`"""

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
    username: str = Field(
        default=...,
        alias="username",
        description="Username",
    )
    admin: bool = Field(
        default=...,
        alias="admin",
        description="Admin",
    )
    custom_role_id: int = Field(
        default=...,
        alias="custom_role_id",
        description="Custom Role Id",
    )


class EditUserOnWorkspaceResponse(BaseModel):
    """Response schema for `EditUserOnWorkspace`"""

    data: t.Dict[str, t.Any]


class EditUserOnWorkspace(OpenAPIAction):
    """
    Update a user's name and role.    ***Note:** This endpoint is only available
    to Workspaces on our [Enterprise Plan](https://clickup.com/pricing).*
    """

    _tags = ["Users"]
    _display_name = "edit_user_on_workspace"
    _request_schema = EditUserOnWorkspaceRequest
    _response_schema = EditUserOnWorkspaceResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/user/{user_id}"
    method = "put"
    operation_id = "Users_updateUserDetails"
    action_identifier = "/team/{team_id}/user/{user_id}_put"

    path_params = {"team_id": "team_id", "user_id": "user_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "username": {"__alias": "username"},
        "admin": {"__alias": "admin"},
        "custom_role_id": {"__alias": "custom_role_id"},
    }

    aliases = {}
