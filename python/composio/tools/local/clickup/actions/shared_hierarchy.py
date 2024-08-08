import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class SharedHierarchyRequest(BaseModel):
    """Request schema for `SharedHierarchy`"""

    team_id: int = Field(
        ...,
        alias="team_id",
        description="Team ID (Workspace)",
    )


class SharedHierarchyResponse(BaseModel):
    """Response schema for `SharedHierarchy`"""

    data: t.Dict[str, t.Any]


class SharedHierarchy(OpenAPIAction):
    """
    View the tasks, Lists, and Folders that have been shared with the authenticated
    user.
    """

    _tags = ["Shared Hierarchy"]
    _display_name = "shared_hierarchy"
    _request_schema = SharedHierarchyRequest
    _response_schema = SharedHierarchyResponse

    url = "https://api.clickup.com/api/v2"
    path = "/team/{team_id}/shared"
    method = "get"
    operation_id = "SharedHierarchy_viewTasksListsFolders"
    action_identifier = "/team/{team_id}/shared_get"

    path_params = {"team_id": "team_id"}
    query_params = {}
    header_params = {}
    request_params = {}

    aliases = {}
