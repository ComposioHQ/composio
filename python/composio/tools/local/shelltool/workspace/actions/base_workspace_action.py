import typing
from abc import ABC, abstractmethod
from typing import TypeVar

from pydantic import BaseModel, Field

from composio.tools.env.factory import WorkspaceFactory
from composio.tools.local.base import Action
from composio.workspace.base_workspace import Workspace


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
    workspace: typing.Optional[Workspace] = None

    def __init__(self):
        super().__init__()
        self.args = None
        self.workspace_id = ""

    def _setup(self, request_data: BaseWorkspaceRequest):
        self.workspace = WorkspaceFactory.get_instance().get_registered_manager(
            request_data.workspace_id
        )

    @abstractmethod
    def execute(
        self, request_data: RequestType, authorisation_data: dict
    ) -> ResponseType:
        pass
