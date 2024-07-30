"""
Action for typing text into an element on a webpage.
"""

from typing import Optional

from pydantic import Field

from composio.tools.env.browsermanager.manager import BrowserManager
from composio.tools.local.browsertool.actions.base_action import (
    BaseBrowserAction,
    BaseBrowserResponse,
    BaseBrowserSelectorRequest,
)


class TypeTextRequest(BaseBrowserSelectorRequest):
    """Request schema for typing text into an element."""

    text: str = Field(..., description="Text to type into the element")
    clear_existing: bool = Field(
        default=False, description="Whether to clear existing text before typing"
    )


class TypeTextResponse(BaseBrowserResponse):
    """Response schema for typing text into an element."""

    success: bool = Field(
        default=False, description="Whether the typing action was successful"
    )
    element_found: bool = Field(
        default=False, description="Whether the element was found on the page"
    )
    text_typed: str = Field(default="", description="The text that was actually typed")
    final_element_value: Optional[str] = Field(
        default=None, description="The final value of the element after typing"
    )
    is_visible: bool = Field(
        default=False, description="Whether the element is visible on the page"
    )
    is_enabled: bool = Field(
        default=False, description="Whether the element is enabled for interaction"
    )


class TypeText(BaseBrowserAction):
    """Type text into an element on the current webpage.

    This action allows typing text into a specified element on the webpage.
    It supports various selector types, timeout options, and the ability to clear existing text.

    The action will:
    1. Find the element using the provided selector
    2. Scroll the element into view
    3. Check if the element is visible and enabled
    4. Clear existing text if requested
    5. Type the specified text into the element

    """

    _display_name = "TypeText"
    _request_schema = TypeTextRequest
    _response_schema = TypeTextResponse

    def execute_on_browser_manager(
        self, browser_manager: BrowserManager, request_data: TypeTextRequest  # type: ignore
    ) -> TypeTextResponse:
        """Execute the type text action."""

        # First, check if the element exists
        element = browser_manager.find_element(
            request_data.selector, request_data.selector_type
        )

        if element is None:
            return TypeTextResponse(
                success=False, element_found=False, error="Element not found"
            )

        # Scroll the element into view
        browser_manager.scroll_to_element(
            request_data.selector, request_data.selector_type
        )

        is_visible = browser_manager.execute_script(
            """
            (el) => {
                if (el) {
                    return (el.offsetWidth > 0 && el.offsetHeight > 0) ? true : false;
                }
                return false;
            }
        """,
            element,
        )

        is_enabled = browser_manager.execute_script(
            """
            (el) => {
                return el ? !el.disabled : false;
            }
        """,
            element,
        )

        if not is_visible or not is_enabled:
            return TypeTextResponse(
                success=False,
                element_found=True,
                is_visible=is_visible,
                is_enabled=is_enabled,
                error="Element is not visible or enabled",
            )

        # Clear existing text if requested
        if request_data.clear_existing:
            browser_manager.clear(request_data.selector, request_data.selector_type)

        # Attempt to type text into the element
        browser_manager.type(
            request_data.selector, request_data.text, request_data.selector_type
        )

        # Verify the text was typed correctly
        final_value = browser_manager.get_element_attribute(
            request_data.selector, "value", request_data.selector_type
        )
        if final_value is None:
            final_value = browser_manager.get_element_text(
                request_data.selector, request_data.selector_type
            )

        return TypeTextResponse(
            success=True,
            element_found=True,
            text_typed=request_data.text,
            final_element_value=final_value,
            is_visible=is_visible,
            is_enabled=is_enabled,
        )
