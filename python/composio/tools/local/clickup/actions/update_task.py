import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class UpdateTaskRequest(BaseModel):
    """Request schema for `UpdateTask`"""

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
    description: t.Optional[str] = Field(
        default=None,
        alias="description",
        description='To clear the task description, include `Description` with `" "`.',
    )
    custom_item_id: t.Optional[int] = Field(
        default=None,
        alias="custom_item_id",
        description=(
            'To convert an item using a custom task type into a task, send `"null"`. '
            "   To update this task to be a Milestone, send a value of `1`.    To use "
            "a custom task type, send the custom task type ID as defined in your Workspace, "
            "such as `2`. "
        ),
    )
    name: t.Optional[str] = Field(
        default=None,
        alias="name",
        description="Name",
    )
    status: t.Optional[str] = Field(
        default=None,
        alias="status",
        description="Status",
    )
    priority: t.Optional[int] = Field(
        default=None,
        alias="priority",
        description="Priority",
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
    parent: t.Optional[str] = Field(
        default=None,
        alias="parent",
        description=(
            'You can move a subtask to another parent task by including `"parent"` with '
            'a valid `task id`.   You cannot convert a subtask to a task by setting `"parent"` '
            "to `null`. "
        ),
    )
    time_estimate: t.Optional[int] = Field(
        default=None,
        alias="time_estimate",
        description="Time Estimate",
    )
    start_date: t.Optional[int] = Field(
        default=None,
        alias="start_date",
        description="Start Date",
    )
    start_date_time: t.Optional[bool] = Field(
        default=None,
        alias="start_date_time",
        description="Start Date Time",
    )
    assignees_add: t.List[int] = Field(
        default=...,
        alias="assignees__add",
        description="",
    )
    assignees_rem: t.List[int] = Field(
        default=...,
        alias="assignees__rem",
        description="",
    )
    archived: t.Optional[bool] = Field(
        default=None,
        alias="archived",
        description="Archived",
    )


class UpdateTaskResponse(BaseModel):
    """Response schema for `UpdateTask`"""

    data: t.Dict[str, t.Any]


class UpdateTask(OpenAPIAction):
    """Update a task by including one or more fields in the request body."""

    _tags = ["Tasks"]
    _display_name = "update_task"
    _request_schema = UpdateTaskRequest
    _response_schema = UpdateTaskResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}"
    method = "put"
    operation_id = "Tasks_updateTaskFields"
    action_identifier = "/task/{task_id}_put"

    path_params = {"task_id": "task_id"}
    query_params = {"custom_task_ids": "custom_task_ids", "team_id": "team_id"}
    header_params = {}
    request_params = {
        "description": {"__alias": "description"},
        "custom_item_id": {"__alias": "custom_item_id"},
        "name": {"__alias": "name"},
        "status": {"__alias": "status"},
        "priority": {"__alias": "priority"},
        "due_date": {"__alias": "due_date"},
        "due_date_time": {"__alias": "due_date_time"},
        "parent": {"__alias": "parent"},
        "time_estimate": {"__alias": "time_estimate"},
        "start_date": {"__alias": "start_date"},
        "start_date_time": {"__alias": "start_date_time"},
        "assignees": {
            "__alias": "assignees",
            "add": {"__alias": "add"},
            "rem": {"__alias": "rem"},
        },
        "archived": {"__alias": "archived"},
    }

    aliases = {"assignees": "24afd83d"}
