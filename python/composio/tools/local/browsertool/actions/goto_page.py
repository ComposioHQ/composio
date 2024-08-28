"""
Action for navigating to a webpage.
"""

from pydantic import Field

from composio.tools.env.browsermanager.manager import BrowserManager
from composio.tools.local.browsertool.actions.base_action import (
    BaseBrowserAction,
    BaseBrowserRequest,
    BaseBrowserResponse,
)


class GotoPageRequest(BaseBrowserRequest):
    """Request schema for navigating to a webpage."""

    url: str = Field(
        ...,
        description="Full URL of the webpage to navigate to, including the protocol (e.g., 'https://www.example.com')",
    )
    timeout: int = Field(
        default=30000,
        description="Maximum time to wait for navigation to complete (in milliseconds)",
    )


class GotoPageResponse(BaseBrowserResponse):
    """Response schema for navigating to a webpage."""

    message: str = Field(
        default="Navigated to the specified webpage.",
        description="Message indicating the result of the navigation action",
    )


class GotoPage(BaseBrowserAction[GotoPageRequest, GotoPageResponse]):
    """
    Navigate to a specified webpage.

    This action allows the browser to load and display a given URL.

    The action takes a URL and an optional timeout as input parameters.
    """

    display_name = "GotoPage"
    _request_schema = GotoPageRequest
    _response_schema = GotoPageResponse

    def execute_on_browser_manager(
        self, browser_manager: BrowserManager, request: GotoPageRequest  # type: ignore
    ) -> GotoPageResponse:
        """Execute the navigation action."""
        browser_manager.goto(request.url, request.timeout)
        return GotoPageResponse(message="Navigated to the specified webpage.")
