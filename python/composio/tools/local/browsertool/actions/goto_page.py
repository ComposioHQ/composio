"""
Action for navigating to a webpage.
"""

from pydantic import Field

from composio.tools.local.browsertool.actions.base_action import BaseBrowserAction, BaseBrowserRequest, BaseBrowserResponse
from composio.tools.env.browsermanager.manager import BrowserManager

class GotoPageRequest(BaseBrowserRequest):
    """Request schema for navigating to a webpage."""

    url: str = Field(..., description="Full URL of the webpage to navigate to, including the protocol (e.g., 'https://www.example.com')")
    timeout: int = Field(default=30000, description="Maximum time to wait for navigation to complete (in milliseconds)")

class GotoPageResponse(BaseBrowserResponse):
    """Response schema for navigating to a webpage."""
    message: str = Field(default="Navigated to the specified webpage.", description="Message indicating the result of the navigation action")

class GotoPage(BaseBrowserAction):
    """Navigate to a specified webpage."""

    _display_name = "Go to Webpage"
    _description = "Navigates the browser to a specified URL."
    _tags = ["browser", "navigation", "url"]
    _request_schema = GotoPageRequest
    _response_schema = GotoPageResponse
    _tag = "browser"
    _tool_name = "browsertool"
    
    def execute_on_browser_manager(
        self,
        browser_manager: BrowserManager,
        request_data: GotoPageRequest
    ) -> GotoPageResponse:
        """Execute the navigation action."""
        browser_manager.goto(request_data.url,request_data.timeout)
        return GotoPageResponse(message="Navigated to the specified webpage.")
