import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class UpdateCommentRequest(BaseModel):
    """Request schema for `UpdateComment`"""

    comment_id: int = Field(
        ...,
        alias="comment_id",
        description="",
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
    resolved: bool = Field(
        default=...,
        alias="resolved",
        description="",
    )


class UpdateCommentResponse(BaseModel):
    """Response schema for `UpdateComment`"""

    data: t.Dict[str, t.Any]


class UpdateComment(OpenAPIAction):
    """
    Replace the content of a task comment, assign a comment, and mark a comment
    as resolved.
    """

    _tags = ["Comments"]
    _display_name = "update_comment"
    _request_schema = UpdateCommentRequest
    _response_schema = UpdateCommentResponse

    url = "https://api.clickup.com/api/v2"
    path = "/comment/{comment_id}"
    method = "put"
    operation_id = "Comments_updateTaskComment"
    action_identifier = "/comment/{comment_id}_put"

    path_params = {"comment_id": "comment_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "comment_text": {"__alias": "comment_text"},
        "assignee": {"__alias": "assignee"},
        "resolved": {"__alias": "resolved"},
    }

    aliases = {}
