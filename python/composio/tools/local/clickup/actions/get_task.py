import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetTaskRequest(BaseModel):
    """Request schema for `GetTask`"""

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
    include_subtasks: t.Optional[bool] = Field(
        default=None,
        alias="include_subtasks",
        description="Include subtasks, default false",
    )
    include_markdown_description: t.Optional[bool] = Field(
        default=None,
        alias="include_markdown_description",
        description=(
            "To return task descriptions in Markdown format, use `?include_markdown_description=true`. "
        ),
    )


class GetTaskResponse(BaseModel):
    """Response schema for `GetTask`"""

    data: t.Dict[str, t.Any]


class GetTask(OpenAPIAction):
    """
    View information about a task. You can only view task information of tasks
    you can access.    Tasks with attachments will return an "attachments" response.
    """

    _tags = ["Tasks"]
    _display_name = "get_task"
    _request_schema = GetTaskRequest
    _response_schema = GetTaskResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}"
    method = "get"
    operation_id = "Tasks_getTaskDetails"
    action_identifier = "/task/{task_id}_get"

    path_params = {"task_id": "task_id"}
    query_params = {
        "custom_task_ids": "custom_task_ids",
        "team_id": "team_id",
        "include_subtasks": "include_subtasks",
        "include_markdown_description": "include_markdown_description",
    }
    header_params = {}
    request_params = {}

    aliases = {}


class tasks_get_task_details(OpenAPIAction):
    """
    View information about a task. You can only view task information of tasks
    you can access.    Tasks with attachments will return an "attachments" response.<<DEPRECATED
    use get_task>>
    """

    _tags = ["Tasks"]
    _display_name = "tasks_get_task_details"
    _request_schema = GetTaskRequest
    _response_schema = GetTaskResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}"
    method = "get"
    operation_id = "Tasks_getTaskDetails"
    action_identifier = "/task/{task_id}_get"

    path_params = {"task_id": "task_id"}
    query_params = {
        "custom_task_ids": "custom_task_ids",
        "team_id": "team_id",
        "include_subtasks": "include_subtasks",
        "include_markdown_description": "include_markdown_description",
    }
    header_params = {}
    request_params = {}

    aliases = {}
