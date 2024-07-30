import re
from typing import List, Dict, Any

from pydantic import Field

from composio.tools.env.filemanager.manager import FileManager
from composio.tools.local.filetool.actions.base_action import (
    BaseFileAction,
    BaseFileRequest,
    BaseFileResponse,
)


class ParsePatchRequest(BaseFileRequest):
    """Request to parse a Git patch."""

    patch: str = Field(..., description="The Git patch to be parsed")


class ParsePatchResponse(BaseFileResponse):
    """Response containing the parsed Git patch."""

    parsed_patch: List[Dict[str, Any]] = Field(
        default=[],
        description="List of dictionaries representing the file changes and hunks",
    )


class ParsePatch(BaseFileAction):
    """
    Parse a Git patch into a structured format.

    This action takes a Git patch as input and returns a structured representation
    of the changes, including file names, hunks, and individual line changes.
    """

    _display_name = "Parse Git Patch"
    _request_schema = ParsePatchRequest
    _response_schema = ParsePatchResponse

    def execute_on_file_manager(
        self,
        file_manager: FileManager,
        request_data: ParsePatchRequest,  # type: ignore
    ) -> ParsePatchResponse:
        try:
            parsed_patch = self._parse_patch(request_data.patch)
            return ParsePatchResponse(parsed_patch=parsed_patch)
        except Exception as e:
            return ParsePatchResponse(
                error=f"Error parsing Git patch: {str(e)}", parsed_patch=[]
            )

    def _parse_patch(self, patch: str) -> List[Dict[str, Any]]:
        """
        Parse a git patch into a structured format.

        Parameters:
            patch (str): The git patch as a string.

        Returns:
            list: A list of dictionaries representing the file changes and hunks.
        """
        file_changes = []
        current_file = None
        current_hunk = None
        deleted_lines = 0
        added_lines = 0

        patch_lines = patch.split("\n")
        for line in patch_lines:
            if line.startswith("diff --git"):
                # Reset for new files
                if current_file:
                    file_changes.append(current_file)
                current_file = {"file": "", "hunks": []}
            elif line.startswith("--- a/"):
                pass
            elif line.startswith("+++ b/"):
                if current_file is not None:
                    current_file["file"] = line[6:]
            elif line.startswith("@@ "):
                if current_file is not None:
                    match = re.match(r"@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@", line)
                    if match:
                        current_hunk = {"start_line": int(match.group(2)), "changes": []}
                        current_file["hunks"].append(current_hunk)
                        deleted_lines = 0
                        added_lines = 0
            elif line.startswith("+") or line.startswith("-"):
                if current_hunk is not None:
                    change_type = "add" if line.startswith("+") else "delete"
                    if change_type == "delete":
                        deleted_lines += 1
                        current_hunk["changes"].append(
                            {
                                "type": change_type,
                                "content": line[1:].strip(),
                                "line": current_hunk["start_line"] - added_lines,
                            }
                        )
                        current_hunk["start_line"] += 1
                    else:
                        added_lines += 1
                        current_hunk["changes"].append(
                            {
                                "type": change_type,
                                "content": line[1:].strip(),
                                "line": current_hunk["start_line"] - deleted_lines,
                            }
                        )
                        current_hunk["start_line"] += 1
            else:
                if current_hunk is not None:
                    current_hunk["start_line"] += 1

        if current_file:
            file_changes.append(current_file)

        return file_changes
