import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetTasksRequest(BaseModel):
    """Request schema for `GetTasks`"""

    list_id: int = Field(
        ...,
        alias="list_id",
        description=(
            "To find the list_id:<br> 1. In the Sidebar, hover over the List and click "
            "the **ellipsis ...** menu.<br> 2. Select **Copy link.**<br> 3. Use the copied "
            "URL to find the list_id. The list_id is the number that follows /li in the "
            "URL. "
        ),
    )
    archived: t.Optional[bool] = Field(
        default=None,
        alias="archived",
        description="",
    )
    include_markdown_description: t.Optional[bool] = Field(
        default=None,
        alias="include_markdown_description",
        description=(
            "To return task descriptions in Markdown format, use `?include_markdown_description=true`. "
        ),
    )
    page: t.Optional[int] = Field(
        default=None,
        alias="page",
        description="Page to fetch (starts at 0).",
    )
    order_by: t.Optional[str] = Field(
        default=None,
        alias="order_by",
        description=(
            "Order by a particular field. By default, tasks are ordered by `created`. "
            "  Options include: `id`, `created`, `updated`, and `due_date`. "
        ),
    )
    reverse: t.Optional[bool] = Field(
        default=None,
        alias="reverse",
        description="Tasks are displayed in reverse order.",
    )
    subtasks: t.Optional[bool] = Field(
        default=None,
        alias="subtasks",
        description="Include or exclude subtasks. By default, subtasks are excluded.",
    )
    statuses: t.Optional[t.List[str]] = Field(
        default=None,
        alias="statuses",
        description=(
            "Filter by statuses. To include closed tasks, use the `include_closed` parameter. "
            "   For example:    `?statuses[]=to%20do&statuses[]=in%20progress` "
        ),
    )
    include_closed: t.Optional[bool] = Field(
        default=None,
        alias="include_closed",
        description=(
            "Include or exclude closed tasks. By default, they are excluded.   To include "
            "closed tasks, use `include_closed: true`. "
        ),
    )
    assignees: t.Optional[t.List[str]] = Field(
        default=None,
        alias="assignees",
        description=(
            "Filter by Assignees. For example:    `?assignees[]=1234&assignees[]=5678` "
        ),
    )
    tags: t.Optional[t.List[str]] = Field(
        default=None,
        alias="tags",
        description="Filter by tags. For example:    `?tags[]=tag1&tags[]=this%20tag`",
    )
    due_date_gt: t.Optional[int] = Field(
        default=None,
        alias="due_date_gt",
        description="Filter by due date greater than Unix time in milliseconds.",
    )
    due_date_lt: t.Optional[int] = Field(
        default=None,
        alias="due_date_lt",
        description="Filter by due date less than Unix time in milliseconds.",
    )
    date_created_gt: t.Optional[int] = Field(
        default=None,
        alias="date_created_gt",
        description="Filter by date created greater than Unix time in milliseconds.",
    )
    date_created_lt: t.Optional[int] = Field(
        default=None,
        alias="date_created_lt",
        description="Filter by date created less than Unix time in milliseconds.",
    )
    date_updated_gt: t.Optional[int] = Field(
        default=None,
        alias="date_updated_gt",
        description="Filter by date updated greater than Unix time in milliseconds.",
    )
    date_updated_lt: t.Optional[int] = Field(
        default=None,
        alias="date_updated_lt",
        description="Filter by date updated less than Unix time in milliseconds.",
    )
    date_done_gt: t.Optional[int] = Field(
        default=None,
        alias="date_done_gt",
        description="Filter by date done greater than Unix time in milliseconds.",
    )
    date_done_lt: t.Optional[int] = Field(
        default=None,
        alias="date_done_lt",
        description="Filter by date done less than Unix time in milliseconds.",
    )
    custom_fields: t.Optional[t.List[str]] = Field(
        default=None,
        alias="custom_fields",
        description=(
            "Include tasks with specific values in multiple Custom Fields.   For example: "
            '`?custom_fields=[{"field_id":"abcdefghi12345678","operator":"=","value":"1234"},{"field_id":"jklmnop123456","operator":"<","value":"5"}]` '
            "  If you want to include tasks with specific values in only one Custom Field, "
            "use `custom_field` instead.   Learn more about [filtering using Custom Fields.](https://clickup.com/api) "
        ),
    )
    custom_items: t.Optional[t.List[int]] = Field(
        default=None,
        alias="custom_items",
        description=(
            "Filter by custom task types. For example:    `?custom_items[]=0&custom_items[]=1300` "
            "   Including `0` returns tasks. Including `1` returns Milestones. Including "
            "any other number returns the custom task type as defined in your Workspace. "
        ),
    )


