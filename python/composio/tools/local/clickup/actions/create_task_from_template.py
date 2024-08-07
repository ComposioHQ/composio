import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class CreateTaskFromTemplateRequest(BaseModel):
    """Request schema for `CreateTaskFromTemplate`"""

    list_id: int = Field(
        ...,
        alias="list_id",
        description="",
    )
    template_id: str = Field(
        ...,
        alias="template_id",
        description="",
    )
    name: str = Field(
        default=...,
        alias="name",
        description="Name",
    )


class CreateTaskFromTemplateResponse(BaseModel):
    """Response schema for `CreateTaskFromTemplate`"""

    data: t.Dict[str, t.Any]


class CreateTaskFromTemplate(OpenAPIAction):
    """Create a new task using a task template."""

    _tags = ["Task Templates"]
    _display_name = "create_task_from_template"
    _request_schema = CreateTaskFromTemplateRequest
    _response_schema = CreateTaskFromTemplateResponse

    url = "https://api.clickup.com/api/v2"
    path = "/list/{list_id}/taskTemplate/{template_id}"
    method = "post"
    operation_id = "TaskTemplates_createFromTemplate"
    action_identifier = "/list/{list_id}/taskTemplate/{template_id}_post"

    path_params = {"list_id": "list_id", "template_id": "template_id"}
    query_params = {}
    header_params = {}
    request_params = {"name": {"__alias": "name"}}

    aliases = {}
