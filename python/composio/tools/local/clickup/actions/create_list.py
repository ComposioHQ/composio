import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class CreateListRequest(BaseModel):
    """Request schema for `CreateList`"""

    folder_id: int = Field(
        ...,
        alias="folder_id",
        description="",
    )
    name: str = Field(
        default=...,
        alias="name",
        description="Name",
    )
    content: t.Optional[str] = Field(
        default=None,
        alias="content",
        description="Content",
    )
    due_date: t.Optional[int] = Field(
        default=None,
        alias="due_date",
        description="Due Date",
    )
    due_date_time: t.Optional[bool] = Field(
        default=None,
        alias="due_date_time",
        description="Due Date Time",
    )
    priority: t.Optional[int] = Field(
        default=None,
        alias="priority",
        description="Priority",
    )
    assignee: t.Optional[int] = Field(
        default=None,
        alias="assignee",
        description="Include a `user_id` to assign this List.",
    )
    status: t.Optional[str] = Field(
        default=None,
        alias="status",
        description=(
            "**Status** refers to the List color rather than the task Statuses available "
            "in the List. "
        ),
    )


class CreateListResponse(BaseModel):
    """Response schema for `CreateList`"""

    data: t.Dict[str, t.Any]


class CreateList(OpenAPIAction):
    """Add a new List to a Folder."""

    _tags = ["Lists"]
    _display_name = "create_list"
    _request_schema = CreateListRequest
    _response_schema = CreateListResponse

    url = "https://api.clickup.com/api/v2"
    path = "/folder/{folder_id}/list"
    method = "post"
    operation_id = "Lists_addToFolder"
    action_identifier = "/folder/{folder_id}/list_post"

    path_params = {"folder_id": "folder_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "name": {"__alias": "name"},
        "content": {"__alias": "content"},
        "due_date": {"__alias": "due_date"},
        "due_date_time": {"__alias": "due_date_time"},
        "priority": {"__alias": "priority"},
        "assignee": {"__alias": "assignee"},
        "status": {"__alias": "status"},
    }

    aliases = {}
