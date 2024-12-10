import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class AddTaskLinkRequest(BaseModel):
    """Request schema for `AddTaskLink`"""

    task_id: str = Field(
        ...,
        alias="task_id",
        description="",
    )
    links_to: str = Field(
        ...,
        alias="links_to",
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


class AddTaskLinkResponse(BaseModel):
    """Response schema for `AddTaskLink`"""

    data: t.Dict[str, t.Any]


class AddTaskLink(OpenAPIAction):
    """Link two tasks together."""

    _tags = ["Task Relationships"]
    _display_name = "add_task_link"
    _request_schema = AddTaskLinkRequest
    _response_schema = AddTaskLinkResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}/link/{links_to}"
    method = "post"
    operation_id = "TaskRelationships_linkTasks"
    action_identifier = "/task/{task_id}/link/{links_to}_post"

    path_params = {"task_id": "task_id", "links_to": "links_to"}
    query_params = {"custom_task_ids": "custom_task_ids", "team_id": "team_id"}
    header_params = {}
    request_params = {}

    aliases = {}
