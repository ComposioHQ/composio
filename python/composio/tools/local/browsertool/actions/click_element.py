"""
Action for clicking an element on a webpage.
"""

from pydantic import Field
from typing import Optional

from composio.tools.local.browsertool.actions.base_action import BaseBrowserAction, BaseBrowserRequest, BaseBrowserResponse, SelectorType
from composio.tools.env.browsermanager.manager import BrowserManager

class ClickElementRequest(BaseBrowserRequest):
    """Request schema for clicking an element."""

    selector: str = Field(..., description="Selector of the element to click")
    selector_type: SelectorType = Field(default=SelectorType.CSS, description="Type of selector to use")
    timeout: Optional[float] = Field(default=None, description="Maximum time to wait for the element to be clickable (in seconds)")


class ClickElementResponse(BaseBrowserResponse):
    """Response schema for clicking an element."""

    success: bool = Field(default=False, description="Whether the click action was successful")
    element_found: bool = Field(default=False, description="Whether the element was found on the page")
    scrolled_into_view: bool = Field(default=False, description="Whether the element was scrolled into view before clicking")


class ClickElement(BaseBrowserAction):
    """
    Click an element on the current webpage.

    This action performs the following steps:
    1. Locates the specified element using the provided selector and selector type.
    2. Scrolls the element into view to ensure it's visible and clickable.
    3. Attempts to click the element.

    The action handles various scenarios, including:
    - Element not found
    - Unable to scroll to the element
    - Successful click
    """

    _display_name = "ClickElement"
    _request_schema = ClickElementRequest
    _response_schema = ClickElementResponse

    
    def execute_on_browser_manager(
        self,
        browser_manager: BrowserManager,
        request_data: ClickElementRequest
    ) -> ClickElementResponse:
        """Execute the click element action."""
        
        # First, check if the element exists
        element = browser_manager.find_element(request_data.selector, request_data.selector_type.value)

        if element is not None:
            # Scroll the element into view before clicking
            try:
                browser_manager.scroll_to_element(request_data.selector, request_data.selector_type.value)
            except Exception as scroll_error:
                return ClickElementResponse(success=False, element_found=True, scrolled_into_view=False, error=f"Error scrolling to element: {str(scroll_error)}")

            # Now attempt to click the element
            browser_manager.click(request_data.selector, request_data.selector_type.value)
            return ClickElementResponse(success=True, element_found=True, scrolled_into_view=True)
        else:
            return ClickElementResponse(success=False, element_found=False, scrolled_into_view=False, error="Element not found")
