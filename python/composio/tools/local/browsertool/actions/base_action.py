from abc import ABC, abstractmethod
from typing import Optional, Type, Dict

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
    current_url: Optional[str] = Field(
        default=None,
        description="Current URL of the browser.",
    )
    viewport: Optional[Dict[str, Optional[int]]] = Field(
        default=None,
        description="Current viewport size of the browser window.",
    )
    scroll_position: Optional[Dict[str, Optional[int]]] = Field(
        default=None,
        description="Current scroll position of the page.",
    )
    page_dimensions: Optional[Dict[str, Optional[int]]] = Field(
        default=None,
        description="Total dimensions of the page content.",
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
            current_url = None
            if browser_manager:
                if browser_manager.browser:
                    if browser_manager.browser.page:
                        current_url = browser_manager.browser.page.url
                    else:
                        current_url = browser_manager.browser.current_url
            resp.current_url = current_url
            # Get viewport size
            viewport = browser_manager.browser.get_page_viewport()
            resp.viewport = {k: v or None for k, v in viewport.items()} if viewport else None
            
            # Get scroll position
            scroll_position = browser_manager.browser.page.evaluate("""
                () => ({
                    x: window.pageXOffset,
                    y: window.pageYOffset
                })
            """)
            resp.scroll_position = {k: v or None for k, v in scroll_position.items()} if scroll_position else None
            
            # Get total page dimensions
            page_dimensions = browser_manager.browser.page.evaluate("""
                () => ({
                    width: Math.max(
                        document.body.scrollWidth,
                        document.documentElement.scrollWidth,
                        document.body.offsetWidth,
                        document.documentElement.offsetWidth,
                        document.body.clientWidth,
                        document.documentElement.clientWidth
                    ),
                    height: Math.max(
                        document.body.scrollHeight,
                        document.documentElement.scrollHeight,
                        document.body.offsetHeight,
                        document.documentElement.offsetHeight,
                        document.body.clientHeight,
                        document.documentElement.clientHeight
                    )
                })
            """)
            resp.page_dimensions = {k: v or None for k, v in page_dimensions.items()} if page_dimensions else None
            
            return resp
        except Exception as e:
            error_message = f"An error occurred while executing the browser action: {str(e)}"
            self.logger.error(error_message, exc_info=True)
            current_url = None
            if browser_manager:
                if browser_manager.browser:
                    if browser_manager.browser.page:
                        current_url = browser_manager.browser.page.url
                    else:
                        current_url = browser_manager.browser.current_url
            return self._response_schema(
                error=error_message,
                current_url=current_url,
                viewport=None,
                scroll_position=None,
                page_dimensions=None
            )
