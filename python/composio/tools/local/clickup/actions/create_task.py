import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class CreateTaskRequest(BaseModel):
    """Request schema for `CreateTask`"""

    list_id: int = Field(
        ...,
        alias="list_id",
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
    tags: t.Optional[t.List[str]] = Field(
        default=None,
        alias="tags",
        description="",
    )
    description: t.Optional[str] = Field(
        default=None,
        alias="description",
        description="Description",
    )
    name: str = Field(
        default=...,
        alias="name",
        description="Name",
    )
    assignees: t.Optional[t.List[int]] = Field(
        default=None,
        alias="assignees",
        description="",
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
    notify_all: t.Optional[bool] = Field(
        default=None,
        alias="notify_all",
        description=(
            "If `notify_all` is true, notifications will be sent to everyone including "
            "the creator of the comment. "
        ),
    )
    parent: t.Optional[str] = Field(
        default=None,
        alias="parent",
        description=(
            "You can create a subtask by including an existing task ID.   The `parent` "
            "task ID you include cannot be a subtask, and must be in the same List specified "
            "in the path parameter. "
        ),
    )
    links_to: t.Optional[str] = Field(
        default=None,
        alias="links_to",
        description="Include a task ID to create a linked dependency with your new task.",
    )
    check_required_custom_fields: t.Optional[bool] = Field(
        default=None,
        alias="check_required_custom_fields",
        description=(
            "When creating a task via API any required Custom Fields are ignored by default "
            "(`false`).   You can enforce required Custom Fields by including `check_required_custom_fields: "
            "true`. "
        ),
    )
    custom_fields: t.Optional[t.List[dict]] = Field(
        default=None,
        alias="custom_fields",
        description="[Filter by Custom Fields.](https://clickup.com/api)",
    )
    custom_item_id: t.Optional[int] = Field(
        default=None,
        alias="custom_item_id",
        description=(
            'To create a task that doesn"t use a custom task type, either don"t include '
            'this field in the request body, or send `"null"`.    To create this task '
            "as a Milestone, send a value of `1`.   To use a custom task type, send the "
            "custom task type ID as defined in your Workspace, such as `2`. "
        ),
    )


class CreateTaskResponse(BaseModel):
    """Response schema for `CreateTask`"""

    data: t.Dict[str, t.Any]


class CreateTask(OpenAPIAction):
    """Create a new task."""

    _tags = ["Tasks"]
    _display_name = "create_task"
    _request_schema = CreateTaskRequest
    _response_schema = CreateTaskResponse

    url = "https://api.clickup.com/api/v2"
    path = "/list/{list_id}/task"
    method = "post"
    operation_id = "Tasks_createNewTask"
    action_identifier = "/list/{list_id}/task_post"

    path_params = {"list_id": "list_id"}
    query_params = {"custom_task_ids": "custom_task_ids", "team_id": "team_id"}
    header_params = {}
    request_params = {
        "tags": {"__alias": "tags"},
        "description": {"__alias": "description"},
        "name": {"__alias": "name"},
        "assignees": {"__alias": "assignees"},
        "status": {"__alias": "status"},
        "priority": {"__alias": "priority"},
        "due_date": {"__alias": "due_date"},
        "due_date_time": {"__alias": "due_date_time"},
        "time_estimate": {"__alias": "time_estimate"},
        "start_date": {"__alias": "start_date"},
        "start_date_time": {"__alias": "start_date_time"},
        "notify_all": {"__alias": "notify_all"},
        "parent": {"__alias": "parent"},
        "links_to": {"__alias": "links_to"},
        "check_required_custom_fields": {"__alias": "check_required_custom_fields"},
        "custom_fields": {"__alias": "custom_fields"},
        "custom_item_id": {"__alias": "custom_item_id"},
    }

    aliases = {}
