import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class AddTaskToListRequest(BaseModel):
    """Request schema for `AddTaskToList`"""

    list_id: int = Field(
        ...,
        alias="list_id",
        description="",
    )
    task_id: str = Field(
        ...,
        alias="task_id",
        description="",
    )


class AddTaskToListResponse(BaseModel):
    """Response schema for `AddTaskToList`"""

    data: t.Dict[str, t.Any]


class AddTaskToList(OpenAPIAction):
    """
    Add a task to an additional List.    ***Note:** This endpoint requires the
    [Tasks in Multiple List ClickApp](https://help.clickup.com/hc/en-us/articles/6309958824727-Tasks-in-Multiple-Lists)
    to be enabled.*
    """

    _tags = ["Lists"]
    _display_name = "add_task_to_list"
    _request_schema = AddTaskToListRequest
    _response_schema = AddTaskToListResponse

    url = "https://api.clickup.com/api/v2"
    path = "/list/{list_id}/task/{task_id}"
    method = "post"
    operation_id = "Lists_addTaskToList"
    action_identifier = "/list/{list_id}/task/{task_id}_post"

    path_params = {"list_id": "list_id", "task_id": "task_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
