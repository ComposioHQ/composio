"""Base classes for clipboard actions."""

from typing import Any, Dict, TypedDict

from pydantic import BaseModel, Field


class ClipboardState(TypedDict, total=False):
    """Type definition for clipboard state."""

    text_data: str
    image_data: str
    file_paths: list[str]


class BaseClipboardRequest(BaseModel):
    """Base request for clipboard actions."""


class BaseClipboardResponse(BaseModel):
    """Base response for clipboard actions."""

    message: str = Field(
        default="",
        description="Message describing the result of the action",
    )
    error: str = Field(
        default="",
        description="Error message if the action failed",
    )


def get_clipboard_state(metadata: Dict[str, Any]) -> ClipboardState:
    """Get clipboard state from metadata.

    Args:
        metadata: The metadata dictionary containing clipboard state

    Returns:
        The clipboard state dictionary, initialized if it doesn't exist
    """
    if "clipboard_state" not in metadata:
        metadata["clipboard_state"] = {}
    return metadata["clipboard_state"]  # type: ignore
