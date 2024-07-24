"""
Action for navigating browser history.
"""

from enum import Enum
from typing import Optional
from pydantic import Field

from composio.tools.local.browsertool.actions.base_action import BaseBrowserAction, BaseBrowserRequest, BaseBrowserResponse
from composio.tools.env.browsermanager.manager import BrowserManager
from composio.tools.env.browsermanager.browser import BrowserError


class NavigationDirection(str, Enum):
    BACK = "back"
    FORWARD = "forward"


class NavigateHistoryRequest(BaseBrowserRequest):
    """Request schema for navigating browser history."""

    direction: NavigationDirection = Field(..., description="Direction to navigate: 'back' or 'forward'")
    steps: int = Field(default=1, ge=1, description="Number of steps to navigate in the specified direction")


class NavigateHistoryResponse(BaseBrowserResponse):
    """Response schema for navigating browser history."""
    success: bool = Field(default=False, description="Whether the navigation action was successful")
    previous_url: Optional[str] = Field(default=None, description="URL before navigation")
    message: Optional[str] = Field(default=None, description="Additional information about the navigation result")


class NavigateHistory(BaseBrowserAction):
    """Navigate browser history."""

    _display_name = "Navigate Browser History"
    _description = "Navigates back or forward in the browser history by a specified number of steps."
    _tags = ["browser", "navigation", "history"]
    _request_schema = NavigateHistoryRequest
    _response_schema = NavigateHistoryResponse
    _tag = "browser"
    _tool_name = "browsertool"
    
    def execute_on_browser_manager(
        self,
        browser_manager: BrowserManager,
        request_data: NavigateHistoryRequest
    ) -> NavigateHistoryResponse:
        """Execute the navigate history action."""
        previous_url = browser_manager.browser.current_url
        try:
            navigation_method = browser_manager.back if request_data.direction == NavigationDirection.BACK else browser_manager.forward
            steps_taken = 0
            message = None

            for _ in range(request_data.steps):
                try:
                    navigation_method()
                    steps_taken += 1
                except BrowserError:
                    # Reached the limit of history
                    message = f"Maximum {'backs' if request_data.direction == NavigationDirection.BACK else 'forwards'} reached after {steps_taken} steps"
                    break

            return NavigateHistoryResponse(
                success=True,
                previous_url=previous_url,
                message=message
            )
        except BrowserError as e:
            return NavigateHistoryResponse(
                success=False,
                error=f"Browser error while navigating history: {str(e)}",
                previous_url=previous_url
            )
        except Exception as e:
            return NavigateHistoryResponse(
                success=False,
                error=f"Unexpected error while navigating history: {str(e)}",
                previous_url=previous_url
            )
