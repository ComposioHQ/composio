import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetTaskSTimeInStatusRequest(BaseModel):
    """Request schema for `GetTaskSTimeInStatus`"""

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


class GetTaskSTimeInStatusResponse(BaseModel):
    """Response schema for `GetTaskSTimeInStatus`"""

    data: t.Dict[str, t.Any]


class GetTaskSTimeInStatus(OpenAPIAction):
    """
    View how long a task has been in each status. The Total time in Status ClickApp
    must first be enabled by the Workspace owner or an admin.
    """

    _tags = ["Tasks"]
    _display_name = "get_task_s_time_in_status"
    _request_schema = GetTaskSTimeInStatusRequest
    _response_schema = GetTaskSTimeInStatusResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}/time_in_status"
    method = "get"
    operation_id = "Tasks_getTimeInStatus"
    action_identifier = "/task/{task_id}/time_in_status_get"

    path_params = {"task_id": "task_id"}
    query_params = {"custom_task_ids": "custom_task_ids", "team_id": "team_id"}
    header_params = {}
    request_params = {}

    aliases = {}
