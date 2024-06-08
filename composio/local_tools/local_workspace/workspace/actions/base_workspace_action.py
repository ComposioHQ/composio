from abc import ABC, abstractmethod
from typing import Optional, TypeVar

from pydantic import BaseModel

from composio.core.local import Action
from composio.local_tools.local_workspace.commons import (
    HistoryProcessor,
    WorkspaceManagerFactory,
    get_logger,
)


logger = get_logger()


class BaseWorkspaceRequest(BaseModel):
    pass


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
    workspace_factory: Optional[WorkspaceManagerFactory] = None
    history_processor: Optional[HistoryProcessor] = None

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

    def set_workspace_and_history(
        self,
        workspace_factory: WorkspaceManagerFactory,
        history_processor: HistoryProcessor,
    ):
        self.workspace_factory = workspace_factory
        self.history_processor = history_processor

    @abstractmethod
    def execute(
        self, request_data: RequestType, authorisation_data: dict
    ) -> ResponseType:
        pass
