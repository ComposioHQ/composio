import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetWorkspacePlanRequest(BaseModel):
    """Request schema for `GetWorkspacePlan`"""

    team_id: str = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )


class GetWorkspacePlanResponse(BaseModel):
    """Response schema for `GetWorkspacePlan`"""

    data: t.Dict[str, t.Any]


class GetWorkspacePlan(OpenAPIAction):
    """
    View the current [Plan](https://clickup.com/pricing) for the specified Workspace.
    """

    _tags = ["Teams - Workspaces"]
    _display_name = "get_workspace_plan"
    _request_schema = GetWorkspacePlanRequest
    _response_schema = GetWorkspacePlanResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/plan"
    method = "get"
    operation_id = "TeamsWorkspaces_getWorkspacePlan"
    action_identifier = "/team/{team_id}/plan_get"

    path_params = {"team_id": "team_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}


class teams_work_spaces_get_work_space_plan(OpenAPIAction):
    """
    View the current [Plan](https://clickup.com/pricing) for the specified Workspace.<<DEPRECATED
    use get_workspace_plan>>
    """

    _tags = ["Teams - Workspaces"]
    _display_name = "teams_work_spaces_get_work_space_plan"
    _request_schema = GetWorkspacePlanRequest
    _response_schema = GetWorkspacePlanResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/plan"
    method = "get"
    operation_id = "TeamsWorkspaces_getWorkspacePlan"
    action_identifier = "/team/{team_id}/plan_get"

    path_params = {"team_id": "team_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
