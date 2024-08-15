import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class RemoveTaskFromListRequest(BaseModel):
    """Request schema for `RemoveTaskFromList`"""

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


class RemoveTaskFromListResponse(BaseModel):
    """Response schema for `RemoveTaskFromList`"""

    data: t.Dict[str, t.Any]


class RemoveTaskFromList(OpenAPIAction):
    """
    This API endpoint allows for removing a task from an extra list, not its
    original list, requiring the Tasks in Multiple List ClickApp to be enabled.
    """

    _tags = ["Lists"]
    _display_name = "remove_task_from_list"
    _request_schema = RemoveTaskFromListRequest
    _response_schema = RemoveTaskFromListResponse

    url = "https://api.clickup.com/api/v2"
    path = "/list/{list_id}/task/{task_id}"
    method = "delete"
    operation_id = "Lists_removeTaskFromList"
    action_identifier = "/list/{list_id}/task/{task_id}_delete"

    path_params = {"list_id": "list_id", "task_id": "task_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
