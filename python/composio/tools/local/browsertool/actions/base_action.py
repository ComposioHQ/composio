from abc import ABC, abstractmethod
from typing import Optional, Type

from pydantic import BaseModel, Field

from composio.tools.env.browsermanager.manager import BrowserManager
from composio.tools.local.base import Action
from composio.exceptions import ComposioSDKError
from enum import Enum

class SelectorType(str, Enum):
    CSS = "css"
    XPATH = "xpath"
    ID = "id"
    NAME = "name"
    TAG = "tag"
    CLASS = "class"


class BaseBrowserRequest(BaseModel):
    browser_manager_id: Optional[str] = Field(
        default=None,
        description="ID of the browser manager where the action will be executed. "
        "If not provided, the most recent browser manager will be used.",
    )


class BaseBrowserResponse(BaseModel):
    error: Optional[str] = Field(
        default=None,
        description="Error message if the action failed",
    )
    current_url: str = Field(
        default="",
        description="Current URL of the browser.",
    )


class BaseBrowserAction(Action, ABC):
    _tool_name: str = "browsertool"

    @abstractmethod
    def execute_on_browser_manager(
        self, browser_manager: BrowserManager, request_data: BaseBrowserRequest
    ) -> BaseBrowserResponse:
        pass

    def execute(
        self, request_data: BaseBrowserRequest, authorisation_data: dict
    ) -> BaseBrowserResponse:
        workspace = authorisation_data.get("workspace")
        if not workspace:
            raise ComposioSDKError("Workspace not found in authorisation data")

        browser_managers = workspace.browser_managers
        browser_manager = browser_managers.get(request_data.browser_manager_id)

        if not browser_manager:
            if not browser_managers:
                raise ComposioSDKError("No browser managers available")
            browser_manager = next(iter(browser_managers.values()))

        try:
            resp = self.execute_on_browser_manager(
                browser_manager=browser_manager, request_data=request_data
            )
            resp.current_url = browser_manager.browser.current_url
            return resp
        except Exception as e:
            error_message = f"An error occurred while executing the browser action: {str(e)}"
            self.logger.error(error_message, exc_info=True)
            return self._response_schema(
                error=error_message,
                current_url=browser_manager.browser.current_url if browser_manager and browser_manager.browser else ""
            )
