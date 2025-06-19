"""File path clipboard actions."""

import os
from typing import Dict, List

from pydantic import Field

from composio.tools.base.local import LocalAction
from composio.tools.local.clipboardtool.actions.base_action import (
    BaseClipboardRequest,
    BaseClipboardResponse,
    get_clipboard_state,
)


class CopyFilePathsRequest(BaseClipboardRequest):
    """Request to copy file paths to clipboard."""

    paths: List[str] = Field(
        ...,
        description="List of file paths to copy to clipboard",
    )


class PasteFilePathsRequest(BaseClipboardRequest):
    """Request to paste file paths from clipboard."""


class PasteFilePathsResponse(BaseClipboardResponse):
    """Response from pasting file paths from clipboard."""

    paths: List[str] = Field(
        default_factory=list,
        description="List of file paths pasted from clipboard",
    )


class CopyFilePaths(LocalAction[CopyFilePathsRequest, BaseClipboardResponse]):
    """Copy file paths to clipboard."""

    def execute(
        self, request: CopyFilePathsRequest, metadata: Dict
    ) -> BaseClipboardResponse:
        """Execute the action."""
        try:
            # Validate paths exist
            valid_paths = [p for p in request.paths if os.path.exists(p)]

            if not valid_paths:
                return BaseClipboardResponse(
                    error="No valid files found to copy",
                )

            # Store paths in clipboard state
            clipboard_state = get_clipboard_state(metadata)
            clipboard_state["file_paths"] = valid_paths

            return BaseClipboardResponse(
                message="File paths copied to clipboard successfully"
            )
        except Exception as e:
            return BaseClipboardResponse(error=f"Failed to copy file paths: {str(e)}")


class PasteFilePaths(LocalAction[PasteFilePathsRequest, PasteFilePathsResponse]):
    """Paste file paths from clipboard."""

    def execute(
        self, request: PasteFilePathsRequest, metadata: Dict
    ) -> PasteFilePathsResponse:
        """Execute the action."""
        try:
            clipboard_state = get_clipboard_state(metadata)
            paths = clipboard_state.get("file_paths", [])

            if not paths:
                return PasteFilePathsResponse(
                    error="No files found in clipboard",
                    paths=[],
                )

            # Validate paths exist
            valid_paths = [p for p in paths if os.path.exists(p)]

            if not valid_paths:
                return PasteFilePathsResponse(
                    error="No valid files found in clipboard",
                    paths=[],
                )

            return PasteFilePathsResponse(
                message="File paths pasted from clipboard successfully",
                paths=valid_paths,
            )
        except Exception as e:
            return PasteFilePathsResponse(
                error=f"Failed to paste file paths: {str(e)}",
                paths=[],
            )
