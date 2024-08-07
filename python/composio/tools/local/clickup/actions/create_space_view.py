import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class CreateSpaceViewRequest(BaseModel):
    """Request schema for `CreateSpaceView`"""

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
    type: str = Field(
        default=...,
        alias="type",
        description=(
            "The type of view to create. Options include: `list`, `board`, `calendar`, "
            "`table`, `timeline`, `workload`, `activity`, `map`, `conversation`, or `gantt`. "
        ),
    )
    grouping_field: str = Field(
        default=...,
        alias="grouping__field",
        description=(
            "Set the field to group by.   Options include: `none`, `status`, `priority`, "
            "`assignee`, `tag`, or `dueDate`. "
        ),
    )
    grouping_dir: int = Field(
        default=...,
        alias="grouping__dir",
        description=(
            "Set a group sort order using `1` or `-1`.   For example, use `1`show tasks "
            "with urgent priority at the top of your view, and tasks with no priority "
            "at the bottom.   Use `-1` to reverse the order to show tasks with no priority "
            "at the top of your view. "
        ),
    )
    grouping_collapsed: t.List[str] = Field(
        default=...,
        alias="grouping__collapsed",
        description="",
    )
    grouping_ignore: bool = Field(
        default=...,
        alias="grouping__ignore",
        description="Ignore",
    )
    divide_field: None = Field(
        default=None,
        alias="divide__field",
        description="Field",
    )
    divide_dir: None = Field(
        default=None,
        alias="divide__dir",
        description="Dir",
    )
    divide_collapsed: bool = Field(
        default=...,
        alias="divide__collapsed",
        description="Collapsed",
    )
    sorting_fields: t.List[str] = Field(
        default=...,
        alias="sorting__fields",
        description=(
            "Include an array of fields to sort by.    You can sort by the same fields "
            "available when [filtering a view](https://clickup.com/api). "
        ),
    )
    filters_op: str = Field(
        default=...,
        alias="filters__op",
        description="The available operator (`op``) values are `AND`` and `OR``.",
    )
    filters_fields: t.List[str] = Field(
        default=...,
        alias="filters__fields",
        description=(
            "View the list of [fields available](https://clickup.com/api) to filter by. "
        ),
    )
    filters_search: str = Field(
        default=...,
        alias="filters__search",
        description="Search",
    )
    filters_show_closed: bool = Field(
        default=...,
        alias="filters__show_closed",
        description="Show Closed",
    )
    columns_fields: t.List[str] = Field(
        default=...,
        alias="columns__fields",
        description=(
            "Custom Fields require the `_cf` prefix and must be formatted as a JSON object. "
        ),
    )
    team_sidebar_assignees: t.List[str] = Field(
        default=...,
        alias="team_sidebar__assignees",
        description="",
    )
    team_sidebar_assigned_comments: bool = Field(
        default=...,
        alias="team_sidebar__assigned_comments",
        description="Assigned Comments",
    )
    team_sidebar_unassigned_tasks: bool = Field(
        default=...,
        alias="team_sidebar__unassigned_tasks",
        description="Unassigned Tasks",
    )
    settings_show_task_locations: bool = Field(
        default=...,
        alias="settings__show_task_locations",
        description="Show Task Locations",
    )
    settings_show_subtasks: int = Field(
        default=...,
        alias="settings__show_subtasks",
        description=(
            "Acceptable values are `1`, `2`, or `3`, which show subtasks separate, expanded, "
            "or collapsed. "
        ),
    )
    settings_show_subtask_parent_names: bool = Field(
        default=...,
        alias="settings__show_subtask_parent_names",
        description="Show Subtask Parent Names",
    )
    settings_show_closed_subtasks: bool = Field(
        default=...,
        alias="settings__show_closed_subtasks",
        description="Show Closed Subtasks",
    )
    settings_show_assignees: bool = Field(
        default=...,
        alias="settings__show_assignees",
        description="Show Assignees",
    )
    settings_show_images: bool = Field(
        default=...,
        alias="settings__show_images",
        description="Show Images",
    )
    settings_collapse_empty_columns: str = Field(
        default=...,
        alias="settings__collapse_empty_columns",
        description="Collapse Empty Columns",
    )
    settings_me_comments: bool = Field(
        default=...,
        alias="settings__me_comments",
        description="Me Comments",
    )
    settings_me_subtasks: bool = Field(
        default=...,
        alias="settings__me_subtasks",
        description="Me Subtasks",
    )
    settings_me_checklists: bool = Field(
        default=...,
        alias="settings__me_checklists",
        description="Me Checklists",
    )


class CreateSpaceViewResponse(BaseModel):
    """Response schema for `CreateSpaceView`"""

    data: t.Dict[str, t.Any]


class CreateSpaceView(OpenAPIAction):
    """
    Add a List, Board, Calendar, Table, Timeline, Workload, Activity, Map, Chat,
    or Gantt view to a Space.
    """

    _tags = ["Views"]
    _display_name = "create_space_view"
    _request_schema = CreateSpaceViewRequest
    _response_schema = CreateSpaceViewResponse

    url = "https://api.clickup.com/api/v2"
    path = "/space/{space_id}/view"
    method = "post"
    operation_id = "Views_addViewToSpace"
    action_identifier = "/space/{space_id}/view_post"

    path_params = {"space_id": "space_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "name": {"__alias": "name"},
        "type": {"__alias": "type"},
        "grouping": {
            "__alias": "grouping",
            "field": {"__alias": "field"},
            "dir": {"__alias": "dir"},
            "collapsed": {"__alias": "collapsed"},
            "ignore": {"__alias": "ignore"},
        },
        "divide": {
            "__alias": "divide",
            "field": {"__alias": "field"},
            "dir": {"__alias": "dir"},
            "collapsed": {"__alias": "collapsed"},
        },
        "sorting": {"__alias": "sorting", "fields": {"__alias": "fields"}},
        "filters": {
            "__alias": "filters",
            "op": {"__alias": "op"},
            "fields": {"__alias": "fields"},
            "search": {"__alias": "search"},
            "show_closed": {"__alias": "show_closed"},
        },
        "columns": {"__alias": "columns", "fields": {"__alias": "fields"}},
        "team_sidebar": {
            "__alias": "team_sidebar",
            "assignees": {"__alias": "assignees"},
            "assigned_comments": {"__alias": "assigned_comments"},
            "unassigned_tasks": {"__alias": "unassigned_tasks"},
        },
        "settings": {
            "__alias": "settings",
            "show_task_locations": {"__alias": "show_task_locations"},
            "show_subtasks": {"__alias": "show_subtasks"},
            "show_subtask_parent_names": {"__alias": "show_subtask_parent_names"},
            "show_closed_subtasks": {"__alias": "show_closed_subtasks"},
            "show_assignees": {"__alias": "show_assignees"},
            "show_images": {"__alias": "show_images"},
            "collapse_empty_columns": {"__alias": "collapse_empty_columns"},
            "me_comments": {"__alias": "me_comments"},
            "me_subtasks": {"__alias": "me_subtasks"},
            "me_checklists": {"__alias": "me_checklists"},
        },
    }

    aliases = {
        "grouping": "fb8a835e",
        "divide": "d01a3e45",
        "sorting": "24c3a5b6",
        "filters": "c2edf54f",
        "columns": "d19274c3",
        "team_sidebar": "3a20b9ce",
        "settings": "800f8573",
    }
