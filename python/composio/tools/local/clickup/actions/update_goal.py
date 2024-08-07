import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class UpdateGoalRequest(BaseModel):
    """Request schema for `UpdateGoal`"""

    goal_id: str = Field(
        ...,
        alias="goal_id",
        description="900e-462d-a849-4a216b06d930 (uuid)",
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
    rem_owners: t.List[int] = Field(
        default=...,
        alias="rem_owners",
        description="Array of user IDs.",
    )
    add_owners: t.List[int] = Field(
        default=...,
        alias="add_owners",
        description="Array of user IDs.",
    )
    color: str = Field(
        default=...,
        alias="color",
        description="Color",
    )


class UpdateGoalResponse(BaseModel):
    """Response schema for `UpdateGoal`"""

    data: t.Dict[str, t.Any]


class UpdateGoal(OpenAPIAction):
    """
    Rename a Goal, set the due date, replace the description, add or remove
    owners, and set the Goal color.
    """

    _tags = ["Goals"]
    _display_name = "update_goal"
    _request_schema = UpdateGoalRequest
    _response_schema = UpdateGoalResponse

    url = "https://api.clickup.com/api/v2"
    path = "/goal/{goal_id}"
    method = "put"
    operation_id = "Goals_updateGoalDetails"
    action_identifier = "/goal/{goal_id}_put"

    path_params = {"goal_id": "goal_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "description": {"__alias": "description"},
        "name": {"__alias": "name"},
        "due_date": {"__alias": "due_date"},
        "rem_owners": {"__alias": "rem_owners"},
        "add_owners": {"__alias": "add_owners"},
        "color": {"__alias": "color"},
    }

    aliases = {}
