"""
Browser tool for Composio.
"""

import typing as t

from composio.tools.local.base import Action, Tool

from .actions import (
    ClickElement,
    GetElementDetails,
    GetPageDetails,
    GetScreenshot,
    GotoPage,
    NavigateHistory,
    RefreshPage,
    ScrollPage,
    TypeText,
)


class BrowserTool(Tool):
    """Browser tool for local usage."""

    def actions(self) -> t.List[t.Type[Action]]:
        """Return the list of actions."""
        return [
            GetScreenshot,
            GetPageDetails,
            ClickElement,
            GetElementDetails,
            NavigateHistory,
            RefreshPage,
            ScrollPage,
            TypeText,
            GotoPage,
        ]

    def triggers(self) -> t.List:
        """Return the list of triggers."""
        return []
