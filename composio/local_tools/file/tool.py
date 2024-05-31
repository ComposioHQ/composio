"""
File I/O tool for Composio.
"""

import typing as t

from .actions import ReadFile, WriteFile
from composio.core.local import Tool, Action

class FileTool(Tool):
    """File I/O tool."""

    def actions(self) -> t.List[t.Type[Action]]:
        """Return the list of actions."""
        return [ReadFile, WriteFile]
