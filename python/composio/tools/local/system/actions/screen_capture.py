from datetime import datetime
from typing import Dict

from pydantic import BaseModel, Field

from composio.constants import LOCAL_CACHE_DIRECTORY
from composio.tools.base.local import LocalAction


class ScreenCaptureRequest(BaseModel):
    pass


class ScreenCaptureResponse(BaseModel):
    file_path: str = Field(..., description="Path where the screenshot was saved")


class ScreenCapture(LocalAction[ScreenCaptureRequest, ScreenCaptureResponse]):
    """
    Useful to capture a screenshot of the current screen.
    """

    display_name = "Capture a screenshot"
    requires = ["pyautogui"]

    def execute(
        self,
        request: ScreenCaptureRequest,
        metadata: Dict,
    ) -> ScreenCaptureResponse:
        # pylint: disable=import-outside-toplevel
        import pyautogui

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_path = LOCAL_CACHE_DIRECTORY / "output" / f"screenshot_{timestamp}.png"
        screenshot = pyautogui.screenshot()
        screenshot.save(file_path)
        return ScreenCaptureResponse(file_path=str(file_path))
