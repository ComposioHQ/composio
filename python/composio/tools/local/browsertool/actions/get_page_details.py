"""
Action for getting details of the current webpage.
"""

from typing import Any, Dict, Optional

from pydantic import Field

from composio.tools.env.browsermanager.manager import BrowserManager
from composio.tools.local.browsertool.actions.base_action import (
    BaseBrowserAction,
    BaseBrowserRequest,
    BaseBrowserResponse,
)


class GetPageDetailsRequest(BaseBrowserRequest):
    """Request schema for getting page details."""

    include_accessibility: bool = Field(
        default=True, description="Whether to include accessibility snapshot"
    )


class GetPageDetailsResponse(BaseBrowserResponse):
    """Response schema for getting page details."""

    details: Optional[Dict[str, Any]] = Field(
        default=None, description="Details of the current page"
    )
    success: bool = Field(
        default=False, description="Whether the action was successful"
    )


class GetPageDetails(BaseBrowserAction[GetPageDetailsRequest, GetPageDetailsResponse]):
    """
    Get details of the current webpage.

    This action retrieves various details about the currently loaded webpage in the browser.
    It can include information such as the page title, URL, meta tags, and optionally,
    an accessibility snapshot.
    """

    display_name = "GetPageDetails"
    _request_schema = GetPageDetailsRequest
    _response_schema = GetPageDetailsResponse

    def execute_on_browser_manager(
        self, browser_manager: BrowserManager, request: GetPageDetailsRequest  # type: ignore
    ) -> GetPageDetailsResponse:
        """Execute the get page details action."""
        page_details = browser_manager.get_page_details()
        if not request.include_accessibility:
            page_details.pop("page_details", None)
        return GetPageDetailsResponse(success=True, details=page_details)
