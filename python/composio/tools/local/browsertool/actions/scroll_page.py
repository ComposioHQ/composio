"""
Action for scrolling the page in the browser.
"""

from typing import Optional

from pydantic import Field

from composio.tools.env.browsermanager.manager import BrowserManager
from composio.tools.local.browsertool.actions.base_action import (
    BaseBrowserAction,
    BaseBrowserResponse,
    BaseBrowserSelectorRequest,
)


class ScrollPageRequest(BaseBrowserSelectorRequest):
    """Request schema for scrolling the page."""

    selector: Optional[str] = Field(
        default=None, description="Selector value of the element to interact with"  # type: ignore
    )
    # overwrite base class due to required field
    scroll_type: str = Field(
        default="pixels", description="Type of scroll action: 'pixels' or 'element'"
    )
    direction: str = Field(
        default="down",
        description="Direction to scroll: 'up', 'down', 'left', or 'right'",
    )
    amount: Optional[int] = Field(
        default=200,
        description="Number of pixels to scroll (required for 'pixels' scroll type)",
    )


class ScrollPageResponse(BaseBrowserResponse):
    """Response schema for scrolling the page."""

    success: bool = Field(
        default=False, description="Whether the scroll action was successful"
    )
    scrolled_amount: Optional[int] = Field(
        default=None, description="Amount of pixels scrolled (for 'pixels' scroll type)"
    )
    element_found: Optional[bool] = Field(
        default=None,
        description="Whether the target element was found (for 'element' scroll type)",
    )


class ScrollPage(BaseBrowserAction[ScrollPageRequest, ScrollPageResponse]):
    """
    Scroll the page in the browser.

    This action allows for scrolling the page either by a specified number of pixels
    or to a specific element on the page. It supports scrolling in four directions:
    up, down, left, and right.

    The scroll behavior is determined by the ScrollPageRequest parameters:
    - scroll_type: Specifies whether to scroll by `pixels` or to an `element`.
    - direction: Indicates the direction to scroll (`up`, `down`, `left`, or `right`).
    - amount: The number of pixels to scroll (used when scroll_type is `pixels`).
    - selector: The selector of the element to scroll to (used when scroll_type is `element`).
    - selector_type: The type of selector to use for finding the element (e.g., css, xpath).
    """

    display_name = "Scroll Page"
    _request_schema = ScrollPageRequest
    _response_schema = ScrollPageResponse

    def execute_on_browser_manager(
        self, browser_manager: BrowserManager, request: ScrollPageRequest  # type: ignore
    ) -> ScrollPageResponse:
        """Execute the scroll page action."""
        if request.scroll_type == "pixels":
            return self._scroll_by_pixels(browser_manager, request)
        if request.scroll_type == "element":
            return self._scroll_to_element(browser_manager, request)
        raise ValueError(f"Invalid scroll type: {request.scroll_type}")

    def _scroll_by_pixels(
        self, browser_manager: BrowserManager, request: ScrollPageRequest
    ) -> ScrollPageResponse:
        if request.amount is None:
            raise ValueError("Amount must be specified for 'pixels' scroll type")
        browser_manager.scroll(request.direction, request.amount)
        return ScrollPageResponse(success=True, scrolled_amount=request.amount)

    def _scroll_to_element(
        self, browser_manager: BrowserManager, request: ScrollPageRequest
    ) -> ScrollPageResponse:
        if request.selector is None:
            raise ValueError("Selector must be specified for 'element' scroll type")
        element = browser_manager.find_element(request.selector, request.selector_type)
        if element:
            browser_manager.scroll_to_element(request.selector, request.selector_type)
            return ScrollPageResponse(success=True, element_found=True)
        return ScrollPageResponse(success=False, element_found=False)
