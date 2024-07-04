from abc import ABC, abstractmethod
from typing import TypeVar

from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class BaseWorkspaceRequest(BaseModel):
    workspace_id: str = Field(
        ...,
        description="workspace id for the workspace",
    )


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

    @abstractmethod
    def execute(
        self, request_data: RequestType, authorisation_data: dict
    ) -> ResponseType:
        pass
