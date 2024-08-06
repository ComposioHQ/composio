import threading
import typing as t
from pathlib import Path

from composio.tools.env.base import Sessionable
from composio.tools.env.browsermanager.browser import Browser, BrowserError
from composio.tools.env.id import generate_id


_active_manager: t.Optional["BrowserManager"] = None
_manager_lock = threading.Lock()


def set_current_browser_manager(manager: t.Optional["BrowserManager"]) -> None:
    """Set value for current browser manager."""
    with _manager_lock:
        global _active_manager
        _active_manager = manager


def get_current_browser_manager() -> t.Optional["BrowserManager"]:
    """Get active browser manager."""
    with _manager_lock:
        return _active_manager


class BrowserManager(Sessionable):  # pylint: disable=too-many-public-methods
    """Browser manager implementation for agent workspaces."""

    def __init__(self, headless: bool = True) -> None:
        """Initialize browser manager."""
        super().__init__()
        self._id = generate_id()
        self.browser = Browser(headless=headless)
        self.headless = headless
        self.browser.setup()

    def setup(self) -> None:
        """Setup browser manager."""

    def teardown(self) -> None:
        """Teardown a browser manager."""

    def __enter__(self) -> "BrowserManager":
        """Enter browser manager context."""
        active_manager = get_current_browser_manager()
        if active_manager is not None and active_manager.id != self.id:
            raise RuntimeError("Another manager already activated via context.")
        try:
            set_current_browser_manager(manager=self)
        except Exception as e:
            self.logger.error(f"Failed to set up browser: {str(e)}")
            set_current_browser_manager(manager=None)
            raise
        return self

    def __exit__(self, *args: t.Any, **kwargs: t.Any) -> None:
        """Exit from browser manager context."""
        try:
            self.browser.cleanup()
        except BrowserError as e:
            self.logger.error(f"Failed to clean up browser: {str(e)}")
        finally:
            set_current_browser_manager(manager=None)

    def goto(self, url: str, timeout: int = 60000) -> None:
        """Navigate to a specific URL."""
        try:
            self.browser.goto(url, timeout=timeout)
        except BrowserError as e:
            self.logger.error(f"Failed to navigate to {url}: {str(e)}")
            raise

    def get_current_url(self) -> str:
        """Get the current URL."""
        try:
            if self.browser.page is not None:
                return self.browser.page.url
            raise BrowserError("Failed to get current URL: No current URL found.")
        except BrowserError as e:
            self.logger.error(f"Failed to get current URL: {str(e)}")
            raise

    def get_page_viewport(self) -> t.Optional[t.Dict[str, int]]:
        """Get the viewport of the current page."""
        try:
            viewport = self.browser.get_page_viewport()
            return viewport
        except BrowserError as e:
            self.logger.error(f"Failed to get page viewport: {str(e)}")
            raise BrowserError(f"Failed to get page viewport: {str(e)}") from e

    def back(self) -> None:
        """Navigate back in browser history."""
        try:
            self.browser.back()
        except BrowserError as e:
            self.logger.error(f"Failed to navigate back: {str(e)}")
            raise

    def forward(self) -> None:
        """Navigate forward in browser history."""
        try:
            self.browser.forward()
        except BrowserError as e:
            self.logger.error(f"Failed to navigate forward: {str(e)}")
            raise

    def refresh(self, ignore_cache: bool = False) -> None:
        """Reload the current page."""
        try:
            self.browser.refresh(ignore_cache=ignore_cache)
        except BrowserError as e:
            self.logger.error(f"Failed to refresh page: {str(e)}")
            raise

    # def get_content(self) -> str:
    #     """Get the current page's HTML content."""
    #     try:
    #         return self.browser.get_content()
    #     except BrowserError as e:
    #         self.logger.error(f"Failed to get page content: {str(e)}")
    #         raise

    def find_element(self, selector: str, selector_type: str = "css"):
        """Find an element on the page."""
        try:
            return self.browser.find_element(selector, selector_type)
        except BrowserError as e:
            self.logger.error(
                f"Failed to find element with selector '{selector}': {str(e)}"
            )
            raise

    def click(self, selector: str, selector_type: str = "css") -> None:
        """Click on an element."""
        try:
            self.browser.click(selector, selector_type)
        except BrowserError as e:
            self.logger.error(
                f"Failed to click element with selector '{selector}': {str(e)}"
            )
            raise

    def type(self, selector: str, text: str, selector_type: str = "css") -> None:
        """Type text into an input field."""
        try:
            self.browser.type(selector, text, selector_type)
        except BrowserError as e:
            self.logger.error(
                f"Failed to type text into element with selector '{selector}': {str(e)}"
            )
            raise

    def clear(self, selector: str, selector_type: str = "css") -> None:
        """Clear the text from an input field."""
        try:
            self.browser.clear(selector, selector_type)
        except BrowserError as e:
            self.logger.error(
                f"Failed to clear text from element with selector '{selector}': {str(e)}"
            )
            raise

    # def select(self, selector: str, value: str) -> None:
    #     """Select an option from a dropdown."""
    #     try:
    #         self.browser.select(selector, value)
    #     except BrowserError as e:
    #         self.logger.error(
    #             f"Failed to select option '{value}' from element with selector '{selector}': {str(e)}"
    #         )
    #         raise

    def scroll(self, direction: str, amount: int) -> None:
        """Scroll the page."""
        try:
            self.browser.scroll(direction, amount)
        except BrowserError as e:
            self.logger.error(
                f"Failed to scroll {direction} by {amount} pixels: {str(e)}"
            )
            raise

    def scroll_to_element(self, selector: str, selector_type: str = "css") -> None:
        """Scroll to a specific element."""
        try:
            self.browser.scroll_to_element(selector, selector_type)
        except BrowserError as e:
            self.logger.error(
                f"Failed to scroll to element with selector '{selector}': {str(e)}"
            )
            raise

    # def new_tab(self) -> None:
    #     """Open a new tab."""
    #     try:
    #         self.browser.new_tab()
    #     except BrowserError as e:
    #         self.logger.error(f"Failed to open new tab: {str(e)}")
    #         raise

    # def switch_tab(self, index: int) -> None:
    #     """Switch between tabs."""
    #     try:
    #         self.browser.switch_tab(index)
    #     except BrowserError as e:
    #         self.logger.error(f"Failed to switch to tab at index {index}: {str(e)}")
    #         raise

    # def close_tab(self) -> None:
    #     """Close the current tab."""
    #     try:
    #         self.browser.close_tab()
    #     except BrowserError as e:
    #         self.logger.error(f"Failed to close current tab: {str(e)}")
    #         raise

    def take_screenshot(self, path: Path, full_page: bool = True) -> None:
        """Capture a screenshot of the current page."""
        try:
            self.browser.take_screenshot(path, full_page=full_page)
        except BrowserError as e:
            self.logger.error(f"Failed to take screenshot and save to {path}: {str(e)}")
            raise

    def press_key(self, key: str) -> None:
        """Press a key on the keyboard."""
        try:
            self.browser.press_key(key)
        except BrowserError as e:
            self.logger.error(f"Failed to press key '{key}': {str(e)}")
            raise

    def execute_script(self, script: str, *args) -> t.Any:
        """Execute a custom JavaScript script."""
        try:
            return self.browser.execute_script(script, *args)
        except BrowserError as e:
            self.logger.error(f"Failed to execute script: {str(e)}")
            raise

    def get_element_attribute(
        self, selector: str, attribute: str, selector_type: str = "css"
    ) -> t.Optional[str]:
        """Get the value of an attribute for a specific element."""
        try:
            return self.browser.get_element_attribute(
                selector, attribute, selector_type
            )
        except BrowserError as e:
            self.logger.error(
                f"Failed to get attribute '{attribute}' for element with selector '{selector}': {str(e)}"
            )
            raise

    def get_element_text(
        self, selector: str, selector_type: str = "css"
    ) -> t.Optional[str]:
        """Get the text content of a specific element."""
        try:
            return self.browser.get_element_text(selector, selector_type)
        except BrowserError as e:
            self.logger.error(
                f"Failed to get text for element with selector '{selector}': {str(e)}"
            )
            raise

    def get_page_details(self) -> t.Dict[str, t.Any]:
        """Get the details of the current page."""
        try:
            return self.browser.get_page_details()
        except BrowserError as e:
            self.logger.error(f"Failed to get page details: {str(e)}")
            raise

    def __str__(self) -> str:
        """String representation of the BrowserManager."""
        return f"BrowserManager(id={self.id}, browser={self.browser})"

    def cleanup(self) -> None:
        """Clean up resources."""
        try:
            self.browser.cleanup()
        except BrowserError as e:
            self.logger.error(f"Failed to clean up browser: {str(e)}")
        finally:
            set_current_browser_manager(manager=None)
