from pydantic import BaseModel, Field

from composio.local_tools.action import Action
from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    LocalDockerArgumentsModel,
)

from .base_workspace_action import (
    BaseWorkspaceAction,
    BaseWorkspaceRequest,
    BaseWorkspaceResponse,
)

logger = get_logger()


class CreateWorkspaceRequest(BaseWorkspaceRequest):
    image_name: str = Field(
        default="sweagent/swe-agent:latest",
        description="""The workspace is a docker container. 
        Use sweagent/swe-agent:latest it works for most use cases. 
        Only use a different image if you have a good reason.
        Ex. image names ubuntu:22.04
        """,
        examples=["sweagent/swe-agent:latest", "ubuntu:22.04"],
    )


class CreateWorkspaceResponse(BaseWorkspaceResponse):
    workspace_id: str = Field(..., description="workspace-id for the created workspace")


class CreateWorkspaceAction(BaseWorkspaceAction):
    """
    Creates a workspace, and returns workspace-id
    """

    _display_name = "Create workspace"
    _request_schema = CreateWorkspaceRequest
    _response_schema = CreateWorkspaceResponse

    def execute(
        self, request_data: CreateWorkspaceRequest, authorisation_data: dict
    ) -> CreateWorkspaceResponse:
        if self.workspace_factory is None:
            raise ValueError("Workspace factory is not set")

        if request_data.image_name == "":
            request_data.image_name = "sweagent/swe-agent:latest"

        args: LocalDockerArgumentsModel = LocalDockerArgumentsModel(
            image_name=request_data.image_name
        )
        workspace_id = self.workspace_factory.get_workspace_manager(args)
        return CreateWorkspaceResponse(workspace_id=workspace_id)
