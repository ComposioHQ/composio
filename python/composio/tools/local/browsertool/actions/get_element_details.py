"""
Action for getting details of an element on a webpage.
"""

from enum import Enum
from pydantic import Field
from typing import Optional, Dict, Any

from composio.tools.local.browsertool.actions.base_action import BaseBrowserAction, BaseBrowserRequest, BaseBrowserResponse, SelectorType
from composio.tools.env.browsermanager.manager import BrowserManager


class GetElementDetailsRequest(BaseBrowserRequest):
    """Request schema for getting element details."""

    selector: str = Field(..., description="Selector of the element to get details for")
    selector_type: SelectorType = Field(default=SelectorType.CSS, description="Type of selector to use")
    timeout: Optional[float] = Field(default=None, description="Maximum time to wait for the element to be found (in seconds)")


class GetElementDetailsResponse(BaseBrowserResponse):
    """Response schema for getting element details."""

    success: bool = Field(default=False, description="Whether the action was successful")
    element_found: bool = Field(default=False, description="Whether the element was found on the page")
    details: Dict[str, Any] = Field(default_factory=dict, description="Details of the found element")


class GetElementDetails(BaseBrowserAction):
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

    _display_name = "GetElementDetails"
    _request_schema = GetElementDetailsRequest
    _response_schema = GetElementDetailsResponse
    
    def execute_on_browser_manager(
        self,
        browser_manager: BrowserManager,
        request_data: GetElementDetailsRequest
    ) -> GetElementDetailsResponse:
        """Execute the get element details action."""
        # Find the element
        element = browser_manager.find_element(request_data.selector, request_data.selector_type.value)
            
        if element is None:
            return GetElementDetailsResponse(success=False, element_found=False)
        
        # Get element details
        details = browser_manager.execute_script("""
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
        """, element)

        return GetElementDetailsResponse(success=True, element_found=True, details=details)
