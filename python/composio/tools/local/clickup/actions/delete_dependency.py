import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class DeleteDependencyRequest(BaseModel):
    """Request schema for `DeleteDependency`"""

    task_id: str = Field(
        ...,
        alias="task_id",
        description="",
    )
    depends_on: str = Field(
        ...,
        alias="depends_on",
        description="",
    )
    dependency_of: str = Field(
        ...,
        alias="dependency_of",
        description="",
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
            "Only used when the `custom_task_ids` parameter is set to `true`.   For example: "
            "`custom_task_ids=true&team_id=123`. "
        ),
    )


class DeleteDependencyResponse(BaseModel):
    """Response schema for `DeleteDependency`"""

    data: t.Dict[str, t.Any]


class DeleteDependency(OpenAPIAction):
    """Remove the dependency relationship between two or more tasks."""

    _tags = ["Task Relationships"]
    _display_name = "delete_dependency"
    _request_schema = DeleteDependencyRequest
    _response_schema = DeleteDependencyResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}/dependency"
    method = "delete"
    operation_id = "TaskRelationships_removeDependency"
    action_identifier = "/task/{task_id}/dependency_delete"

    path_params = {"task_id": "task_id"}
    query_params = {
        "depends_on": "depends_on",
        "dependency_of": "dependency_of",
        "custom_task_ids": "custom_task_ids",
        "team_id": "team_id",
    }
    header_params = {}
    request_params = {}

    aliases = {}
