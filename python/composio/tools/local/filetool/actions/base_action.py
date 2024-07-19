from abc import ABC, abstractmethod

from pydantic import BaseModel, Field

from composio.tools.env.filemanager.manager import FileManager
from composio.tools.local.base import Action


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


class BaseFileAction(Action, ABC):
    _tool_name: str = "filetool"

    @abstractmethod
    def execute_on_file_manager(
        self, file_manager: FileManager, request_data: BaseFileRequest
    ) -> BaseFileResponse:
        pass

    def execute(
        self, request_data: BaseFileRequest, authorisation_data: dict
    ) -> BaseFileResponse:
        file_managers = authorisation_data.get("workspace").file_managers  # type: ignore
        file_manager = file_managers.get(request_data.file_manager_id)
        resp = self.execute_on_file_manager(
            file_manager=file_manager, request_data=request_data
        )
        resp.current_working_directory = str(file_manager.working_dir)
        return resp
