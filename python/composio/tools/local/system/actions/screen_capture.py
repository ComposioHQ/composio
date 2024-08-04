from datetime import datetime

from pydantic import BaseModel, Field

from composio.constants import LOCAL_CACHE_DIRECTORY
from composio.tools.local.base import Action


class ScreenCaptureRequest(BaseModel):
    pass


class ScreenCaptureResponse(BaseModel):
    file_path: str = Field(..., description="Path where the screenshot was saved")


class ScreenCapture(Action[ScreenCaptureRequest, ScreenCaptureResponse]):
    """
    Useful to capture a screenshot of the current screen.
    """

    _display_name = "Capture a screenshot"
    _request_schema = ScreenCaptureRequest
    _response_schema = ScreenCaptureResponse
    _tags = ["utility"]
    _tool_name = "system"

    def execute(
        self, request_data: ScreenCaptureRequest, authorisation_data: dict
    ) -> dict:
        # pylint: disable=import-outside-toplevel
        import pyautogui

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_path = LOCAL_CACHE_DIRECTORY / "output" / f"screenshot_{timestamp}.png"
        try:
            screenshot = pyautogui.screenshot()
            screenshot.save(file_path)
            execution_details = {"executed": True}
            response_data = {"file_path": str(file_path)}
        except Exception as e:
            execution_details = {"executed": False, "error": str(e)}  # type: ignore
            response_data = {}

        return {"execution_details": execution_details, "response_data": response_data}


if __name__ == "__main__":
    ScreenCapture().execute(ScreenCaptureRequest(), {})
