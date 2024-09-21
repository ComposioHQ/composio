"""
Action for getting details of an element on a webpage.
"""

from typing import Any, Dict

from pydantic import Field

from composio.tools.env.browsermanager.manager import BrowserManager
from composio.tools.local.browsertool.actions.base_action import (
    BaseBrowserAction,
    BaseBrowserResponse,
    BaseBrowserSelectorRequest,
)


class GetElementDetailsRequest(BaseBrowserSelectorRequest):
    """Request schema for getting element details."""


class GetElementDetailsResponse(BaseBrowserResponse):
    """Response schema for getting element details."""

    success: bool = Field(
        default=False, description="Whether the action was successful"
    )
    element_found: bool = Field(
        default=False, description="Whether the element was found on the page"
    )
    details: Dict[str, Any] = Field(
        default_factory=dict, description="Details of the found element"
    )


class GetElementDetails(
    BaseBrowserAction[GetElementDetailsRequest, GetElementDetailsResponse]
):
    """
    Get details of an element on the current webpage.

    This action performs the following steps:
    1. Locates the specified element using the provided selector and selector type.
    2. If the element is found, retrieves detailed information about it.

    The details retrieved include:
    - Tag name
    - ID
    - Class name
    - Text content
    & more

    This action is useful for:
    - Debugging element issues
    - Extracting detailed information about specific page elements
    - Verifying element properties and attributes
    """

    display_name = "GetElementDetails"
    _request_schema = GetElementDetailsRequest
    _response_schema = GetElementDetailsResponse

    def execute_on_browser_manager(
        self, browser_manager: BrowserManager, request: GetElementDetailsRequest  # type: ignore
    ) -> GetElementDetailsResponse:
        """Execute the get element details action."""
        # Find the element
        element = browser_manager.find_element(request.selector, request.selector_type)

        if element is None:
            return GetElementDetailsResponse(success=False, element_found=False)

        # Get element details
        details = browser_manager.execute_script(
            """
            function getElementDetails(element) {
                const rect = element.getBoundingClientRect();
                return {
                    tagName: element.tagName.toLowerCase(),
                    id: element.id,
                    className: element.className,
                    text: element.textContent.trim(),
                    value: element.value,
                    isVisible: window.getComputedStyle(element).display !== 'none',
                    attributes: Object.fromEntries([...element.attributes].map(attr => [attr.name, attr.value])),
                    position: {
                        x: rect.left,
                        y: rect.top
                    },
                    size: {
                        width: rect.width,
                        height: rect.height
                    }
                };
            }
            return getElementDetails(arguments[0]);
        """,
            element,
        )

        return GetElementDetailsResponse(
            success=True, element_found=True, details=details
        )
