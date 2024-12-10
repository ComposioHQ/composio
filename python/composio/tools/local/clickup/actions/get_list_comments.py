import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetListCommentsRequest(BaseModel):
    """Request schema for `GetListComments`"""

    list_id: int = Field(
        ...,
        alias="list_id",
        description="",
    )
    start: t.Optional[int] = Field(
        default=None,
        alias="start",
        description="Enter the `date` of a List info comment using Unix time in milliseconds.",
    )
    start_id: t.Optional[str] = Field(
        default=None,
        alias="start_id",
        description="Enter the Comment `id` of a List info comment.",
    )


class GetListCommentsResponse(BaseModel):
    """Response schema for `GetListComments`"""

    data: t.Dict[str, t.Any]


class GetListComments(OpenAPIAction):
    """
    To view comments on a List, omitting `start` and `start_id` shows the latest
    25 comments. For earlier ones, use the `start` and `start_id` of the oldest
    comment to get the next 25.
    """

    _tags = ["Comments"]
    _display_name = "get_list_comments"
    _request_schema = GetListCommentsRequest
    _response_schema = GetListCommentsResponse

    url = "https://api.clickup.com/api/v2"
    path = "/list/{list_id}/comment"
    method = "get"
    operation_id = "Comments_getListComments"
    action_identifier = "/list/{list_id}/comment_get"

    path_params = {"list_id": "list_id"}
    query_params = {"start": "start", "start_id": "start_id"}
    header_params = {}
    request_params = {}

    aliases = {}
