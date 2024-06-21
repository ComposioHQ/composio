import json
from typing import Any, Dict, List

from pydantic import BaseModel, Field

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


class SingleEditRequest(BaseModel):
    file_name: str = Field(..., description="file-name in which edit has to be applied")
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


class ApplyMultipleEditsInFileRequest(BaseModel):
    workspace_id: str = Field(
        ..., description="workspace-id to get the running workspace-manager"
    )
    edits: List[SingleEditRequest] = Field(
        ..., description="A list of edits to apply to the file."
    )


class ApplyMultipleEditsInFileResponse(BaseModel):
    errors: Dict[str, Any] = Field(
        ..., description="errors per file-name while applying edits on that file"
    )
    successful_edits: Dict[str, Any] = Field(
        ..., description="successful edits made in the file"
    )
    evaluation: str = Field(
        ...,
        description="evaluation of the multiple edit command. It will tell how many edits in "
        "the file have passed, and how many failed",
    )


class ApplyMultipleEditsInFile(BaseAction):
    """
    Applies multiple edits to a file. Each edit is processed sequentially.
    Each edit must ensure proper indentation and will be checked for syntax errors.
    The single edit is explained below
    Single edit in this list of edits, replaces *all* of the text between the START CURSOR and the END CURSOR with the replacement_text.
    Please note that THE EDIT COMMAND REQUIRES PROPER INDENTATION.

    Python files will be checked for syntax errors after the edit.
    If you'd like to add the line '        print(x)' you must fully write that out,
    with all those spaces before the code!
    If the system detects a syntax error, the edit will not be executed.
    Simply try to edit the file again, but make sure to read the error message and modify the edit command you issue accordingly.
    Issuing the same command a second time will just lead to the same error message again.

    If any of the single commit fails in the command, the function will return. In case of error, You will get an output like
    output: <single_edit_request> \n <output of error>
    If all edits succeeds, return_code will be 0 and output will be a list of all the single-edit outputs
    """

    _display_name = "Apply multiple edits in the file"
    _request_schema = ApplyMultipleEditsInFileRequest
    _response_schema = ApplyMultipleEditsInFileResponse

    @history_recorder()
    def execute(
        self, request_data: ApplyMultipleEditsInFileRequest, authorisation_data: dict
    ) -> BaseResponse:
        responses = []
        return_code = 0
        self._setup(request_data)
        errors = {}
        successful_edits = {}
        for edit_request in request_data.edits:
            open_file_cmd = f"open {edit_request.file_name}"
            output, ret_code = communicate(
                self.container_process,
                self.container_obj,
                open_file_cmd,
                self.parent_pids,
            )
            if ret_code != 0:
                errors.setdefault(edit_request.file_name, [])
                errors[edit_request.file_name].append(output)
                continue
            full_command = f"edit {edit_request.start_line}:{edit_request.end_line} << end_of_edit\n{edit_request.replacement_text}\nend_of_edit"
            output, return_code = communicate(
                self.container_process,
                self.container_obj,
                full_command,
                self.parent_pids,
            )
            output, return_code = process_output(output, return_code)
            if "Your proposed edit has introduced new syntax error(s)" in output:
                errors.setdefault(edit_request.file_name, [])
                errors[edit_request.file_name].append(output)
                continue
            successful_edits.setdefault(edit_request.file_name, [])
            successful_edits[edit_request.file_name].append(output)
        responses = {"errors": errors, "successful_edits": successful_edits}
        output = f"total errors: {len(errors)}, total_successful_edits: {len(successful_edits)}\n\n{json.dumps(responses)}"
        return BaseResponse(output=output, return_code=return_code)
