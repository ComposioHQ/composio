from pydantic import Field

from composio.tools.env.constants import EXIT_CODE, STDERR, STDOUT
from composio.tools.local.shelltool.shell_exec.actions.exec import (
    BaseExecCommand,
    ShellExecResponse,
    ShellRequest,
    exec_cmd,
)
from composio.utils.logging import get as get_logger


logger = get_logger("workspace")


class EditFileRequest(ShellRequest):
    start_line: int = Field(
        ..., description="The line number at which the file edit will start"
    )
    end_line: int = Field(
        ..., description="The line number at which the file edit will end (inclusive)."
    )
    replacement_text: str = Field(
        ...,
        description="The text that will replace the specified line range in the file.",
    )


class EditFileResponse(ShellExecResponse):
    pass


class EditFile(BaseExecCommand):
    """
    Please note that THE EDIT COMMAND REQUIRES PROPER INDENTATION.

    Python files will be checked for syntax errors after the edit.
    If you'd like to add the line '        print(x)' you must fully write that out,
    with all those spaces before the code!
    If the system detects a syntax error, the edit will not be executed.
    Simply try to edit the file again, but make sure to read the error message and modify the edit command you issue accordingly.
    Issuing the same command a second time will just lead to the same error message again.
    """

    _display_name = "Edit File Action"
    _tool_name = "fileedittool"
    _request_schema = EditFileRequest
    _response_schema = EditFileResponse

    def execute(
        self, request_data: EditFileRequest, authorisation_data: dict
    ) -> ShellExecResponse:
        full_command = f"edit {request_data.start_line}:{request_data.end_line} << end_of_edit\n{request_data.replacement_text}\nend_of_edit"
        output = exec_cmd(
            cmd=full_command,
            authorisation_data=authorisation_data,
            shell_id=request_data.shell_id,
        )
        return EditFileResponse(
            stdout=output[STDOUT],
            stderr=output[STDERR],
            exit_code=int(output[EXIT_CODE]),
        )
