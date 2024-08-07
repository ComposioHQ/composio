import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class DeleteCommentRequest(BaseModel):
    """Request schema for `DeleteComment`"""

    comment_id: int = Field(
        ...,
        alias="comment_id",
        description="",
    )


class DeleteCommentResponse(BaseModel):
    """Response schema for `DeleteComment`"""

    data: t.Dict[str, t.Any]


class DeleteComment(OpenAPIAction):
    """Delete a task comment."""

    _tags = ["Comments"]
    _display_name = "delete_comment"
    _request_schema = DeleteCommentRequest
    _response_schema = DeleteCommentResponse

    url = "https://api.clickup.com/api/v2"
    path = "/comment/{comment_id}"
    method = "delete"
    operation_id = "Comments_deleteTaskComment"
    action_identifier = "/comment/{comment_id}_delete"

    path_params = {"comment_id": "comment_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
