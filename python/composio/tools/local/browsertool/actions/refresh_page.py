"""
Action for refreshing the current page in the browser.
"""

from pydantic import Field
from typing import Optional

from composio.tools.local.browsertool.actions.base_action import BaseBrowserAction, BaseBrowserRequest, BaseBrowserResponse
from composio.tools.env.browsermanager.manager import BrowserManager
from composio.tools.env.browsermanager.browser import BrowserError


class RefreshPageRequest(BaseBrowserRequest):
    """Request schema for refreshing the current page."""
    ignore_cache: bool = Field(default=False, description="If True, the browser cache will be ignored when refreshing the page")


class RefreshPageResponse(BaseBrowserResponse):
    """Response schema for refreshing the current page."""
    success: bool = Field(default=False, description="Whether the refresh action was successful")
    previous_url: Optional[str] = Field(default=None, description="URL before refreshing the page")
    new_url: Optional[str] = Field(default=None, description="URL after refreshing the page, if different from previous")


class RefreshPage(BaseBrowserAction):
    """Refresh the current page in the browser."""

    _display_name = "Refresh Current Page"
    _description = "Refreshes the current page in the browser, with an option to ignore cache."
    _tags = ["browser", "refresh", "reload", "cache"]
    _request_schema = RefreshPageRequest
    _response_schema = RefreshPageResponse
    _tag = "browser"
    _tool_name = "browsertool"
    
    def execute_on_browser_manager(
        self,
        browser_manager: BrowserManager,
        request_data: RefreshPageRequest
    ) -> RefreshPageResponse:
        """Execute the refresh page action."""
        previous_url = browser_manager.browser.current_url
        browser_manager.refresh(ignore_cache=request_data.ignore_cache)
        new_url = browser_manager.browser.current_url            
        return RefreshPageResponse(
            success=True,
            previous_url=previous_url,
            new_url=new_url if new_url != previous_url else None,
            current_url=new_url
        )