class GetTasksResponse(BaseModel):
    """Response schema for `GetTasks`"""

    data: t.Dict[str, t.Any]


class GetTasks(OpenAPIAction):
    """
    This API endpoint allows viewing up to 100 tasks per page, limited to tasks
    within the specified `list_id` that have it as their home List. Tasks from
    other home Lists aren't included.
    """

    _tags = ["Tasks"]
    _display_name = "get_tasks"
    _request_schema = GetTasksRequest
    _response_schema = GetTasksResponse

    url = "https://api.clickup.com/api/v2"
    path = "/list/{list_id}/task"
    method = "get"
    operation_id = "Tasks_getListTasks"
    action_identifier = "/list/{list_id}/task_get"

    path_params = {"list_id": "list_id"}
    query_params = {
        "archived": "archived",
        "include_markdown_description": "include_markdown_description",
        "page": "page",
        "order_by": "order_by",
        "reverse": "reverse",
        "subtasks": "subtasks",
        "statuses": "statuses",
        "include_closed": "include_closed",
        "assignees": "assignees",
        "tags": "tags",
        "due_date_gt": "due_date_gt",
        "due_date_lt": "due_date_lt",
        "date_created_gt": "date_created_gt",
        "date_created_lt": "date_created_lt",
        "date_updated_gt": "date_updated_gt",
        "date_updated_lt": "date_updated_lt",
        "date_done_gt": "date_done_gt",
        "date_done_lt": "date_done_lt",
        "custom_fields": "custom_fields",
        "custom_items": "custom_items",
    }
    header_params = {}
    request_params = {}

    aliases = {}


class tasks_get_list_tasks(OpenAPIAction):
    """
    This API endpoint allows viewing up to 100 tasks per page, limited to tasks
    within the specified `list_id` that have it as their home List. Tasks from
    other home Lists aren't included.<<DEPRECATED use get_tasks>>
    """

    _tags = ["Tasks"]
    _display_name = "tasks_get_list_tasks"
    _request_schema = GetTasksRequest
    _response_schema = GetTasksResponse

    url = "https://api.clickup.com/api/v2"
    path = "/list/{list_id}/task"
    method = "get"
    operation_id = "Tasks_getListTasks"
    action_identifier = "/list/{list_id}/task_get"

    path_params = {"list_id": "list_id"}
    query_params = {
        "archived": "archived",
        "include_markdown_description": "include_markdown_description",
        "page": "page",
        "order_by": "order_by",
        "reverse": "reverse",
        "subtasks": "subtasks",
        "statuses": "statuses",
        "include_closed": "include_closed",
        "assignees": "assignees",
        "tags": "tags",
        "due_date_gt": "due_date_gt",
        "due_date_lt": "due_date_lt",
        "date_created_gt": "date_created_gt",
        "date_created_lt": "date_created_lt",
        "date_updated_gt": "date_updated_gt",
        "date_updated_lt": "date_updated_lt",
        "date_done_gt": "date_done_gt",
        "date_done_lt": "date_done_lt",
        "custom_fields": "custom_fields",
        "custom_items": "custom_items",
    }
    header_params = {}
    request_params = {}

    aliases = {}
