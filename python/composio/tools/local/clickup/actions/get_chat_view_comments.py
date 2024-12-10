import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetChatViewCommentsRequest(BaseModel):
    """Request schema for `GetChatViewComments`"""

    view_id: str = Field(
        ...,
        alias="view_id",
        description="105 (string)",
    )
    start: t.Optional[int] = Field(
        default=None,
        alias="start",
        description="Enter the `date` of a Chat view comment using Unix time in milliseconds.",
    )
    start_id: t.Optional[str] = Field(
        default=None,
        alias="start_id",
        description="Enter the Comment `id` of a Chat view comment.",
    )


class GetChatViewCommentsResponse(BaseModel):
    """Response schema for `GetChatViewComments`"""

    data: t.Dict[str, t.Any]


class GetChatViewComments(OpenAPIAction):
    """
    View comments from a Chat view.    If you do not include the `start` and
    `start_id` parameters, this endpoint will return the most recent 25 comments.
    Use the `start` and `start id` parameters of the oldest comment to retrieve
    the next 25 comments.
    """

    _tags = ["Comments"]
    _display_name = "get_chat_view_comments"
    _request_schema = GetChatViewCommentsRequest
    _response_schema = GetChatViewCommentsResponse

    url = "https://api.clickup.com/api/v2"
    path = "/view/{view_id}/comment"
    method = "get"
    operation_id = "Comments_getViewComments"
    action_identifier = "/view/{view_id}/comment_get"

    path_params = {"view_id": "view_id"}
    query_params = {"start": "start", "start_id": "start_id"}
    header_params = {}
    request_params = {}

    aliases = {}
