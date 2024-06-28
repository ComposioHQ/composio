from pydantic import Field

from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.history_processor import (
    history_recorder,
)
from composio.workspace.base_workspace import BaseCmdResponse
from composio.local_tools.local_workspace.commons.utils import process_output

from .base_class import BaseAction, BaseRequest, BaseResponse
from .const import SCRIPT_CURSOR_DEFAULT


logger = get_logger("workspace")


class GoToRequest(BaseRequest):
    line_number: int = Field(
        ..., description="The line number to which the view should be moved."
    )


class GoToResponse(BaseResponse):
    pass


class GoToLineNumInOpenFile(BaseAction):
    """
    Navigates to a specific line number in the open file, with checks to ensure the file is open
    and the line number is a valid number.

    Args:
    - line_number (int): The line number to navigate to.

    Raises:
    - ValueError: If line_number is not an integer.
    - RuntimeError: If no file is currently open.
    """

    _display_name = "Goto Line Action"
    _request_schema = GoToRequest
    _response_schema = GoToResponse

    @history_recorder()
    def execute(
        self, request_data: GoToRequest, authorisation_data: dict
    ) -> BaseResponse:
        self._setup(request_data)
        command = f"goto {str(request_data.line_number)}"
        cmd_response: BaseCmdResponse = self.workspace.communicate(command)
        output, return_code = process_output(cmd_response.output, cmd_response.return_code)
        return BaseResponse(output=output, return_code=return_code)


class CreateFileRequest(BaseRequest):
    file_name: str = Field(
        ...,
        description="The name of the new file to be created within the shell session",
    )


class CreateFileResponse(BaseResponse):
    pass


class CreateFileCmd(BaseAction):
    """
    Creates a new file within a shell session.
    Example:
        - To create a file, provide the shell ID and the name of the new file.
        - The response will indicate whether the file was created successfully and list any errors.
    Raises:
    - ValueError: If line_number is not an integer.
    - RuntimeError: If no file is currently open.
    """

    _display_name = "Create and open a new file"
    _request_schema = CreateFileRequest
    _response_schema = CreateFileResponse

    @history_recorder()
    def execute(
        self, request_data: CreateFileRequest, authorisation_data: dict
    ) -> BaseResponse:
        self._setup(request_data)
        self.command = "create"
        file_name = request_data.file_name
        output, return_code = self.validate_file_name(file_name)
        if output is not None:
            return CreateFileResponse(output=output, return_code=return_code)
        command = f"{self.command} {str(request_data.file_name)}"
        print(f"Running command: {command}")
        cmd_response: BaseCmdResponse = self.workspace.communicate(command)
        output, return_code = process_output(cmd_response.output, cmd_response.return_code)
        return BaseResponse(output=output, return_code=return_code)

    def validate_file_name(self, file_name):
        if file_name is None or file_name.strip() == "":
            return "Exception: file-name can not be empty", 1
        return None, 0


class OpenCmdRequest(BaseRequest):
    file_name: str = Field(..., description="file path to open in the editor")
    line_number: int = Field(
        default=0,
        description="if file-number is given, file will be open from that line number",
    )


class OpenCmdResponse(BaseResponse):
    pass


class OpenFile(BaseAction):
    """
    Opens a file in the editor based on the provided file path,
    If line_number is provided, the window will be move to include that line

    Can result in:
    - ValueError: If file_path is not a string or if the file does not exist.
    - RuntimeError: If no file is currently open.
    """

    _display_name = "Open File on workspace"
    _request_schema = OpenCmdRequest
    _response_schema = OpenCmdResponse

    @history_recorder()
    def execute(
        self, request_data: OpenCmdRequest, authorisation_data: dict
    ) -> BaseResponse:
        self._setup(request_data)
        command = f"open {request_data.file_name}"
        if request_data.line_number != 0:
            command += f" {request_data.line_number}"
        cmd_response: BaseCmdResponse = self.workspace.communicate(command)
        output, return_code = process_output(cmd_response.output, cmd_response.return_code)
        return BaseResponse(output=output, return_code=return_code)
