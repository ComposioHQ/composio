import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetViewTasksRequest(BaseModel):
    """Request schema for `GetViewTasks`"""

    view_id: str = Field(
        ...,
        alias="view_id",
        description="105 (string)",
    )
    page: int = Field(
        ...,
        alias="page",
        description="",
    )


class GetViewTasksResponse(BaseModel):
    """Response schema for `GetViewTasks`"""

    data: t.Dict[str, t.Any]


class GetViewTasks(OpenAPIAction):
    """See all visible tasks in a view in ClickUp."""

    _tags = ["Views"]
    _display_name = "get_view_tasks"
    _request_schema = GetViewTasksRequest
    _response_schema = GetViewTasksResponse

    url = "https://api.clickup.com/api/v2"
    path = "/view/{view_id}/task"
    method = "get"
    operation_id = "Views_getTasksInView"
    action_identifier = "/view/{view_id}/task_get"

    path_params = {"view_id": "view_id"}
    query_params = {"page": "page"}
    header_params = {}
    request_params = {}

    aliases = {}
