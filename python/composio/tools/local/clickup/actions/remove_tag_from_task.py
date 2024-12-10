import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class RemoveTagFromTaskRequest(BaseModel):
    """Request schema for `RemoveTagFromTask`"""

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


class RemoveTagFromTaskResponse(BaseModel):
    """Response schema for `RemoveTagFromTask`"""

    data: t.Dict[str, t.Any]


class RemoveTagFromTask(OpenAPIAction):
    """Remove a Tag from a task. This does not delete the Tag from the Space."""

    _tags = ["Tags"]
    _display_name = "remove_tag_from_task"
    _request_schema = RemoveTagFromTaskRequest
    _response_schema = RemoveTagFromTaskResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}/tag/{tag_name}"
    method = "delete"
    operation_id = "Tags_removeFromTask"
    action_identifier = "/task/{task_id}/tag/{tag_name}_delete"

    path_params = {"task_id": "task_id", "tag_name": "tag_name"}
    query_params = {"custom_task_ids": "custom_task_ids", "team_id": "team_id"}
    header_params = {}
    request_params = {}

    aliases = {}
