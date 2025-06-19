"""Text clipboard actions."""

import typing as t

from pydantic import Field

from composio.tools.base.local import LocalAction
from composio.tools.local.clipboardtool.actions.base_action import (
    BaseClipboardRequest,
    BaseClipboardResponse,
    get_clipboard_state,
)


class CopyTextRequest(BaseClipboardRequest):
    """Request to copy text to clipboard."""

    text: str = Field(
        ...,
        description="Text to copy to clipboard",
    )


class CopyTextResponse(BaseClipboardResponse):
    """Response from copying text to clipboard."""


class PasteTextRequest(BaseClipboardRequest):
    """Request to paste text from clipboard."""


class PasteTextResponse(BaseClipboardResponse):
    """Response from pasting text from clipboard."""

    text: str = Field(
        default="",
        description="Text pasted from clipboard",
    )


class CopyText(LocalAction[CopyTextRequest, CopyTextResponse]):
    """Copy text to clipboard."""

    def execute(self, request: CopyTextRequest, metadata: t.Dict) -> CopyTextResponse:
        """Execute the action."""
        try:
            # Store text in clipboard state
            clipboard_state = get_clipboard_state(metadata)
            clipboard_state["text_data"] = request.text

            return CopyTextResponse(message="Text copied to clipboard successfully")
        except Exception as e:
            return CopyTextResponse(error=f"Failed to copy text: {str(e)}")


class PasteText(LocalAction[PasteTextRequest, PasteTextResponse]):
    """Paste text from clipboard."""

    def execute(self, request: PasteTextRequest, metadata: t.Dict) -> PasteTextResponse:
        """Execute the action."""
        try:
            clipboard_state = get_clipboard_state(metadata)
            text = clipboard_state.get("text_data", "")

            if not text:
                return PasteTextResponse(
                    error="No text found in clipboard",
                    text="",
                )

            return PasteTextResponse(
                message="Text pasted from clipboard successfully",
                text=text,
            )
        except Exception as e:
            return PasteTextResponse(
                error=f"Failed to paste text: {str(e)}",
                text="",
            )
