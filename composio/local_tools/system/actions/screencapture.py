from pydantic import BaseModel, Field
from composio.core.local import Action
import pyautogui


class ScreenCaptureRequest(BaseModel):
    file_path: str = Field(..., description="Path to the file to store the screenshot")


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
        file_path = request_data.file_path
        try:
            screenshot = pyautogui.screenshot()
            screenshot.save(file_path)
            execution_details = {"executed": True}
            response_data = {"file_path": file_path}
        except Exception as e:
            execution_details = {"executed": False, "error": str(e)}
            response_data = {}

        return {"execution_details": execution_details, "response_data": response_data}
