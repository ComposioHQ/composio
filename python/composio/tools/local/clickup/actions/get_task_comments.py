import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetTaskCommentsRequest(BaseModel):
    """Request schema for `GetTaskComments`"""

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
    start: t.Optional[int] = Field(
        default=None,
        alias="start",
        description="Enter the `date` of a task comment using Unix time in milliseconds.",
    )
    start_id: t.Optional[str] = Field(
        default=None,
        alias="start_id",
        description="Enter the Comment `id` of a task comment.",
    )


class GetTaskCommentsResponse(BaseModel):
    """Response schema for `GetTaskComments`"""

    data: t.Dict[str, t.Any]


class GetTaskComments(OpenAPIAction):
    """
    View task comments.    If you do not include the `start` and `start_id`
    parameters, this endpoint will return the most recent 25 comments.   Use
    the `start` and `start id` parameters of the oldest comment to retrieve
    the next 25 comments.
    """

    _tags = ["Comments"]
    _display_name = "get_task_comments"
    _request_schema = GetTaskCommentsRequest
    _response_schema = GetTaskCommentsResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}/comment"
    method = "get"
    operation_id = "Comments_getTaskComments"
    action_identifier = "/task/{task_id}/comment_get"

    path_params = {"task_id": "task_id"}
    query_params = {
        "custom_task_ids": "custom_task_ids",
        "team_id": "team_id",
        "start": "start",
        "start_id": "start_id",
    }
    header_params = {}
    request_params = {}

    aliases = {}
