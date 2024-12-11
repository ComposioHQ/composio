import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class CreateChecklistRequest(BaseModel):
    """Request schema for `CreateChecklist`"""

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
    name: str = Field(
        default=...,
        alias="name",
        description="Name",
    )


class CreateChecklistResponse(BaseModel):
    """Response schema for `CreateChecklist`"""

    data: t.Dict[str, t.Any]


class CreateChecklist(OpenAPIAction):
    """Add a new checklist to a task."""

    _tags = ["Task Checklists"]
    _display_name = "create_checklist"
    _request_schema = CreateChecklistRequest
    _response_schema = CreateChecklistResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}/checklist"
    method = "post"
    operation_id = "TaskChecklists_createNewChecklist"
    action_identifier = "/task/{task_id}/checklist_post"

    path_params = {"task_id": "task_id"}
    query_params = {"custom_task_ids": "custom_task_ids", "team_id": "team_id"}
    header_params = {}
    request_params = {"name": {"__alias": "name"}}

    aliases = {}


class task_checklists_create_new_checklist(OpenAPIAction):
    """Add a new checklist to a task.<<DEPRECATED use create_checklist>>"""

    _tags = ["Task Checklists"]
    _display_name = "task_checklists_create_new_checklist"
    _request_schema = CreateChecklistRequest
    _response_schema = CreateChecklistResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}/checklist"
    method = "post"
    operation_id = "TaskChecklists_createNewChecklist"
    action_identifier = "/task/{task_id}/checklist_post"

    path_params = {"task_id": "task_id"}
    query_params = {"custom_task_ids": "custom_task_ids", "team_id": "team_id"}
    header_params = {}
    request_params = {"name": {"__alias": "name"}}

    aliases = {}
