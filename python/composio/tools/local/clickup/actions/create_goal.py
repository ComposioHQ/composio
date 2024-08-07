import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class CreateGoalRequest(BaseModel):
    """Request schema for `CreateGoal`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )
    description: str = Field(
        default=...,
        alias="description",
        description="Description",
    )
    name: str = Field(
        default=...,
        alias="name",
        description="Name",
    )
    due_date: int = Field(
        default=...,
        alias="due_date",
        description="Due Date",
    )
    multiple_owners: bool = Field(
        default=...,
        alias="multiple_owners",
        description="Multiple Owners",
    )
    owners: t.List[int] = Field(
        default=...,
        alias="owners",
        description="Array of user IDs.",
    )
    color: str = Field(
        default=...,
        alias="color",
        description="Color",
    )


class CreateGoalResponse(BaseModel):
    """Response schema for `CreateGoal`"""

    data: t.Dict[str, t.Any]


class CreateGoal(OpenAPIAction):
    """Add a new Goal to a Workspace."""

    _tags = ["Goals"]
    _display_name = "create_goal"
    _request_schema = CreateGoalRequest
    _response_schema = CreateGoalResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/goal"
    method = "post"
    operation_id = "Goals_addNewGoalToWorkspace"
    action_identifier = "/team/{team_id}/goal_post"

    path_params = {"team_id": "team_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "description": {"__alias": "description"},
        "name": {"__alias": "name"},
        "due_date": {"__alias": "due_date"},
        "multiple_owners": {"__alias": "multiple_owners"},
        "owners": {"__alias": "owners"},
        "color": {"__alias": "color"},
    }

    aliases = {}
