"""Virtual browser implementation using Playwright with Chromium."""

import typing as t
from enum import Enum
from pathlib import Path
import random

from playwright.sync_api import sync_playwright, Browser as PlaywrightBrowser, Page, Playwright

from composio.utils.logging import WithLogger


class ScrollDirection(str, Enum):
    UP = "up"
    DOWN = "down"

    def offset(self, amount: int) -> int:
        """Multiply the amount by scroll direction."""
        return amount * (-1 if self.value == "up" else 1)


class BrowserError(Exception):
    """Exception raised for browser-related errors."""
    pass


class Browser(WithLogger):
    """Browser object for browser manager using Chromium."""

    def __init__(self, headless: bool = True, window: t.Optional[int] = None) -> None:
        """
        Initialize browser object

        :param headless: Whether to run browser in headless mode.
        :param window: Size of the view window, default is 100.
        """
        super().__init__()
        self.headless = headless
        self.playwright: t.Optional[Playwright] = None
        self.browser: t.Optional[PlaywrightBrowser] = None
        self.page: t.Optional[Page] = None
        self._window = window or 100
        self.user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36"
        ]

    def setup(self) -> None:
        """Set up the Chromium browser."""
        self.playwright = sync_playwright().start()
        user_agent = random.choice(self.user_agents)
        self.browser = self.playwright.chromium.launch(
            headless=self.headless,
            args=[
                f'--user-agent={user_agent}',
                '--disable-blink-features=AutomationControlled'
            ]
        )
        self.page = self.browser.new_page(
            viewport={'width': 1920, 'height': 1080},
            user_agent=user_agent
        )
        self.page.evaluate("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            })
        """)

    def goto(self, url: str) -> None:
        """
        Navigate to a specific URL.

        :param url: URL to navigate to.
        """
        if self.page is None:
            raise BrowserError("Page is not initialized")
        self.page.goto(url, wait_until="networkidle")
        self._add_random_delay()

    def back(self) -> None:
        """Navigate back in browser history."""
        if self.page is None:
            raise BrowserError("Page is not initialized")
        self.page.go_back()
        self._add_random_delay()

    def forward(self) -> None:
        """Navigate forward in browser history."""
        if self.page is None:
            raise BrowserError("Page is not initialized")
        self.page.go_forward()
        self._add_random_delay()

    def refresh(self) -> None:
        """Reload the current page."""
        if self.page is None:
            raise BrowserError("Page is not initialized")
        self.page.reload()
        self._add_random_delay()

    def get_content(self) -> str:
        """Get the current page's HTML content."""
        if self.page is None:
            raise BrowserError("Page is not initialized")
        return self.page.content()

    def find_element(self, selector: str) -> t.Any:
        """
        Find an element on the page.

        :param selector: CSS selector for the element.
        :return: The found element.
        """
        if self.page is None:
            raise BrowserError("Page is not initialized")
        return self.page.query_selector(selector)

    def click(self, selector: str) -> None:
        """
        Click an element on the page.

        :param selector: CSS selector for the element to click.
        """
        if self.page is None:
            raise BrowserError("Page is not initialized")
        self.page.click(selector)
        self._add_random_delay()

    def type(self, selector: str, text: str) -> None:
        """
        Type text into an input field.

        :param selector: CSS selector for the input field.
        :param text: Text to type.
        """
        if self.page is None:
            raise BrowserError("Page is not initialized")
        self.page.fill(selector, text)
        self._add_random_delay()

    def select(self, selector: str, value: str) -> None:
        """
        Select an option from a dropdown.

        :param selector: CSS selector for the dropdown.
        :param value: Value to select.
        """
        if self.page is None:
            raise BrowserError("Page is not initialized")
        self.page.select_option(selector, value)
        self._add_random_delay()

    def scroll(self, direction: ScrollDirection, amount: int) -> None:
        """
        Scroll the page.

        :param direction: Direction to scroll (up or down).
        :param amount: Number of pixels to scroll.
        """
        if self.page is None:
            raise BrowserError("Page is not initialized")
        scroll_amount = direction.offset(amount)
        self.page.evaluate(f"window.scrollBy(0, {scroll_amount})")
        self._add_random_delay()

    def scroll_to_element(self, selector: str) -> None:
        """
        Scroll to a specific element.

        :param selector: CSS selector for the element to scroll to.
        """
        if self.page is None:
            raise BrowserError("Page is not initialized")
        self.page.evaluate(f"document.querySelector('{selector}').scrollIntoView({{behavior: 'smooth'}})")
        self._add_random_delay()

    def new_tab(self) -> None:
        """Open a new tab."""
        if self.browser is None:
            raise BrowserError("Browser is not initialized")
        self.page = self.browser.new_page()

    def switch_tab(self, index: int) -> None:
        """
        Switch between tabs.

        :param index: Index of the tab to switch to.
        """
        if self.browser is None:
            raise BrowserError("Browser is not initialized")
        pages = self.browser.contexts[0].pages
        if 0 <= index < len(pages):
            self.page = pages[index]
        else:
            raise IndexError("Tab index out of range")

    def close_tab(self) -> None:
        """Close the current tab."""
        if self.page is None or self.browser is None:
            raise BrowserError("Page or browser is not initialized")
        self.page.close()
        self.page = self.browser.contexts[0].pages[-1]

    def take_screenshot(self, path: Path) -> None:
        """
        Capture a screenshot of the current page.

        :param path: Path to save the screenshot.
        """
        if self.page is None:
            raise BrowserError("Page is not initialized")
        self.page.screenshot(path=str(path), full_page=True)

    def press_key(self, key: str) -> None:
        """
        Press a key on the keyboard.

        :param key: Key to press.
        """
        if self.page is None:
            raise BrowserError("Page is not initialized")
        self.page.keyboard.press(key)
        self._add_random_delay()

    def execute_script(self, script: str, *args) -> t.Any:
        """
        Execute a custom JavaScript script.

        :param script: JavaScript code to execute.
        :param args: Arguments to pass to the script.
        :return: Result of the script execution.
        """
        if self.page is None:
            raise BrowserError("Page is not initialized")
        return self.page.evaluate(script, *args)

    def __str__(self) -> str:
        """String representation."""
        return f"Browser(type=chromium, headless={self.headless})"

    def cleanup(self) -> None:
        """Clean up resources."""
        if self.browser:
            self.browser.close()
        if self.playwright:
            self.playwright.stop()

    def __enter__(self):
        """Context manager entry."""
        self.setup()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.cleanup()

    def _add_random_delay(self):
        """Add a random delay to mimic human behavior."""
        if self.page is None:
            raise BrowserError("Page is not initialized")
        self.page.wait_for_timeout(random.uniform(500, 2000))
