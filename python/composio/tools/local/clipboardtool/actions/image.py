"""Image clipboard actions."""

import base64
import logging
import os
import tempfile
import typing as t
from pathlib import Path

from PIL import Image
from pydantic import ConfigDict, Field

from composio.tools.base.local import LocalAction
from composio.tools.local.clipboardtool.actions.base_action import (
    BaseClipboardRequest,
    BaseClipboardResponse,
    get_clipboard_state,
)


logger = logging.getLogger(__name__)


class CopyImageRequest(BaseClipboardRequest):
    """Request to copy image to clipboard."""

    model_config = ConfigDict(arbitrary_types_allowed=True)
    image_path: str = Field(
        default=...,
        description="Path to image file to copy to clipboard",
    )


class CopyImageResponse(BaseClipboardResponse):
    """Response from copying image to clipboard."""


class PasteImageRequest(BaseClipboardRequest):
    """Request to paste image from clipboard."""

    save_path: str = Field(
        ...,
        description="Path to save the pasted image to",
    )


class PasteImageResponse(BaseClipboardResponse):
    """Response from pasting image from clipboard."""

    image_path: str = Field(
        default="",
        description="Path to the saved image file",
    )


class CopyImage(LocalAction[CopyImageRequest, CopyImageResponse]):
    """Copy image to clipboard."""

    def execute(self, request: CopyImageRequest, metadata: t.Dict) -> CopyImageResponse:
        """Execute the action."""
        try:
            logger.debug(f"Checking if image exists at {request.image_path}")
            # Validate image exists
            if not os.path.exists(request.image_path):
                logger.error(f"Image not found at {request.image_path}")
                return CopyImageResponse(
                    error="Image file not found",
                )

            logger.debug(f"Opening image from {request.image_path}")
            # Store image data in clipboard state
            image = Image.open(request.image_path)
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
            temp_path = temp_file.name
            temp_file.close()

            logger.debug(f"Saving temp file to {temp_path}")
            image.save(temp_path)  # PIL needs a file to copy to clipboard

            logger.debug("Reading temp file")
            with open(temp_path, "rb") as f:
                data = f.read()
            logger.debug("Cleaning up temp file")
            Path(temp_path).unlink()  # Clean up temp file

            logger.debug("Storing data in clipboard state")
            clipboard_state = get_clipboard_state(metadata)
            clipboard_state["image_data"] = base64.b64encode(data).decode()

            return CopyImageResponse(message="Image copied to clipboard successfully")
        except Exception as e:
            logger.exception(f"Error occurred: {str(e)}")
            return CopyImageResponse(error=f"Failed to copy image: {str(e)}")


class PasteImage(LocalAction[PasteImageRequest, PasteImageResponse]):
    """Paste image from clipboard."""

    def execute(
        self, request: PasteImageRequest, metadata: t.Dict
    ) -> PasteImageResponse:
        """Execute the action."""
        try:
            clipboard_state = get_clipboard_state(metadata)
            image_data = clipboard_state.get("image_data")

            if not image_data:
                logger.warning("No valid image found in clipboard")
                return PasteImageResponse(
                    error="No valid image found in clipboard",
                    image_path="",
                )

            # Create destination directory if needed
            os.makedirs(os.path.dirname(request.save_path), exist_ok=True)

            # Decode and save image
            data = base64.b64decode(image_data)
            with open(request.save_path, "wb") as f:
                f.write(data)

            logger.debug(f"Image saved to {request.save_path}")
            return PasteImageResponse(
                message="Image pasted from clipboard successfully",
                image_path=request.save_path,
            )
        except Exception as e:
            logger.exception(f"Failed to paste image: {str(e)}")
            return PasteImageResponse(
                error=f"Failed to paste image: {str(e)}",
                image_path="",
            )
