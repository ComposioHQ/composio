from pydantic import Field

from composio.tools.env.filemanager.manager import FileManager
from composio.tools.local.filetool.actions.base_action import (
    BaseFileAction,
    BaseFileRequest,
    BaseFileResponse,
)


class EditFileRequest(BaseFileRequest):
    """Request to edit a file."""

    file_path: str = Field(
        default=None,
        description=(
            "The path to the file that will be edited. If not provided, "
            "THE CURRENTLY OPEN FILE will be edited. If provided, the "
            "file at the provided path will be OPENED and edited, changing "
            "the opened file."
        ),
    )
    text: str = Field(
        ...,
        description="The text that will replace the specified line range in the file.",
    )
    start_line: int = Field(
        ...,
        description="The line number at which the file edit will start (REQUIRED)",
    )
    end_line: int = Field(
        ...,
        description="The line number at which the file edit will end (REQUIRED).",
    )


class EditFileResponse(BaseFileResponse):
    """Response to edit a file."""

    old_text: str = Field(
        default=None,
        description=(
            "The updated changes. If the file was not edited, the original file "
            "will be returned."
        ),
    )
    error: str = Field(
        default=None,
        description="Error message if any",
    )
    updated_text: str = Field(
        default=None,
        description="The updated text. If the file was not edited, this will be empty.",
    )


class EditFile(BaseFileAction):
    """
    Use this tools to edit a file on specific line numbers.

    Please note that THE EDIT COMMAND REQUIRES PROPER INDENTATION.

    Python files will be checked for syntax errors after the edit.
    If you'd like to add the line '        print(x)' you must fully write
    that out, with all those spaces before the code!

    If the system detects a syntax error, the edit will not be executed.
    Simply try to edit the file again, but make sure to read the error message
    and modify the edit command you issue accordingly. Issuing the same command
    a second time will just lead to the same error message again.

    Raises:
        - FileNotFoundError: If the file does not exist.
        - PermissionError: If the user does not have permission to edit the file.
        - OSError: If an OS-specific error occurs.
    Note:
        This action edits a specific part of the file, if you want to rewrite the
        complete file, use `write` tool instead.
    """

    _display_name = "Edit a file"
    _request_schema = EditFileRequest
    _response_schema = EditFileResponse

    def execute_on_file_manager(
        self,
        file_manager: FileManager,
        request_data: EditFileRequest,  # type: ignore
    ) -> EditFileResponse:
        try:
            file = (
                file_manager.recent
                if request_data.file_path is None
                else file_manager.open(
                    path=request_data.file_path,
                )
            )
            response = file.write_and_run_lint(
                text=request_data.text,
                start=request_data.start_line,
                end=request_data.end_line,
            )
            return EditFileResponse(
                old_text=response["replaced_text"],
                updated_text=response["replaced_with"],
            )
        except FileNotFoundError as e:
            return EditFileResponse(error=f"File not found: {str(e)}")
        except PermissionError as e:
            return EditFileResponse(error=f"Permission denied: {str(e)}")
        except OSError as e:
            return EditFileResponse(error=f"OS error occurred: {str(e)}")
