"""
Action for typing text into an element on a webpage.
"""

from pydantic import Field
from typing import Optional

from composio.tools.local.browsertool.actions.base_action import BaseBrowserAction, BaseBrowserRequest, BaseBrowserResponse, SelectorType
from composio.tools.env.browsermanager.manager import BrowserManager
from composio.tools.env.browsermanager.browser import BrowserError, ScrollDirection

class TypeTextRequest(BaseBrowserRequest):
    """Request schema for typing text into an element."""

    selector: str = Field(..., description="Selector of the element to type into")
    selector_type: SelectorType = Field(default=SelectorType.CSS, description="Type of selector to use")
    text: str = Field(..., description="Text to type into the element")
    timeout: Optional[float] = Field(default=None, description="Maximum time to wait for the element to be typeable (in seconds)")
    clear_existing: bool = Field(default=False, description="Whether to clear existing text before typing")

class TypeTextResponse(BaseBrowserResponse):
    """Response schema for typing text into an element."""

    success: bool = Field(default=False, description="Whether the typing action was successful")
    element_found: bool = Field(default=False, description="Whether the element was found on the page")
    text_typed: str = Field(default="", description="The text that was actually typed")
    final_element_value: Optional[str] = Field(default=None, description="The final value of the element after typing")
    is_visible: bool = Field(default=False, description="Whether the element is visible on the page")
    is_enabled: bool = Field(default=False, description="Whether the element is enabled for interaction")

class TypeText(BaseBrowserAction):
    """Type text into an element on the current webpage."""

    _display_name = "Type Text into Webpage Element"
    _description = "Types specified text into a selected element on the current webpage using various selector types."
    _tags = ["browser", "type", "text", "input", "interaction"]
    _request_schema = TypeTextRequest
    _response_schema = TypeTextResponse
    _tag = "browser"
    _tool_name = "browsertool"
    
    def execute_on_browser_manager(
        self,
        browser_manager: BrowserManager,
        request_data: TypeTextRequest
    ) -> TypeTextResponse:
        """Execute the type text action."""
        try:
            # First, check if the element exists
            element = browser_manager.browser.find_element(request_data.selector, request_data.selector_type.value)
            if element is None:
                return TypeTextResponse(success=False, element_found=False, error="Element not found")

            # Check if the element is visible and enabled
            is_visible = browser_manager.browser.execute_script("return arguments[0].offsetParent !== null;", element)
            is_enabled = browser_manager.browser.execute_script("return !arguments[0].disabled;", element)

            if not is_visible or not is_enabled:
                return TypeTextResponse(
                    success=False,
                    element_found=True,
                    is_visible=is_visible,
                    is_enabled=is_enabled,
                    error="Element is not interactable"
                )

            # Scroll the element into view
            browser_manager.browser.scroll_to_element(request_data.selector, request_data.selector_type.value)

            # Clear existing text if requested
            if request_data.clear_existing:
                browser_manager.browser.clear(request_data.selector, request_data.selector_type.value)

            # Attempt to type text into the element
            browser_manager.browser.type(request_data.selector, request_data.text, request_data.selector_type.value)

            # Verify the text was typed correctly
            final_value = browser_manager.browser.get_element_attribute(request_data.selector, "value", request_data.selector_type.value)
            if final_value is None:
                final_value = browser_manager.browser.get_element_text(request_data.selector, request_data.selector_type.value)

            return TypeTextResponse(
                success=True,
                element_found=True,
                text_typed=request_data.text,
                final_element_value=final_value,
                is_visible=is_visible,
                is_enabled=is_enabled
            )
        except BrowserError as e:
            return TypeTextResponse(success=False, element_found=True, error=f"Browser error while typing text: {str(e)}")
        except Exception as e:
            return TypeTextResponse(success=False, element_found=True, error=f"Unexpected error while typing text: {str(e)}")
