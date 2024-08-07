import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class DeleteGoalRequest(BaseModel):
    """Request schema for `DeleteGoal`"""

    goal_id: str = Field(
        ...,
        alias="goal_id",
        description="900e-462d-a849-4a216b06d930 (uuid)",
    )


class DeleteGoalResponse(BaseModel):
    """Response schema for `DeleteGoal`"""

    data: t.Dict[str, t.Any]


class DeleteGoal(OpenAPIAction):
    """Remove a Goal from your Workspace."""

    _tags = ["Goals"]
    _display_name = "delete_goal"
    _request_schema = DeleteGoalRequest
    _response_schema = DeleteGoalResponse

    url = "https://api.clickup.com/api/v2"
    path = "/goal/{goal_id}"
    method = "delete"
    operation_id = "Goals_removeGoal"
    action_identifier = "/goal/{goal_id}_delete"

    path_params = {"goal_id": "goal_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
