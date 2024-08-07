import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class CreateKeyResultRequest(BaseModel):
    """Request schema for `CreateKeyResult`"""

    goal_id: str = Field(
        ...,
        alias="goal_id",
        description="900e-462d-a849-4a216b06d930 (uuid)",
    )
    name: str = Field(
        default=...,
        alias="name",
        description="Name",
    )
    owners: t.List[int] = Field(
        default=...,
        alias="owners",
        description="",
    )
    type: str = Field(
        default=...,
        alias="type",
        description=(
            "Target (key result) types include: `number`, `currency`, `boolean`, `percentage`, "
            "or `automatic`. "
        ),
    )
    steps_start: int = Field(
        default=...,
        alias="steps_start",
        description="Steps Start",
    )
    steps_end: int = Field(
        default=...,
        alias="steps_end",
        description="Steps End",
    )
    unit: str = Field(
        default=...,
        alias="unit",
        description="Unit",
    )
    task_ids: t.List[str] = Field(
        default=...,
        alias="task_ids",
        description="Enter an array of task IDs to link this target with one or more tasks.",
    )
    list_ids: t.List[str] = Field(
        default=...,
        alias="list_ids",
        description="Enter an array of List IDs to link this target with one or more Lists.",
    )


class CreateKeyResultResponse(BaseModel):
    """Response schema for `CreateKeyResult`"""

    data: t.Dict[str, t.Any]


class CreateKeyResult(OpenAPIAction):
    """Add a Target to a Goal."""

    _tags = ["Goals"]
    _display_name = "create_key_result"
    _request_schema = CreateKeyResultRequest
    _response_schema = CreateKeyResultResponse

    url = "https://api.clickup.com/api/v2"
    path = "/goal/{goal_id}/key_result"
    method = "post"
    operation_id = "Goals_addKeyResult"
    action_identifier = "/goal/{goal_id}/key_result_post"

    path_params = {"goal_id": "goal_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "name": {"__alias": "name"},
        "owners": {"__alias": "owners"},
        "type": {"__alias": "type"},
        "steps_start": {"__alias": "steps_start"},
        "steps_end": {"__alias": "steps_end"},
        "unit": {"__alias": "unit"},
        "task_ids": {"__alias": "task_ids"},
        "list_ids": {"__alias": "list_ids"},
    }

    aliases = {}
