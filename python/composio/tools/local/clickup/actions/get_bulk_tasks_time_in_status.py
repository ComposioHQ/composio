import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetBulkTasksTimeInStatusRequest(BaseModel):
    """Request schema for `GetBulkTasksTimeInStatus`"""

    task_ids: str = Field(
        ...,
        alias="task_ids",
        description=(
            "Include this parameter once per `task_id`. You can include up to 100 task "
            "ids per request. For example: `task_ids=3cuh&task_ids=g4fs` "
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


class GetBulkTasksTimeInStatusResponse(BaseModel):
    """Response schema for `GetBulkTasksTimeInStatus`"""

    data: t.Dict[str, t.Any]


class GetBulkTasksTimeInStatus(OpenAPIAction):
    """View how long two or more tasks have been in each status."""

    _tags = ["Tasks"]
    _display_name = "get_bulk_tasks_time_in_status"
    _request_schema = GetBulkTasksTimeInStatusRequest
    _response_schema = GetBulkTasksTimeInStatusResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/bulk_time_in_status/task_ids"
    method = "get"
    operation_id = "Tasks_getTimeInStatusBulk"
    action_identifier = "/task/bulk_time_in_status/task_ids_get"

    path_params = {}
    query_params = {
        "task_ids": "task_ids",
        "custom_task_ids": "custom_task_ids",
        "team_id": "team_id",
    }
    header_params = {}
    request_params = {}

    aliases = {}
