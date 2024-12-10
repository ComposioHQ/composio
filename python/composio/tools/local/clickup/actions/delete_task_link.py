import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class DeleteTaskLinkRequest(BaseModel):
    """Request schema for `DeleteTaskLink`"""

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


class DeleteTaskLinkResponse(BaseModel):
    """Response schema for `DeleteTaskLink`"""

    data: t.Dict[str, t.Any]


class DeleteTaskLink(OpenAPIAction):
    """Remove the link between two tasks."""

    _tags = ["Task Relationships"]
    _display_name = "delete_task_link"
    _request_schema = DeleteTaskLinkRequest
    _response_schema = DeleteTaskLinkResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}/link/{links_to}"
    method = "delete"
    operation_id = "TaskRelationships_removeLinkBetweenTasks"
    action_identifier = "/task/{task_id}/link/{links_to}_delete"

    path_params = {"task_id": "task_id", "links_to": "links_to"}
    query_params = {"custom_task_ids": "custom_task_ids", "team_id": "team_id"}
    header_params = {}
    request_params = {}

    aliases = {}
