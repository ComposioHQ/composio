import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class UpdateListRequest(BaseModel):
    """Request schema for `UpdateList`"""

    list_id: str = Field(
        ...,
        alias="list_id",
        description="",
    )
    name: str = Field(
        default=...,
        alias="name",
        description="Name",
    )
    content: str = Field(
        default=...,
        alias="content",
        description="Content",
    )
    due_date: int = Field(
        default=...,
        alias="due_date",
        description="Due Date",
    )
    due_date_time: bool = Field(
        default=...,
        alias="due_date_time",
        description="Due Date Time",
    )
    priority: int = Field(
        default=...,
        alias="priority",
        description="Priority",
    )
    assignee: str = Field(
        default=...,
        alias="assignee",
        description="Assignee",
    )
    status: str = Field(
        default=...,
        alias="status",
        description=(
            "**Status** refers to the List color rather than the task Statuses available "
            "in the List. "
        ),
    )
    unset_status: bool = Field(
        default=...,
        alias="unset_status",
        description=(
            "By default, this is `false.` To remove the List color use `unset_status: "
            "true`. "
        ),
    )


class UpdateListResponse(BaseModel):
    """Response schema for `UpdateList`"""

    data: t.Dict[str, t.Any]


class UpdateList(OpenAPIAction):
    """
    Rename a List, update the List Info description, set a due date/time, set
    the List's priority, set an assignee, set or remove the List color.
    """

    _tags = ["Lists"]
    _display_name = "update_list"
    _request_schema = UpdateListRequest
    _response_schema = UpdateListResponse

    url = "https://api.clickup.com/api/v2"
    path = "/list/{list_id}"
    method = "put"
    operation_id = "Lists_updateListInfoDueDatePriorityAssigneeColor"
    action_identifier = "/list/{list_id}_put"

    path_params = {"list_id": "list_id"}
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
        "unset_status": {"__alias": "unset_status"},
    }

    aliases = {}
