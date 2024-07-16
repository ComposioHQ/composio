from composio.tools.env.base import Workspace
from composio.tools.local.base.action import Action

from pydantic import BaseModel, Field
import typing as t


class EditFileRequest(BaseModel):
    """Request to edit a file."""

    start_line: int = Field(
        ..., description="The line number at which the file edit will start"
    )
    end_line: int = Field(
        ..., description="The line number at which the file edit will end (inclusive)."
    )
    text: str = Field(
        ...,
        description="The text that will replace the specified line range in the file.",
    )
    file_path: str = Field(
        default=None,
        description="""The path to the file that will be edited. 
        If not provided, THE CURRENTLY OPEN FILE will be edited.
        If provided, the file at the provided path will be OPENED 
        and edited, changing the opened file.""",
    )


class EditFileResponse(BaseModel):
    """Response to edit a file."""

    updated_changes: str = Field(
        default=None,
        description="The updated changes. If the file was not edited, the original file will be returned.",
    )
    error: str = Field(default="", description="Error message if any")


class EditFile(Action):
    """
    Please note that THE EDIT COMMAND REQUIRES PROPER INDENTATION.

    Python files will be checked for syntax errors after the edit.
    If you'd like to add the line '        print(x)' you must fully write that out,
    with all those spaces before the code!
    If the system detects a syntax error, the edit will not be executed.
    Simply try to edit the file again, but make sure to read the error message and modify the edit command you issue accordingly.
    Issuing the same command a second time will just lead to the same error message again.

    Raises:
        - FileNotFoundError: If the file does not exist.
        - PermissionError: If the user does not have permission to edit the file.
        - OSError: If an OS-specific error occurs.
    """

    _display_name = "Edit a file"
    _tool_name = "filemanagertool"
    _request_schema = EditFileRequest
    _response_schema = EditFileResponse

    def execute(
        self, request_data: EditFileRequest, authorisation_data: dict
    ) -> EditFileResponse:
        workspace = t.cast(Workspace, authorisation_data["workspace"])
        try:
            if request_data.file_path is None:
                file = workspace.file_manager._recent
            else:
                file = workspace.file_manager.open(request_data.file_path)
            if file is None:
                return EditFileResponse(
                    error=f"File {request_data.file_path} not found"
                )
            tr = file.write(
                text=request_data.text,
                start=request_data.start_line,
                end=request_data.end_line,
            )
            if tr["error"]:
                return EditFileResponse(error=tr["error"])
            # TODO: Add lint changes to detect python issues.
            return EditFileResponse(updated_changes=tr["replaced_text"])
        except FileNotFoundError as e:
            return EditFileResponse(error=f"File not found: {str(e)}")
        except PermissionError as e:
            return EditFileResponse(error=f"Permission denied: {str(e)}")
        except OSError as e:
            return EditFileResponse(error=f"OS error occurred: {str(e)}")
