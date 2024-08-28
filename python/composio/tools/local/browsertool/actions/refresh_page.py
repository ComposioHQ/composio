"""
Action for refreshing the current page in the browser.
"""

from typing import Optional

from pydantic import Field

from composio.tools.env.browsermanager.manager import BrowserManager
from composio.tools.local.browsertool.actions.base_action import (
    BaseBrowserAction,
    BaseBrowserRequest,
    BaseBrowserResponse,
)


class RefreshPageRequest(BaseBrowserRequest):
    """Request schema for refreshing the current page."""

    ignore_cache: bool = Field(
        default=False,
        description="If True, the browser cache will be ignored when refreshing the page",
    )


class RefreshPageResponse(BaseBrowserResponse):
    """Response schema for refreshing the current page."""

    success: bool = Field(
        default=False, description="Whether the refresh action was successful"
    )
    previous_url: Optional[str] = Field(
        default=None, description="URL before refreshing the page"
    )
    new_url: Optional[str] = Field(
        default=None,
        description="URL after refreshing the page, if different from previous",
    )


class RefreshPage(BaseBrowserAction[RefreshPageRequest, RefreshPageResponse]):
    """
    Refresh the current page in the browser.

    This action reloads the current page, optionally ignoring the browser cache.
    It inherits from BaseBrowserAction and implements the specific logic for
    refreshing a web page.
    """

    display_name = "RefreshPage"
    _request_schema = RefreshPageRequest
    _response_schema = RefreshPageResponse

    def execute_on_browser_manager(
        self, browser_manager: BrowserManager, request: RefreshPageRequest  # type: ignore
    ) -> RefreshPageResponse:
        """Execute the refresh page action."""
        previous_url = browser_manager.get_current_url()
        browser_manager.refresh(ignore_cache=request.ignore_cache)
        new_url = browser_manager.get_current_url()
        return RefreshPageResponse(
            success=True,
            previous_url=previous_url,
            new_url=new_url if new_url != previous_url else None,
            current_url=new_url,
        )
