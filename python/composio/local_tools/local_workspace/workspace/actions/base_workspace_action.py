import typing
from abc import ABC, abstractmethod
from typing import TypeVar

from pydantic import BaseModel, Field

from composio.core.local import Action
from composio.local_tools.local_workspace.commons import get_logger
from composio.workspace.base_workspace import Workspace
from composio.workspace.workspace_factory import WorkspaceFactory


logger = get_logger("workspace")


class BaseWorkspaceRequest(BaseModel):
    workspace_id: str = Field(default="", description="workspace id for the workspace")


class BaseWorkspaceResponse(BaseModel):
    pass


RequestType = TypeVar("RequestType", bound=BaseModel)
ResponseType = TypeVar("ResponseType", bound=BaseModel)


class BaseWorkspaceAction(Action[RequestType, ResponseType], ABC):
    """
    Base class for all Workspace actions
    """

    _history_maintains = True
    _display_name = ""
    _tags = ["workspace"]
    _tool_name = "localworkspace"
    workspace: Workspace = typing.Optional[Workspace]

    def __init__(self):
        super().__init__()
        self.args = None
        self.workspace_id = ""
        self.container_name = ""
        self.image_name = ""
        self.container_process = None
        self.parent_pids = []
        self.container_obj = None
        self.return_code = None
        self.logger = logger
        self.config = None
        self.config_file_path = None

    def _setup(self, request_data: BaseWorkspaceRequest):
        self.workspace = WorkspaceFactory.get_instance().get_registered_manager(
            request_data.workspace_id
        )

    @abstractmethod
    def execute(
        self, request_data: RequestType, authorisation_data: dict
    ) -> ResponseType:
        pass
