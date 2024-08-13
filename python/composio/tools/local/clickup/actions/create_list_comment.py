import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class CreateListCommentRequest(BaseModel):
    """Request schema for `CreateListComment`"""

    list_id: int = Field(
        ...,
        alias="list_id",
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
    notify_all: bool = Field(
        default=...,
        alias="notify_all",
        description=(
            "If `notify_all` is true, notifications will be sent to everyone including "
            "the creator of the comment. "
        ),
    )


class CreateListCommentResponse(BaseModel):
    """Response schema for `CreateListComment`"""

    data: t.Dict[str, t.Any]


class CreateListComment(OpenAPIAction):
    """Add a comment to a List."""

    _tags = ["Comments"]
    _display_name = "create_list_comment"
    _request_schema = CreateListCommentRequest
    _response_schema = CreateListCommentResponse

    url = "https://api.clickup.com/api/v2"
    path = "/list/{list_id}/comment"
    method = "post"
    operation_id = "Comments_addToListComment"
    action_identifier = "/list/{list_id}/comment_post"

    path_params = {"list_id": "list_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "comment_text": {"__alias": "comment_text"},
        "assignee": {"__alias": "assignee"},
        "notify_all": {"__alias": "notify_all"},
    }

    aliases = {}
