import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class DeleteTaskRequest(BaseModel):
    """Request schema for `DeleteTask`"""

    task_id: str = Field(
        ...,
        alias="task_id",
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


class DeleteTaskResponse(BaseModel):
    """Response schema for `DeleteTask`"""

    data: t.Dict[str, t.Any]


class DeleteTask(OpenAPIAction):
    """Delete a task from your Workspace."""

    _tags = ["Tasks"]
    _display_name = "delete_task"
    _request_schema = DeleteTaskRequest
    _response_schema = DeleteTaskResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}"
    method = "delete"
    operation_id = "Tasks_removeTaskById"
    action_identifier = "/task/{task_id}_delete"

    path_params = {"task_id": "task_id"}
    query_params = {"custom_task_ids": "custom_task_ids", "team_id": "team_id"}
    header_params = {}
    request_params = {}

    aliases = {}
