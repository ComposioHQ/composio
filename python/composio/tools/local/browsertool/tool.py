"""
Browser tool for Composio.
"""

import typing as t
from .actions import GetScreenshot
from composio.tools.local.base import Action, Tool

class BrowserTool(Tool):
    """Browser tool for local usage."""

    def actions(self) -> t.List[t.Type[Action]]:
        """Return the list of actions."""
        return [GetScreenshot]

    def triggers(self) -> t.List:
        """Return the list of triggers."""
        return []
