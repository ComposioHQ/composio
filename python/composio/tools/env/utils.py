import typing as t

from pydantic import BaseModel, Field


class BaseCmdResponse(BaseModel):
    output: t.Any = Field(..., description="response from command")
    return_code: int = Field(
        ..., description="return code from running a command on workspace"
    )
