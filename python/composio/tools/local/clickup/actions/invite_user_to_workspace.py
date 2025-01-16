import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class InviteUserToWorkspaceRequest(BaseModel):
    """Request schema for `InviteUserToWorkspace`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )
    email: str = Field(
        default=...,
        alias="email",
        description="Email",
    )
    admin: bool = Field(
        default=...,
        alias="admin",
        description="Admin",
    )
    custom_role_id: t.Optional[int] = Field(
        default=None,
        alias="custom_role_id",
        description="Custom Role Id",
    )


class InviteUserToWorkspaceResponse(BaseModel):
    """Response schema for `InviteUserToWorkspace`"""

    data: t.Dict[str, t.Any]


class InviteUserToWorkspace(OpenAPIAction):
    """
    Invite someone to your Workspace as a member through a specific endpoint.
    Note: Guest invitations and this feature are exclusive to Workspaces on
    the Enterprise Plan.
    """

    _tags = ["Users"]
    _display_name = "invite_user_to_workspace"
    _request_schema = InviteUserToWorkspaceRequest
    _response_schema = InviteUserToWorkspaceResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/user"
    method = "post"
    operation_id = "Users_inviteUserToWorkspace"
    action_identifier = "/team/{team_id}/user_post"

    path_params = {"team_id": "team_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "email": {"__alias": "email"},
        "admin": {"__alias": "admin"},
        "custom_role_id": {"__alias": "custom_role_id"},
    }

    aliases = {}
