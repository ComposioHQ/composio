"""
Action for getting details of the current webpage.
"""

from pydantic import Field
from typing import Dict, Any, Optional

from composio.tools.local.browsertool.actions.base_action import BaseBrowserAction, BaseBrowserRequest, BaseBrowserResponse
from composio.tools.env.browsermanager.manager import BrowserManager

class GetPageDetailsRequest(BaseBrowserRequest):
    """Request schema for getting page details."""
    include_accessibility: bool = Field(default=True, description="Whether to include accessibility snapshot")

class GetPageDetailsResponse(BaseBrowserResponse):
    """Response schema for getting page details."""
    details: Optional[Dict[str, Any]] = Field(default=None, description="Details of the current page")
    success: bool = Field(default=False, description="Whether the action was successful")

class GetPageDetails(BaseBrowserAction):
    """Get details of the current webpage."""

    _display_name = "Get Webpage Details"
    _description = "Retrieves various details about the current webpage, including URL, title, and optionally an accessibility snapshot."
    _tags = ["browser", "page", "details", "information", "accessibility"]
    _request_schema = GetPageDetailsRequest
    _response_schema = GetPageDetailsResponse
    _tag = "browser"
    _tool_name = "browsertool"
    
    def execute_on_browser_manager(
        self,
        browser_manager: BrowserManager,
        request_data: GetPageDetailsRequest
    ) -> GetPageDetailsResponse:
        """Execute the get page details action."""
        page_details = browser_manager.get_page_details()
        if not request_data.include_accessibility:
            page_details.pop('page_details', None)
        return GetPageDetailsResponse(success=True, details=page_details)

