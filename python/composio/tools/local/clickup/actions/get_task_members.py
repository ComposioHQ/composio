import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class GetTaskMembersRequest(BaseModel):
    """Request schema for `GetTaskMembers`"""

    task_id: str = Field(
        ...,
        alias="task_id",
        description="",
    )


class GetTaskMembersResponse(BaseModel):
    """Response schema for `GetTaskMembers`"""

    data: t.Dict[str, t.Any]


class GetTaskMembers(OpenAPIAction):
    """View the people who have access to a task."""

    _tags = ["Members"]
    _display_name = "get_task_members"
    _request_schema = GetTaskMembersRequest
    _response_schema = GetTaskMembersResponse

    url = "https://api.clickup.com/api/v2"
    path = "/task/{task_id}/member"
    method = "get"
    operation_id = "Members_getTaskAccess"
    action_identifier = "/task/{task_id}/member_get"

    path_params = {"task_id": "task_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
