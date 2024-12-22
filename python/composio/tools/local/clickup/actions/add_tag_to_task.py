import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class AddTagToTaskRequest(BaseModel):
    """Request schema for `AddTagToTask`"""

    task_id: str = Field(
        ...,
        alias="task_id",
        description="",
    )
    tag_name: str = Field(
        ...,
        alias="tag_name",
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


class AddTagToTaskResponse(BaseModel):
    """Response schema for `AddTagToTask`"""

    data: t.Dict[str, t.Any]


class AddTagToTask(OpenAPIAction):
    """Add a Tag to a task."""

    _tags = ["Tags"]
    _display_name = "add_tag_to_task"
    _request_schema = AddTagToTaskRequest
    _response_schema = AddTagToTaskResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}/tag/{tag_name}"
    method = "post"
    operation_id = "Tags_addToTask"
    action_identifier = "/task/{task_id}/tag/{tag_name}_post"

    path_params = {"task_id": "task_id", "tag_name": "tag_name"}
    query_params = {"custom_task_ids": "custom_task_ids", "team_id": "team_id"}
    header_params = {}
    request_params = {}

    aliases = {}
