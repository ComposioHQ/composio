"""
File I/O tool for Composio.
"""

import typing as t

from ..tool import Tool, Action
from .actions.read_file import ReadFile
from .actions.write_file import WriteFile

class FileTool(Tool):
    """File I/O tool."""

    def actions(self) -> t.List[t.Type[Action]]:
        """Return the list of actions."""
        return [ReadFile, WriteFile]
