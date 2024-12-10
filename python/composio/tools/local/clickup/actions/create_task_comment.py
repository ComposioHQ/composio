import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class CreateTaskCommentRequest(BaseModel):
    """Request schema for `CreateTaskComment`"""

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
    comment_text: str = Field(
        default=...,
        alias="comment_text",
        description="Comment Text",
    )
    assignee: int = Field(
        default=...,
        alias="assignee",
        description="Assignee",
    )
    notify_all: bool = Field(
        default=...,
        alias="notify_all",
        description=(
            "If `notify_all` is true, notifications will be sent to everyone including "
            "the creator of the comment. "
        ),
    )


class CreateTaskCommentResponse(BaseModel):
    """Response schema for `CreateTaskComment`"""

    data: t.Dict[str, t.Any]


class CreateTaskComment(OpenAPIAction):
    """Add a new comment to a task."""

    _tags = ["Comments"]
    _display_name = "create_task_comment"
    _request_schema = CreateTaskCommentRequest
    _response_schema = CreateTaskCommentResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}/comment"
    method = "post"
    operation_id = "Comments_createNewTaskComment"
    action_identifier = "/task/{task_id}/comment_post"

    path_params = {"task_id": "task_id"}
    query_params = {"custom_task_ids": "custom_task_ids", "team_id": "team_id"}
    header_params = {}
    request_params = {
        "comment_text": {"__alias": "comment_text"},
        "assignee": {"__alias": "assignee"},
        "notify_all": {"__alias": "notify_all"},
    }

    aliases = {}
