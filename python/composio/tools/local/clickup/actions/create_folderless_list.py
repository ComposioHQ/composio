import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class CreateFolderlessListRequest(BaseModel):
    """Request schema for `CreateFolderlessList`"""

    space_id: int = Field(
        ...,
        alias="space_id",
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
        description="Include a `user_id` to add a List owner.",
    )
    status: t.Optional[str] = Field(
        default=None,
        alias="status",
        description=(
            "**Status** refers to the List color rather than the task Statuses available "
            "in the List. "
        ),
    )


class CreateFolderlessListResponse(BaseModel):
    """Response schema for `CreateFolderlessList`"""

    data: t.Dict[str, t.Any]


class CreateFolderlessList(OpenAPIAction):
    """Add a new List in a Space."""

    _tags = ["Lists"]
    _display_name = "create_folderless_list"
    _request_schema = CreateFolderlessListRequest
    _response_schema = CreateFolderlessListResponse

    url = "https://api.clickup.com/api/v2"
    path = "/space/{space_id}/list"
    method = "post"
    operation_id = "Lists_createFolderlessList"
    action_identifier = "/space/{space_id}/list_post"

    path_params = {"space_id": "space_id"}
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
