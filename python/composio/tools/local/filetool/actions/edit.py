from typing import Dict, Optional

from pydantic import Field

from composio.tools.base.local import LocalAction
from composio.tools.local.filetool.actions.base_action import (
    BaseFileRequest,
    BaseFileResponse,
    include_cwd,
)


class EditFileRequest(BaseFileRequest):
    """Request to edit a file."""

    file_path: Optional[str] = Field(
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
        description=(
            "The line number at which the file edit will start (REQUIRED). "
            "Inclusive - the start line will be included in the edit. "
            "If you just want to add code and not replace any line, "
            "don't provide end_line field."
        ),
    )
    end_line: Optional[int] = Field(
        default=None,
        description=(
            "The line number at which the file edit will end (REQUIRED). "
            "Inclusive - the end line will be included in the edit. "
            "If you just want to add code and not replace any line, "
            "don't provide this field."
        ),
    )


class EditFileResponse(BaseFileResponse):
    """Response to edit a file."""

    old_text: Optional[str] = Field(
        default=None,
        description=(
            "The updated changes. If the file was not edited, the original file "
            "will be returned."
        ),
    )
    error: Optional[str] = Field(
        default=None,
        description="Error message if any",
    )
    updated_text: Optional[str] = Field(
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

    If a syntax error is detected, the edit won't be executed. Review the error
    message and modify your edit command accordingly.

    When start and end lines are the same, the new text is inserted at that line,
    preserving the original line's content.

    Ex A: Start=End=1, Text: "print(x)"
    Result: Adds "print(x)" as first line, rest unchanged.

    Ex B: Start=1, End=3, Text: "print(x)"
    Result: Replaces lines 1,2 and 3 with "print(x)", rest unchanged.

    This action edits a specific part of the file, if you want to rewrite the
    complete file, use `write` tool instead."""

    display_name = "Edit a file"

    @include_cwd  # type: ignore
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

            if request.end_line is None:
                request.end_line = -1

            response = file.write_and_run_lint(
                text=request.text,
                start=request.start_line,
                end=request.end_line,
            )
            if response.get("error") and len(response["error"]) > 0:  # type: ignore
                return EditFileResponse(
                    old_text=response["replaced_text"],
                    updated_text=response["replaced_with"],
                    error="No Update, found error: " + response["error"],  # type: ignore
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
