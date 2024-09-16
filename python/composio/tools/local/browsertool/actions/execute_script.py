"""
Action for executing a custom JavaScript script on a webpage.
"""

from typing import Any, Optional

from pydantic import Field

from composio.tools.env.browsermanager.manager import BrowserManager
from composio.tools.local.browsertool.actions.base_action import (
    BaseBrowserAction,
    BaseBrowserRequest,
    BaseBrowserResponse,
)


class ExecuteScriptRequest(BaseBrowserRequest):
    """Request schema for executing a custom JavaScript script."""

    script: str = Field(..., description="JavaScript code to be executed")
    args: Optional[list] = Field(
        default=None, description="Optional arguments to pass to the script"
    )


class ExecuteScriptResponse(BaseBrowserResponse):
    """Response schema for executing a custom JavaScript script."""

    success: bool = Field(
        default=False, description="Whether the script execution was successful"
    )
    result: Optional[Any] = Field(
        default=None, description="The result of the script execution"
    )


class ExecuteScript(BaseBrowserAction[ExecuteScriptRequest, ExecuteScriptResponse]):
    """
    Execute a custom JavaScript script on the current webpage.

    This action allows you to run arbitrary JavaScript code in the context of the current webpage.

    It can be used for various purposes such as:
    - Extracting data from the page that's not easily accessible through standard selectors
    - Modifying the page content or structure

    Example could be
    () => {
      return document.title;
    }
    """

    display_name = "ExecuteScript"
    _request_schema = ExecuteScriptRequest
    _response_schema = ExecuteScriptResponse

    def execute_on_browser_manager(
        self, browser_manager: BrowserManager, request: ExecuteScriptRequest  # type: ignore
    ) -> ExecuteScriptResponse:
        """Execute the custom JavaScript script."""

        try:
            # Execute the script
            result = browser_manager.execute_script(
                request.script, *(request.args or [])
            )

            return ExecuteScriptResponse(success=True, result=result)
        except Exception as e:
            return ExecuteScriptResponse(
                success=False, error=f"Failed to execute script: {str(e)}"
            )
