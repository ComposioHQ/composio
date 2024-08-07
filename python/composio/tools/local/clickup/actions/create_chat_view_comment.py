import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class CreateChatViewCommentRequest(BaseModel):
    """Request schema for `CreateChatViewComment`"""

    view_id: str = Field(
        ...,
        alias="view_id",
        description="105 (string)",
    )
    comment_text: str = Field(
        default=...,
        alias="comment_text",
        description="Comment Text",
    )
    notify_all: bool = Field(
        default=...,
        alias="notify_all",
        description=(
            "If `notify_all` is true, notifications will be sent to everyone including "
            "the creator of the comment. "
        ),
    )


class CreateChatViewCommentResponse(BaseModel):
    """Response schema for `CreateChatViewComment`"""

    data: t.Dict[str, t.Any]


class CreateChatViewComment(OpenAPIAction):
    """Add a new comment to a Chat view."""

    _tags = ["Comments"]
    _display_name = "create_chat_view_comment"
    _request_schema = CreateChatViewCommentRequest
    _response_schema = CreateChatViewCommentResponse

    url = "https://api.clickup.com/api/v2"
    path = "/view/{view_id}/comment"
    method = "post"
    operation_id = "Comments_createChatViewComment"
    action_identifier = "/view/{view_id}/comment_post"

    path_params = {"view_id": "view_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "comment_text": {"__alias": "comment_text"},
        "notify_all": {"__alias": "notify_all"},
    }

    aliases = {}
