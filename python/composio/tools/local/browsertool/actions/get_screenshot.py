"""
Action for getting a screenshot of a webpage.
"""

import os
import typing as t
from pydantic import BaseModel
from playwright.sync_api import sync_playwright

from composio.tools.local.base.action import Action


class GetScreenshotRequest(BaseModel):
    """Request schema for getting a screenshot."""

    url: str
    output_path: str


class GetScreenshotResponse(BaseModel):
    """Response schema for getting a screenshot."""

    success: bool
    message: str


class GetScreenshot(Action):
    """Get a screenshot of a webpage."""

    _display_name = "Get Webpage Screenshot"
    _request_schema = GetScreenshotRequest
    _response_schema = GetScreenshotResponse
    _tags = ["browser", "screenshot"]
    _tool_name = "browsertool"

    def execute(
        self,
        request_data: GetScreenshotRequest,
        authorisation_data: dict,
    ) -> GetScreenshotResponse:
        """Execute the screenshot action."""
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.goto(request_data.url)
                page.screenshot(path=request_data.output_path)
                browser.close()

            return GetScreenshotResponse(
                success=True,
                message=f"Screenshot saved to {request_data.output_path}"
            )
        except Exception as e:
            return GetScreenshotResponse(
                success=False,
                message=f"Failed to get screenshot: {str(e)}"
            )
