"""
Code grep tool for Composio.
"""

import typing as t

from composio.tools.local.base import Action, Tool

from .actions import SearchCodebase


class CodeGrepTool(Tool):
    """Code Grep tool."""

    def actions(self) -> t.List[t.Type[Action]]:
        """Return the list of actions."""
        return [SearchCodebase]

    def triggers(self) -> t.List:
        """Return the list of triggers."""
        return []
