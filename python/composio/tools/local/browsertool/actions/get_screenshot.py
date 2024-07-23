"""
Action for getting a screenshot of a webpage.
"""

from pathlib import Path
from pydantic import Field
import random
import string
import os

from composio.tools.local.browsertool.actions.base_action import BaseBrowserAction, BaseBrowserRequest, BaseBrowserResponse
from composio.tools.env.browsermanager.manager import BrowserManager


class GetScreenshotRequest(BaseBrowserRequest):
    """Request schema for getting a screenshot."""

    url: str = Field(..., description="Full URL of the webpage to screenshot, including the protocol (e.g., 'https://www.example.com')")
    output_path: str = Field(default="", description="Optional path to save the screenshot. If not provided, a default path will be used. Example: '/path/to/save/screenshot.png'")


class GetScreenshotResponse(BaseBrowserResponse):
    """Response schema for getting a screenshot."""

    screenshot_path: str = Field(default="", description="Path where the screenshot was saved")


class GetScreenshot(BaseBrowserAction):
    """Get a screenshot of a webpage."""

    _display_name = "Get Webpage Screenshot"
    _tags = ["browser", "screenshot"]

    def execute_on_browser_manager(
        self,
        browser_manager: BrowserManager,
        request_data: GetScreenshotRequest
    ) -> GetScreenshotResponse:
        """Execute the screenshot action."""
        response = GetScreenshotResponse()

        try:
            browser_manager.goto(request_data.url)
            if not request_data.output_path:
                home_dir = Path.home()
                browser_media_dir = home_dir / ".browser_media"
                browser_media_dir.mkdir(parents=True, exist_ok=True)
                random_string = ''.join(random.choices(string.ascii_lowercase, k=6))
                output_path = browser_media_dir / f"screenshot_{random_string}.png"
            else:
                output_path = Path(request_data.output_path)
            browser_manager.take_screenshot(output_path)
            response.screenshot_path = str(output_path)
        except Exception as e:
            response.error = f"Failed to get screenshot: {str(e)}"

        return response
