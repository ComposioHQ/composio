import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetGoalRequest(BaseModel):
    """Request schema for `GetGoal`"""

    goal_id: str = Field(
        ...,
        alias="goal_id",
        description="900e-462d-a849-4a216b06d930 (uuid)",
    )


class GetGoalResponse(BaseModel):
    """Response schema for `GetGoal`"""

    data: t.Dict[str, t.Any]


class GetGoal(OpenAPIAction):
    """View the details of a Goal including its Targets."""

    _tags = ["Goals"]
    _display_name = "get_goal"
    _request_schema = GetGoalRequest
    _response_schema = GetGoalResponse

    url = "https://api.clickup.com/api/v2"
    path = "/goal/{goal_id}"
    method = "get"
    operation_id = "Goals_getDetails"
    action_identifier = "/goal/{goal_id}_get"

    path_params = {"goal_id": "goal_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
