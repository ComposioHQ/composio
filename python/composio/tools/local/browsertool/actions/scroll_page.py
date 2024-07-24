"""
Action for scrolling the page in the browser.
"""

from enum import Enum
from pydantic import Field
from typing import Optional

from composio.tools.local.browsertool.actions.base_action import BaseBrowserAction, BaseBrowserRequest, BaseBrowserResponse, SelectorType
from composio.tools.env.browsermanager.manager import BrowserManager
from composio.tools.env.browsermanager.browser import BrowserError, ScrollDirection


class ScrollType(str, Enum):
    PIXELS = "pixels"
    ELEMENT = "element"


class ScrollPageRequest(BaseBrowserRequest):
    """Request schema for scrolling the page."""

    scroll_type: ScrollType = Field(..., description="Type of scroll action: 'pixels' or 'element'")
    direction: ScrollDirection = Field(..., description="Direction to scroll: 'up', 'down', 'left', or 'right'")
    amount: Optional[int] = Field(default=None, description="Number of pixels to scroll (required for 'pixels' scroll type)")
    selector: Optional[str] = Field(default=None, description="Selector of the element to scroll to (required for 'element' scroll type)")
    selector_type: SelectorType = Field(default=SelectorType.CSS, description="Type of selector to use for element scrolling")


class ScrollPageResponse(BaseBrowserResponse):
    """Response schema for scrolling the page."""

    success: bool = Field(default=False, description="Whether the scroll action was successful")
    scrolled_amount: Optional[int] = Field(default=None, description="Amount of pixels scrolled (for 'pixels' scroll type)")
    element_found: Optional[bool] = Field(default=None, description="Whether the target element was found (for 'element' scroll type)")


class ScrollPage(BaseBrowserAction):
    """Scroll the page in the browser."""

    _display_name = "Scroll Page"
    _description = "Scrolls the page in the specified direction by pixels or to a specific element."
    _tags = ["browser", "scroll", "interaction"]
    _request_schema = ScrollPageRequest
    _response_schema = ScrollPageResponse
    _tag = "browser"
    _tool_name = "browsertool"
    
    def execute_on_browser_manager(
        self,
        browser_manager: BrowserManager,
        request_data: ScrollPageRequest
    ) -> ScrollPageResponse:
        """Execute the scroll page action."""
        try:
            if request_data.scroll_type == ScrollType.PIXELS:
                return self._scroll_by_pixels(browser_manager, request_data)
            elif request_data.scroll_type == ScrollType.ELEMENT:
                return self._scroll_to_element(browser_manager, request_data)
            else:
                raise ValueError(f"Invalid scroll type: {request_data.scroll_type}")

        except BrowserError as e:
            return ScrollPageResponse(success=False, error=f"Browser error while scrolling: {str(e)}")
        except Exception as e:
            return ScrollPageResponse(success=False, error=f"Unexpected error while scrolling: {str(e)}")

    def _scroll_by_pixels(self, browser_manager: BrowserManager, request_data: ScrollPageRequest) -> ScrollPageResponse:
        if request_data.amount is None:
            raise ValueError("Amount must be specified for 'pixels' scroll type")
        browser_manager.scroll(request_data.direction, request_data.amount)
        return ScrollPageResponse(success=True, scrolled_amount=request_data.amount)

    def _scroll_to_element(self, browser_manager: BrowserManager, request_data: ScrollPageRequest) -> ScrollPageResponse:
        if request_data.selector is None:
            raise ValueError("Selector must be specified for 'element' scroll type")
        element = browser_manager.find_element(request_data.selector, request_data.selector_type.value)
        if element:
            browser_manager.scroll_to_element(request_data.selector, request_data.selector_type.value)
            return ScrollPageResponse(success=True, element_found=True)
        else:
            return ScrollPageResponse(success=False, element_found=False)