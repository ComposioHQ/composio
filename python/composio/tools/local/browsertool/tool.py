"""
Browser tool for Composio.
"""

import typing as t

from composio.tools.local.base import Action, Tool

class BrowserTool(Tool):
    """Browser tool for local usage."""

    def actions(self) -> t.List[t.Type[Action]]:
        """Return the list of actions."""
        return []

    def triggers(self) -> t.List:
        """Return the list of triggers."""
        return []
