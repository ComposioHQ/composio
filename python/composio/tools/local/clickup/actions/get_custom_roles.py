import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetCustomRolesRequest(BaseModel):
    """Request schema for `GetCustomRoles`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="",
    )
    include_members: t.Optional[bool] = Field(
        default=None,
        alias="include_members",
        description="",
    )


class GetCustomRolesResponse(BaseModel):
    """Response schema for `GetCustomRoles`"""

    data: t.Dict[str, t.Any]


class GetCustomRoles(OpenAPIAction):
    """View the Custom Roles available in a Workspace."""

    _tags = ["Roles"]
    _display_name = "get_custom_roles"
    _request_schema = GetCustomRolesRequest
    _response_schema = GetCustomRolesResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/customroles"
    method = "get"
    operation_id = "Roles_listAvailableCustomRoles"
    action_identifier = "/team/{team_id}/customroles_get"

    path_params = {"team_id": "team_id"}
    query_params = {"include_members": "include_members"}
    header_params = {}
    request_params = {}

    aliases = {}
