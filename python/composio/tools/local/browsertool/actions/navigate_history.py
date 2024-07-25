"""
Action for navigating browser history.
"""

from enum import Enum
from typing import Optional
from pydantic import Field

from composio.tools.local.browsertool.actions.base_action import BaseBrowserAction, BaseBrowserRequest, BaseBrowserResponse
from composio.tools.env.browsermanager.manager import BrowserManager


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
    """
    Navigate browser history.

    This action allows for navigation through the browser's history, either
    backward or forward, for a specified number of steps.
    """

    _display_name = "Navigate History"

    _request_schema = NavigateHistoryRequest
    _response_schema = NavigateHistoryResponse
    
    def execute_on_browser_manager(
        self,
        browser_manager: BrowserManager,
        request_data: NavigateHistoryRequest
    ) -> NavigateHistoryResponse:
        """Execute the navigate history action."""
        previous_url = browser_manager.get_current_url()       
        navigation_method = browser_manager.back if request_data.direction == NavigationDirection.BACK else browser_manager.forward
        steps_taken = 0
        message = None

        for _ in range(request_data.steps):
            try:
                navigation_method()
                steps_taken += 1
            except Exception:
                # Reached the limit of history
                message = f"Maximum {'backs' if request_data.direction == NavigationDirection.BACK else 'forwards'} reached after {steps_taken} steps"
                break

        return NavigateHistoryResponse(
            success=True,
            previous_url=previous_url,
            message=message
        )