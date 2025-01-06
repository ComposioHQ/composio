import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetFilteredTeamTasksRequest(BaseModel):
    """Request schema for `GetFilteredTeamTasks`"""

    team_Id: int = Field(
        ...,
        alias="team_Id",
        description="Team ID (Workspace)",
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
    space_ids: t.Optional[t.List[str]] = Field(
        default=None,
        alias="space_ids",
        description="Filter by Spaces. For example:    `?space_ids[]=1234&space_ids[]=6789`",
    )
    project_ids: t.Optional[t.List[str]] = Field(
        default=None,
        alias="project_ids",
        description=(
            "Filter by Folders. For example:    `?project_ids[]=1234&project_ids[]=6789` "
        ),
    )
    list_ids: t.Optional[t.List[str]] = Field(
        default=None,
        alias="list_ids",
        description="Filter by Lists. For example:    `?list_ids[]=1234&list_ids[]=6789`",
    )
    statuses: t.Optional[t.List[str]] = Field(
        default=None,
        alias="statuses",
        description=(
            "Filter by statuses. Use `%20` to represent a space character. To include "
            "closed tasks, use the `include_closed` parameter.    For example:    `?statuses[]=to%20do&statuses[]=in%20progress` "
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
            'Filter by Assignees using people"s ClickUp user id. For example:    `?assignees[]=1234&assignees[]=5678` '
        ),
    )
    tags: t.Optional[t.List[str]] = Field(
        default=None,
        alias="tags",
        description=(
            "Filter by tags. User `%20` to represent a space character. For example: "
            "   `?tags[]=tag1&tags[]=this%20tag` "
        ),
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
            "Include tasks with specific values in one or more Custom Fields.   For example: "
            '`?custom_fields=[{"field_id":"abcdefghi12345678","operator":"=","value":"1234"}{"field_id":"jklmnop123456","operator":"<","value":"5"}]` '
            "  Learn more about [filtering using Custom Fields.](https://clickup.com/api) "
        ),
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
    parent: t.Optional[str] = Field(
        default=None,
        alias="parent",
        description="Include the parent task ID to return subtasks.",
    )
    include_markdown_description: t.Optional[bool] = Field(
        default=None,
        alias="include_markdown_description",
        description=(
            "To return task descriptions in Markdown format, use `?include_markdown_description=true`. "
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


class GetFilteredTeamTasksResponse(BaseModel):
    """Response schema for `GetFilteredTeamTasks`"""

    data: t.Dict[str, t.Any]


class GetFilteredTeamTasks(OpenAPIAction):
    """
    View the tasks that meet specific criteria from a Workspace. Responses are
    limited to 100 tasks per page.     You can only view task information of
    tasks you can access.
    """

    _tags = ["Tasks"]
    _display_name = "get_filtered_team_tasks"
    _request_schema = GetFilteredTeamTasksRequest
    _response_schema = GetFilteredTeamTasksResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_Id}/task"
    method = "get"
    operation_id = "Tasks_filterTeamTasks"
    action_identifier = "/team/{team_Id}/task_get"

    path_params = {"team_Id": "team_Id"}
    query_params = {
        "page": "page",
        "order_by": "order_by",
        "reverse": "reverse",
        "subtasks": "subtasks",
        "space_ids": "space_ids",
        "project_ids": "project_ids",
        "list_ids": "list_ids",
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
        "custom_task_ids": "custom_task_ids",
        "team_id": "team_id",
        "parent": "parent",
        "include_markdown_description": "include_markdown_description",
        "custom_items": "custom_items",
    }
    header_params = {}
    request_params = {}

    aliases = {}
