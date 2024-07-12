"""
Code grep tool for Composio.
"""

import typing as t

from composio.tools.local.base import Action, Tool

from .actions import FormatAndLintCodebase


class CodeFormatTool(Tool):
    """Code Format tool."""

    def actions(self) -> t.List[t.Type[Action]]:
        """Return the list of actions."""
        return [FormatAndLintCodebase]

    def triggers(self) -> t.List:
        """Return the list of triggers."""
        return []
