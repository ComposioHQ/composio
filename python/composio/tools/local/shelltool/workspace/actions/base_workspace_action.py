from typing import TypeVar

from pydantic import BaseModel, Field


class BaseWorkspaceRequest(BaseModel):
    workspace_id: str = Field(
        ...,
        description="workspace id for the workspace",
    )


class BaseWorkspaceResponse(BaseModel):
    pass


RequestType = TypeVar("RequestType", bound=BaseModel)
ResponseType = TypeVar("ResponseType", bound=BaseModel)
