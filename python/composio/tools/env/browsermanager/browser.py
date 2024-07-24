"""Virtual browser implementation using Playwright with Chromium."""

import typing as t
from enum import Enum
from pathlib import Path
import random
from contextlib import contextmanager

from playwright.sync_api import sync_playwright, Browser as PlaywrightBrowser, Page, Playwright

from composio.utils.logging import WithLogger

selector_map = {
    "css": lambda s: s,
    "xpath": lambda s: f"xpath={s}",
    "id": lambda s: f"#{s}",
    "name": lambda s: f"[name='{s}']",
    "tag": lambda s: f"//{s}",
    "class": lambda s: f".{s}"
}

class BrowserError(Exception):
    """Exception raised for browser-related errors."""

class Browser(WithLogger):
    """Browser object for browser manager using Chromium."""

    def __init__(self, headless: bool = True, window_size: t.Tuple[int, int] = (1920, 1080)) -> None:
        """
        Initialize browser object

        :param headless: Whether to run browser in headless mode.
        :param window_size: Size of the browser window as (width, height).
        """
        super().__init__()
        self.headless = headless
        self.window_size = window_size
        self.playwright: t.Optional[Playwright] = None
        self.browser: t.Optional[PlaywrightBrowser] = None
        self.page: t.Optional[Page] = None
        self.user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36"
        ]
        self.current_url: str = ""

    def setup(self) -> None:
        """Set up the Chromium browser."""
        self.playwright = sync_playwright().start()
        user_agent = random.choice(self.user_agents)
        self.browser = self.playwright.chromium.launch(
            headless=self.headless,
            args=self._get_browser_args(user_agent)
        )
        self.page = self.browser.new_page(
            viewport={'width': self.window_size[0], 'height': self.window_size[1]},
            user_agent=user_agent,
            locale='en-US',
            timezone_id='America/New_York',
            geolocation={'latitude': 40.7128, 'longitude': -74.0060},
            permissions=['geolocation']
        )
        self._setup_browser_environment()

        # Navigate to Google.com after setting up the browser
        self.page.goto("https://www.google.com", wait_until="networkidle")
        self.current_url = self.page.url
        self._add_random_delay()

    def _get_browser_args(self, user_agent: str) -> t.List[str]:
        """Get browser launch arguments."""
        return [
            f'--user-agent={user_agent}',
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--lang=en-US,en;q=0.9',
            '--disable-extensions',
            '--mute-audio'
        ]

    def _setup_browser_environment(self) -> None:
        """Set up browser environment to mimic real user."""
        if self.page:
            self.page.evaluate("""
                () => {
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined
                    });
                    Object.defineProperty(navigator, 'languages', {
                        get: () => ['en-US', 'en']
                    });
                    Object.defineProperty(navigator, 'plugins', {
                        get: () => [1, 2, 3, 4, 5]
                    });
                }
            """)

    def _ensure_page_initialized(self) -> Page:
        """Ensure page is initialized before operations."""
        if self.page is None:
            raise BrowserError("Page is not initialized")
        return self.page

    def goto(self, url: str,timeout:int=60000) -> None:
        """Navigate to a specific URL."""
        page = self._ensure_page_initialized()

        # try:
        page.goto(url, wait_until="networkidle",timeout=timeout)
        # except Exception as e:
        #     self.logger.warning(
        #         f"Timeout or error occurred while waiting for networkidle: {str(e)}"
        #     )

        self.current_url = page.url
        self._add_random_delay()

    def get_page_viewport(self) -> t.Dict[str, int]:
        """Get the viewport of the current page."""
        try:
            page = self._ensure_page_initialized()
            viewport = page.viewport_size
            if viewport:
                return viewport # type: ignore
            else:
                raise BrowserError("Failed to get page viewport")
        except BrowserError as e:
            self.logger.error(f"Failed to get page viewport: {str(e)}")
            raise

    def back(self) -> None:
        """Navigate back in browser history."""
        page = self._ensure_page_initialized()
        page.go_back()
        self.current_url = page.url
        self._add_random_delay()

    def forward(self) -> None:
        """Navigate forward in browser history."""
        page = self._ensure_page_initialized()
        page.go_forward()
        self.current_url = page.url
        self._add_random_delay()

    def refresh(self, ignore_cache: bool = False) -> None:
        """
        Reload the current page.

        :param ignore_cache: If True, the page is loaded in a new context to bypass caching.
        """
        page = self._ensure_page_initialized()
        current_url = page.url

        if ignore_cache and self.browser:
            # Create a new context and page
            context = self.browser.new_context()
            new_page = context.new_page()

            # Navigate to the current URL in the new page
            new_page.goto(current_url, wait_until="networkidle", timeout=30000)

            # Close the old page and context
            page.close()
            page.context.close()

            # Update the current page
            self.page = new_page
        else:
            # Regular reload if ignore_cache is False
            page.reload(wait_until="networkidle", timeout=30000)
        page = self._ensure_page_initialized()
        self.current_url = page.url
        self._add_random_delay()

    def get_content(self) -> str:
        """Get the current page's HTML content."""
        page = self._ensure_page_initialized()
        return page.content()

    def find_element(self, selector: str, selector_type: str = "css") -> t.Any:
        """
        Find an element on the page.

        :param selector: Selector for the element.
        :param selector_type: Type of selector (CSS, XPATH, ID, NAME, TAG, CLASS). Defaults to "css".
        :return: The found element.
        """
        page = self._ensure_page_initialized()
        try:

            selector_func = selector_map.get(selector_type.lower())
            if not selector_func:
                raise ValueError(f"Unsupported selector type: {selector_type}")
            return page.query_selector(selector_func(selector))
        except Exception as e:
            raise BrowserError(f"Failed to find element with selector '{selector}': {str(e)}")

    def click(self, selector: str, selector_type: str = "css") -> None:
        """
        Click an element on the page.

        :param selector: Selector for the element to click.
        :param selector_type: Type of selector (CSS, XPATH, ID, NAME, TAG, CLASS).
        """
        page = self._ensure_page_initialized()
        try:
            selector_func = selector_map.get(selector_type.lower())
            if not selector_func:
                raise ValueError(f"Unsupported selector type: {selector_type}")
            element = page.query_selector(selector_func(selector))
            if element:
                element.click()
                self.current_url = page.url
                self._add_random_delay()
            else:
                raise BrowserError(f"Element not found with selector '{selector}'")
        except Exception as e:
            raise BrowserError(f"Failed to click element with selector '{selector}': {str(e)}")

    def type(self, selector: str, text: str, selector_type: str = "css") -> None:
        """
        Type text into an input field.

        :param selector: CSS selector for the input field.
        :param text: Text to type.
        :param selector_type: Type of selector (CSS, XPATH, ID, NAME, TAG, CLASS). Defaults to "css".
        """
        page = self._ensure_page_initialized()
        selector_func = selector_map.get(selector_type.lower())
        if not selector_func:
            raise ValueError(f"Unsupported selector type: {selector_type}")
        page.fill(selector_func(selector), text)
        self._add_random_delay()

    def clear(self, selector: str, selector_type: str = "css") -> None:
        """
        Clear the text from an input field.

        :param selector: CSS selector for the input field.
        :param selector_type: Type of selector (CSS, XPATH, ID, NAME, TAG, CLASS). Defaults to "css".
        """
        page = self._ensure_page_initialized()
        selector_func = selector_map.get(selector_type.lower())
        if not selector_func:
            raise ValueError(f"Unsupported selector type: {selector_type}")
        page.fill(selector_func(selector), "")
        self._add_random_delay()

    def select(self, selector: str, value: str) -> None:
        """
        Select an option from a dropdown.

        :param selector: CSS selector for the dropdown.
        :param value: Value to select.
        """
        page = self._ensure_page_initialized()
        page.select_option(selector, value)
        self._add_random_delay()

    def scroll(self, direction: str, amount: int) -> None:
        """
        Scroll the page.

        :param direction: Direction to scroll ('UP', 'DOWN', 'LEFT', or 'RIGHT').
        :param amount: Number of pixels to scroll.
        """
        page = self._ensure_page_initialized()
        if direction.upper() in ['UP', 'DOWN']:
            scroll_amount = -amount if direction.upper() == 'UP' else amount
            page.evaluate(f"window.scrollBy(0, {scroll_amount})")
        elif direction.upper() in ['LEFT', 'RIGHT']:
            scroll_amount = -amount if direction.upper() == 'LEFT' else amount
            page.evaluate(f"window.scrollBy({scroll_amount}, 0)")
        else:
            raise ValueError(f"Invalid scroll direction: {direction}. Must be 'UP', 'DOWN', 'LEFT', or 'RIGHT'.")
        self._add_random_delay()

    def scroll_to_element(self, selector: str, selector_type: str = "css") -> None:
        """
        Scroll to a specific element.

        :param selector: CSS selector for the element to scroll to.
        """
        page = self._ensure_page_initialized()
        selector_func = selector_map.get(selector_type.lower())
        if not selector_func:
            raise ValueError(f"Unsupported selector type: {selector_type}")
        page.evaluate(f"document.querySelector('{selector_func(selector)}').scrollIntoView({{behavior: 'smooth'}})")
        self._add_random_delay()

    def new_tab(self) -> None:
        """Open a new tab."""
        if self.browser is None:
            raise BrowserError("Browser is not initialized")
        self.page = self.browser.new_page()
        self.current_url = self.page.url

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
            self.current_url = self.page.url
        else:
            raise IndexError("Tab index out of range")

    def close_tab(self) -> None:
        """Close the current tab."""
        page = self._ensure_page_initialized()
        if self.browser is None:
            raise BrowserError("Browser is not initialized")
        page.close()
        self.page = self.browser.contexts[0].pages[-1]
        self.current_url = self.page.url

    def take_screenshot(self, path: Path,full_page:bool=True) -> None:
        """
        Capture a screenshot of the current page.

        :param path: Path to save the screenshot.
        """
        page = self._ensure_page_initialized()
        page.screenshot(path=str(path), full_page=full_page)

    def press_key(self, key: str) -> None:
        """
        Press a key on the keyboard.

        :param key: Key to press.
        """
        page = self._ensure_page_initialized()
        page.keyboard.press(key)
        self._add_random_delay()

    def execute_script(self, script: str, *args) -> t.Any:
        """
        Execute a custom JavaScript script.

        :param script: JavaScript code to execute.
        :param args: Arguments to pass to the script.
        :return: Result of the script execution.
        """
        page = self._ensure_page_initialized()
        return page.evaluate(script, *args)

    def get_element_attribute(self, selector: str, attribute: str, selector_type: str = "css") -> t.Optional[str]:
        """
        Get the value of an attribute for a specific element.

        :param selector: Selector to find the element.
        :param attribute: Name of the attribute to get.
        :param selector_type: Type of selector (default is "css").
        :return: Value of the attribute or None if not found.
        """
        page = self._ensure_page_initialized()
        element = self.find_element(selector, selector_type)
        if element:
            return element.get_attribute(attribute)
        return None

    def get_element_text(self, selector: str, selector_type: str = "css") -> t.Optional[str]:
        """
        Get the text content of a specific element.

        :param selector: Selector to find the element.
        :param selector_type: Type of selector (default is "css").
        :return: Text content of the element or None if not found.
        """
        page = self._ensure_page_initialized()
        element = self.find_element(selector, selector_type)
        if element:
            return element.inner_text()
        return None

    def get_page_details(self,) -> t.Dict[str, t.Any]:
        """Get the details of the current page."""
        page = self._ensure_page_initialized()        
        details={
            "url": page.url,
            "title": page.title(),
            "page_details": page.accessibility.snapshot()
        }
        return details

    def __str__(self) -> str:
        """String representation."""
        return f"Browser(type=chromium, headless={self.headless}, current_url={self.current_url})"

    def cleanup(self) -> None:
        """Clean up resources."""
        if self.browser:
            self.browser.close()
        if self.playwright:
            self.playwright.stop()

    def _add_random_delay(self):
        """Add a random delay to mimic human behavior."""
        page = self._ensure_page_initialized()
        page.wait_for_timeout(random.uniform(100, 600))

    def __enter__(self):
        """Context manager entry."""
        self.setup()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.cleanup()
