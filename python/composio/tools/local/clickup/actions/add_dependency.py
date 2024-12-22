import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class AddDependencyRequest(BaseModel):
    """Request schema for `AddDependency`"""

    task_id: str = Field(
        ...,
        alias="task_id",
        description="This is the task which is waiting on or blocking another task.",
    )
    custom_task_ids: t.Optional[bool] = Field(
        default=None,
        alias="custom_task_ids",
        description=(
            'If you want to reference a task by it"s custom task id, this value must '
            "be `true`. "
        ),
    )
    team_id: t.Optional[int] = Field(
        default=None,
        alias="team_id",
        description=(
            "Only used when the `custom_task_ids` parameter is set to `true`. For example: "
            "`custom_task_ids=true&team_id=123`. "
        ),
    )
    depends_on: t.Optional[str] = Field(
        default=None,
        alias="depends_on",
        description="Depends On",
    )
    depedency_of: t.Optional[str] = Field(
        default=None,
        alias="depedency_of",
        description="Dependency Of",
    )


class AddDependencyResponse(BaseModel):
    """Response schema for `AddDependency`"""

    data: t.Dict[str, t.Any]


class AddDependency(OpenAPIAction):
    """Set a task as waiting on or blocking another task."""

    _tags = ["Task Relationships"]
    _display_name = "add_dependency"
    _request_schema = AddDependencyRequest
    _response_schema = AddDependencyResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}/dependency"
    method = "post"
    operation_id = "TaskRelationships_addDependency"
    action_identifier = "/task/{task_id}/dependency_post"

    path_params = {"task_id": "task_id"}
    query_params = {"custom_task_ids": "custom_task_ids", "team_id": "team_id"}
    header_params = {}
    request_params = {
        "depends_on": {"__alias": "depends_on"},
        "depedency_of": {"__alias": "depedency_of"},
    }

    aliases = {}
