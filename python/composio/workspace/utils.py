from composio.workspace.get_logger import get_logger
from pydantic import BaseModel, Field
import typing as t


logger = get_logger("workspace")


class BaseCmdResponse(BaseModel):
    output: t.Any = Field(..., description="response from command")
    return_code: int = Field(
        ..., description="return code from running a command on workspace"
    )
