"""
Action for getting a screenshot of a webpage.
"""

import random
import string
from pathlib import Path

from pydantic import Field

from composio.constants import LOCAL_CACHE_DIRECTORY
from composio.tools.env.browsermanager.manager import BrowserManager
from composio.tools.local.browsertool.actions.base_action import (
    BaseBrowserAction,
    BaseBrowserRequest,
    BaseBrowserResponse,
)


class GetScreenshotRequest(BaseBrowserRequest):
    """Request schema for getting a screenshot."""

    output_path: str = Field(
        default="",
        description="""Optional path to save the screenshot. Preferable is not provide this.
                            If not provided, a default path will be used.
                            Example: '/home/user/screenshot.png'""",
    )
    full_page: bool = Field(
        default=True,
        description="Whether to take a full page screenshot or just the visible area.",
    )


class GetScreenshotResponse(BaseBrowserResponse):
    """Response schema for getting a screenshot."""

    screenshot_path: str = Field(
        default="", description="Path where the screenshot was saved"
    )
    success: bool = Field(
        default=False, description="Whether the screenshot action was successful"
    )


class GetScreenshot(BaseBrowserAction[GetScreenshotRequest, GetScreenshotResponse]):
    """
    Get a screenshot of a webpage.

    If a URL is provided, the page will be newly loaded before taking the screenshot.
    If no URL is provided, the screenshot will be taken of the current open page.
    This action allows capturing a screenshot of a specified webpage or the current page
    in the browser. It can take full-page screenshots or just the visible area.

    If no output path is specified, it generates a random filename in the user's
    .browser_media directory.
    """

    display_name = "GetScreenshot"
    _request_schema = GetScreenshotRequest
    _response_schema = GetScreenshotResponse

    def execute_on_browser_manager(
        self, browser_manager: BrowserManager, request: GetScreenshotRequest  # type: ignore
    ) -> GetScreenshotResponse:
        """Execute the screenshot action."""
        try:
            if not request.output_path or request.output_path == "":
                browser_media_dir = LOCAL_CACHE_DIRECTORY / "browser_media"
                browser_media_dir.mkdir(parents=True, exist_ok=True)
                random_string = "".join(random.choices(string.ascii_lowercase, k=6))
                output_path = browser_media_dir / f"screenshot_{random_string}.png"
            else:
                output_path = Path(request.output_path)
            browser_manager.take_screenshot(output_path, full_page=request.full_page)
            return GetScreenshotResponse(screenshot_path=str(output_path), success=True)
        except Exception as e:
            return GetScreenshotResponse(
                screenshot_path="",
                success=False,
                error=f"Unexpected error while taking screenshot: {str(e)}",
            )
