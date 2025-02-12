import random
import string
from abc import abstractmethod
from enum import Enum
from typing import Dict, Optional

from pydantic import BaseModel, Field

from composio.constants import LOCAL_CACHE_DIRECTORY
from composio.tools.base.local import ActionRequest, ActionResponse, LocalAction
from composio.tools.env.browsermanager.manager import BrowserManager


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
    capture_screenshot: bool = Field(
        default=False,
        description="Whether to capture before and after screenshots of page while executing the action.",
    )


class BaseBrowserSelectorRequest(BaseBrowserRequest):
    selector_type: str = Field(
        default="css",
        description="Type of selector to use while interacting with the element. Only `css`, `xpath`, `name`, `tag`, `class`, `id` are supported",
        examples=["css", "xpath", "name", "tag", "class", "id"],
    )
    selector: str = Field(
        ..., description="Selector value of the element to interact with"
    )
    timeout: Optional[float] = Field(
        default=None,
        description="Maximum time to wait for the action to complete (in seconds)",
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
    before_screenshot: Optional[str] = Field(
        default=None,
        description="Path to the screenshot taken before the action was executed.",
    )
    after_screenshot: Optional[str] = Field(
        default=None,
        description="Path to the screenshot taken after the action was executed.",
    )


class BaseBrowserAction(LocalAction[ActionRequest, ActionResponse], abs=True):
    _tool_name: str = "browsertool"

    @abstractmethod
    def execute_on_browser_manager(
        self,
        browser_manager: BrowserManager,
        request: ActionRequest,
    ) -> BaseBrowserResponse:
        pass

    def execute(self, request: ActionRequest, metadata: dict) -> ActionResponse:
        browser_manager = self.browsers.get(request.browser_manager_id)  # type: ignore
        try:
            before_screenshot = None
            after_screenshot = None
            if request.capture_screenshot:  # type: ignore
                before_screenshot = self._take_screenshot(browser_manager, "before")

            resp = self.execute_on_browser_manager(
                browser_manager=browser_manager,
                request=request,
            )
            resp.current_url = browser_manager.get_current_url()

            # Get viewport size
            viewport = browser_manager.get_page_viewport()
            resp.viewport = (
                {k: v or None for k, v in viewport.items()} if viewport else None
            )

            # Get scroll position
            scroll_position = browser_manager.execute_script(
                """
                () => ({
                    x: window.pageXOffset,
                    y: window.pageYOffset
                })
            """
            )
            resp.scroll_position = (
                {k: v or None for k, v in scroll_position.items()}
                if scroll_position
                else None
            )

            # Get total page dimensions
            page_dimensions = browser_manager.execute_script(
                """
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
            """
            )
            resp.page_dimensions = (
                {k: v or None for k, v in page_dimensions.items()}
                if page_dimensions
                else None
            )
            if request.capture_screenshot:  # type: ignore
                after_screenshot = self._take_screenshot(browser_manager, "after")

            resp.before_screenshot = before_screenshot
            resp.after_screenshot = after_screenshot
            return resp  # type: ignore
        except Exception as e:
            error_message = (
                f"An error occurred while executing the browser action: {str(e)}"
            )
            self.logger.error(error_message, exc_info=True)
            return self.response.model(
                error=error_message,  # type: ignore
                current_url=browser_manager.get_current_url(),  # type: ignore
                viewport=None,  # type: ignore
                scroll_position=None,  # type: ignore
                page_dimensions=None,  # type: ignore
                before_screenshot=None,  # type: ignore
                after_screenshot=None,  # type: ignore
            )

    def _take_screenshot(self, browser_manager: BrowserManager, prefix: str) -> str:
        browser_media_dir = LOCAL_CACHE_DIRECTORY / "browser_media"
        browser_media_dir.mkdir(parents=True, exist_ok=True)
        random_string = "".join(random.choices(string.ascii_lowercase, k=6))
        output_path = browser_media_dir / f"{prefix}_screenshot_{random_string}.png"
        browser_manager.take_screenshot(output_path, full_page=True)
        return str(output_path)
