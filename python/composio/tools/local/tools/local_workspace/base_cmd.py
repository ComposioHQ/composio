import typing as t
from abc import ABC, abstractmethod

from pydantic import BaseModel, Field

from composio.core.local import Action
from composio.local_tools.local_workspace.utils import process_output
from composio.workspace.base_workspace import BaseCmdResponse, Workspace
from composio.workspace.get_logger import get_logger
from composio.workspace.workspace_factory import WorkspaceFactory


logger = get_logger("workspace")


class BaseRequest(BaseModel):
    workspace_id: str = Field(
        ..., description="workspace-id to get the running workspace-manager"
    )


class BaseResponse(BaseModel):
    class Config:
        arbitrary_types_allowed = True

    output: t.Any = Field(..., description="output of the command")
    return_code: int = Field(
        ..., description="Any output or errors that occurred during the file edit."
    )


class BaseAction(Action[BaseRequest, BaseResponse], ABC):
    """
    Base class for all actions
    """

    _runs_on_workspace = True
    _display_name = ""
    _tags = ["workspace"]
    workspace: t.Optional[Workspace] = None

    def __init__(self):
        super().__init__()
        self.workspace_id = ""
        self.command = ""
        self.return_code = None

    def _setup(self, args: BaseRequest):
        self.workspace_id = args.workspace_id
        self.workspace = WorkspaceFactory.get_instance().get_workspace_by_id(
            self.workspace_id
        )
        if self.workspace is None:
            logger.error("workspace_factory is not set")
            raise ValueError("workspace_factory is not set")

    def _communicate(self, cmd_to_run, timeout=25, output_text=""):
        workspace_response: BaseCmdResponse = (
            self.workspace.record_history_and_communicate(cmd_to_run, timeout)
        )
        output, return_code = process_output(
            workspace_response.output, workspace_response.return_code
        )
        if output_text and output_text.strip():
            output = output_text
        return BaseResponse(
            output=output,
            return_code=return_code,
        )

    @abstractmethod
    def execute(
        self, request_data: BaseRequest, authorisation_data: dict
    ) -> BaseResponse:
        pass
