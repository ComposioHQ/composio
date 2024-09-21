from typing import Dict

from pydantic import Field

from composio.tools.base.local import LocalAction
from composio.tools.local.filetool.actions.base_action import (
    BaseFileRequest,
    BaseFileResponse,
    include_cwd,
)


class ChwdirRequest(BaseFileRequest):
    """Request to change the current working directory."""

    path: str = Field(
        ...,
        description="The path to change the current working directory to. "
        "Can be absolute, relative to the current working directory, or use '..' to navigate up the directory tree.",
    )


class ChwdirResponse(BaseFileResponse):
    """Response to change the current working directory."""


class ChangeWorkingDirectory(LocalAction[ChwdirRequest, ChwdirResponse]):
    """
    Changes the current working directory of the file manager to the specified
    path. The commands after this action will be executed in this new directory.

    Can result in:
    - PermissionError: If the user doesn't have permission to access the directory.
    - FileNotFoundError: If the directory or any parent directory does not exist.
    - RuntimeError: If the path cannot be resolved due to a loop or other issues.
    """

    @include_cwd  # type: ignore
    def execute(self, request: ChwdirRequest, metadata: Dict) -> ChwdirResponse:
        try:
            self.filemanagers.get(request.file_manager_id).chdir(request.path)
            return ChwdirResponse()
        except PermissionError as e:
            return ChwdirResponse(error=f"Permission denied: {str(e)}")
        except FileNotFoundError as e:
            return ChwdirResponse(error=f"Directory not found: {str(e)}")
        except RuntimeError as e:
            return ChwdirResponse(error=f"Unable to resolve path: {str(e)}")
        except OSError as e:
            return ChwdirResponse(error=f"Unable to resolve path: {str(e)}")
