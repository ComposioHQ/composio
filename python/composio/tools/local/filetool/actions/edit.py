from typing import Dict

from pydantic import Field

from composio.tools.base.local import LocalAction
from composio.tools.local.filetool.actions.base_action import (
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
        description="The line number at which the file edit will start (REQUIRED). Inclusive - the start line will be included in the edit.",
    )
    end_line: int = Field(
        ...,
        description="The line number at which the file edit will end (REQUIRED). Inclusive - the end line will be included in the edit.",
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


class EditFile(LocalAction[EditFileRequest, EditFileResponse]):
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

    If start line and end line are the same,
    the new text will be added at the start line &
    text at end line will be still in the new edited file.

    Examples A - Start line == End line
    Start line: 1
    End line: 1
    Text: "print(x)"
    Result: As Start line == End line, print(x) will be added as first line in the file. Rest of the file will be unchanged.

    Examples B - Start line != End line
    Start line: 1
    End line: 3
    Text: "print(x)"
    Result: print(x) will be replaced in the file as first line.
    First and Second line will be removed as end line = 3
    Rest of the file will be unchanged.

    This action edits a specific part of the file, if you want to rewrite the
    complete file, use `write` tool instead."""

    display_name = "Edit a file"

    def execute(self, request: EditFileRequest, metadata: Dict) -> EditFileResponse:
        file_manager = self.filemanagers.get(request.file_manager_id)
        try:
            file = (
                file_manager.recent
                if request.file_path is None
                else file_manager.open(path=request.file_path)
            )

            if file is None:
                raise FileNotFoundError(f"File not found: {request.file_path}")

            response = file.write_and_run_lint(
                text=request.text,
                start=request.start_line,
                end=request.end_line,
            )
            if response.get("error") and len(response["error"]) > 0:  # type: ignore
                return EditFileResponse(
                    error="No Update, found error: " + response["error"]  # type: ignore
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
