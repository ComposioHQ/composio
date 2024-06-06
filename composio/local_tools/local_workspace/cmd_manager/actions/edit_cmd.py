from pydantic import Field

from composio.local_tools.local_workspace.commons.get_logger import get_logger
from composio.local_tools.local_workspace.commons.history_processor import (
    history_recorder,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    communicate,
)
from composio.local_tools.local_workspace.commons.utils import process_output

from .base_class import BaseAction, BaseRequest, BaseResponse
from .const import SCRIPT_EDIT_LINTING


logger = get_logger()


class EditFileRequest(BaseRequest):
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


class EditFileResponse(BaseResponse):
    pass


class EditFile(BaseAction):
    """
    replaces *all* of the text between the START CURSOR and the END CURSOR with the replacement_text.
    Please note that THE EDIT COMMAND REQUIRES PROPER INDENTATION.

    Python files will be checked for syntax errors after the edit.
    If you'd like to add the line '        print(x)' you must fully write that out,
    with all those spaces before the code!
    If the system detects a syntax error, the edit will not be executed.
    Simply try to edit the file again, but make sure to read the error message and modify the edit command you issue accordingly.
    Issuing the same command a second time will just lead to the same error message again.
    """

    _display_name = "Edit File Action"
    _request_schema = EditFileRequest
    _response_schema = EditFileResponse

    @history_recorder()
    def execute(
        self, request_data: EditFileRequest, authorisation_data: dict
    ) -> BaseResponse:
        self._setup(request_data)
        self.script_file = SCRIPT_EDIT_LINTING
        self.command = "edit"
        full_command = f"edit {request_data.start_line}:{request_data.end_line} << end_of_edit\n{request_data.replacement_text}\nend_of_edit"

        if self.container_process is None:
            raise ValueError("Container process is not set")

        output, return_code = communicate(
            self.container_process, self.container_obj, full_command, self.parent_pids
        )
        output, return_code = process_output(output, return_code)
        return BaseResponse(
            output=output,
            return_code=return_code,
        )
