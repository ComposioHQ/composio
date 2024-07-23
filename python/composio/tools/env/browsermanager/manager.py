import threading
import typing as t
from pathlib import Path

from composio.tools.env.browsermanager.browser import Browser, ScrollDirection, BrowserError
from composio.utils.logging import WithLogger
from composio.tools.env.id import generate_id
from playwright.sync_api import ElementHandle

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

class BrowserManager(WithLogger):
    """Browser manager implementation for agent workspaces."""

    def __init__(self, headless: bool = True, window: t.Optional[int] = None) -> None:
        """Initialize browser manager."""
        super().__init__()
        self.id = generate_id()
        self.browser = Browser(headless=headless, window=window)
        self.headless = headless
        self.window = window

    def __enter__(self) -> "BrowserManager":
        """Enter browser manager context."""
        active_manager = get_current_browser_manager()
        if active_manager is not None and active_manager.id != self.id:
            raise RuntimeError("Another manager already activated via context.")

        try:
            self.browser.setup()
            set_current_browser_manager(manager=self)
        except Exception as e:
            self.logger.error(f"Failed to set up browser: {str(e)}")
            set_current_browser_manager(manager=None)
            raise
        return self

    def __exit__(self) -> None:
        """Exit from browser manager context."""
        try:
            self.browser.cleanup()
        except BrowserError as e:
            self.logger.error(f"Failed to clean up browser: {str(e)}")
        finally:
            set_current_browser_manager(manager=None)

    def goto(self, url: str) -> None:
        """Navigate to a specific URL."""
        try:
            self.browser.goto(url)
        except BrowserError as e:
            self.logger.error(f"Failed to navigate to {url}: {str(e)}")
            raise

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

    def refresh(self) -> None:
        """Reload the current page."""
        try:
            self.browser.refresh()
        except BrowserError as e:
            self.logger.error(f"Failed to refresh page: {str(e)}")
            raise

    def get_content(self) -> str:
        """Get the current page's HTML content."""
        try:
            return self.browser.get_content()
        except BrowserError as e:
            self.logger.error(f"Failed to get page content: {str(e)}")
            raise

    def find_element(self, selector: str) -> t.Optional[ElementHandle]:
        """Find an element on the page."""
        try:
            return self.browser.find_element(selector)
        except BrowserError as e:
            self.logger.error(f"Failed to find element with selector '{selector}': {str(e)}")
            raise

    def click(self, selector: str) -> None:
        """Click on an element."""
        try:
            self.browser.click(selector)
        except BrowserError as e:
            self.logger.error(f"Failed to click element with selector '{selector}': {str(e)}")
            raise

    def type(self, selector: str, text: str) -> None:
        """Type text into an input field."""
        try:
            self.browser.type(selector, text)
        except BrowserError as e:
            self.logger.error(f"Failed to type text into element with selector '{selector}': {str(e)}")
            raise

    def select(self, selector: str, value: str) -> None:
        """Select an option from a dropdown."""
        try:
            self.browser.select(selector, value)
        except BrowserError as e:
            self.logger.error(f"Failed to select option '{value}' from element with selector '{selector}': {str(e)}")
            raise

    def scroll(self, direction: ScrollDirection, amount: int) -> None:
        """Scroll the page."""
        try:
            self.browser.scroll(direction, amount)
        except BrowserError as e:
            self.logger.error(f"Failed to scroll {direction.value} by {amount} pixels: {str(e)}")
            raise

    def scroll_to_element(self, selector: str) -> None:
        """Scroll to a specific element."""
        try:
            self.browser.scroll_to_element(selector)
        except BrowserError as e:
            self.logger.error(f"Failed to scroll to element with selector '{selector}': {str(e)}")
            raise

    def new_tab(self) -> None:
        """Open a new tab."""
        try:
            self.browser.new_tab()
        except BrowserError as e:
            self.logger.error(f"Failed to open new tab: {str(e)}")
            raise

    def switch_tab(self, index: int) -> None:
        """Switch between tabs."""
        try:
            self.browser.switch_tab(index)
        except BrowserError as e:
            self.logger.error(f"Failed to switch to tab at index {index}: {str(e)}")
            raise

    def close_tab(self) -> None:
        """Close the current tab."""
        try:
            self.browser.close_tab()
        except BrowserError as e:
            self.logger.error(f"Failed to close current tab: {str(e)}")
            raise

    def take_screenshot(self, path: Path) -> None:
        """Capture a screenshot of the current page."""
        try:
            self.browser.take_screenshot(path)
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
