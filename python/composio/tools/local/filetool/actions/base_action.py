from pydantic import BaseModel, Field


class BaseFileRequest(BaseModel):
    file_manager_id: str = Field(
        default="",
        description="ID of the file manager where the file will be opened, if not "
        "provided the recent file manager will be used to execute the action",
    )


class BaseFileResponse(BaseModel):
    error: str = Field(
        default="",
        description="Error message if the action failed",
    )
    current_working_directory: str = Field(
        default="",
        description="Current working directory of the file manager.",
    )
