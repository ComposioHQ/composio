from pydantic import Field, field_validator

from composio.tools.env.constants import EXIT_CODE, STDERR, STDOUT
from composio.tools.local.shelltool.shell_exec.actions.exec import (
    BaseExecCommand,
    ShellExecResponse,
    ShellRequest,
    exec_cmd,
)


class GoToRequest(ShellRequest):
    line_number: int = Field(
        ..., description="The line number to which the view should be moved."
    )


class GoToResponse(ShellExecResponse):
    pass


class GoToLineNumInOpenFile(BaseExecCommand):
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
    _tool_name = "fileedittool"
    _request_schema = GoToRequest
    _response_schema = GoToResponse

    def execute(
        self, request_data: GoToRequest, authorisation_data: dict
    ) -> ShellExecResponse:
        output = exec_cmd(
            cmd=f"goto {str(request_data.line_number)}",
            authorisation_data=authorisation_data,
            shell_id=request_data.shell_id,
        )
        return GoToResponse(
            stdout=output[STDOUT],
            stderr=output[STDERR],
            exit_code=int(output[EXIT_CODE]),
        )


class CreateFileRequest(ShellRequest):
    file_name: str = Field(
        ...,
        description="The name of the new file to be created within the shell session",
    )

    @field_validator("file_name")
    @classmethod
    def validate_file_name(cls, v: str) -> str:
        if v.strip() == "":
            raise ValueError("File name cannot be empty or just whitespace")
        if v in (".", ".."):
            raise ValueError('File name cannot be "." or ".."')
        return v


class CreateFileResponse(ShellExecResponse):
    pass


class CreateFileCmd(BaseExecCommand):
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
    _tool_name = "fileedittool"
    _request_schema = CreateFileRequest
    _response_schema = CreateFileResponse

    def execute(
        self, request_data: CreateFileRequest, authorisation_data: dict
    ) -> ShellExecResponse:
        output = exec_cmd(
            cmd=f"create {str(request_data.file_name)}",
            authorisation_data=authorisation_data,
            shell_id=request_data.shell_id,
        )
        return CreateFileResponse(
            stdout=output[STDOUT],
            stderr=output[STDERR],
            exit_code=int(output[EXIT_CODE]),
        )


class OpenCmdRequest(ShellRequest):
    file_name: str = Field(..., description="file path to open in the editor")
    line_number: int = Field(
        default=0,
        description="if file-number is given, file will be open from that line number",
    )


class OpenCmdResponse(ShellExecResponse):
    pass


class OpenFile(BaseExecCommand):
    """
    Opens a file in the editor based on the provided file path,
    If line_number is provided, the window will be move to include that line

    Can result in:
    - ValueError: If file_path is not a string or if the file does not exist.
    - RuntimeError: If no file is currently open.
    """

    _display_name = "Open File on workspace"
    _tool_name = "fileedittool"
    _request_schema = OpenCmdRequest
    _response_schema = OpenCmdResponse

    def execute(
        self, request_data: OpenCmdRequest, authorisation_data: dict
    ) -> ShellExecResponse:
        command = f"open {request_data.file_name}"
        if request_data.line_number != 0:
            command += f" {request_data.line_number}"
        output = exec_cmd(
            cmd=command,
            authorisation_data=authorisation_data,
            shell_id=request_data.shell_id,
        )
        return OpenCmdResponse(
            stdout=output[STDOUT],
            stderr=output[STDERR],
            exit_code=int(output[EXIT_CODE]),
        )
