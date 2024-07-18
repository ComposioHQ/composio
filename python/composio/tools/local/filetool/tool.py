"""
File I/O tool for Composio.
"""

import typing as t

from composio.tools.local.base import Action, Tool

from .actions import (
    OpenFile,
    EditFile,
    CreateFile,
    Scroll,
    ListFiles,
    SearchWord,
    FindFile
)


class FileTool(Tool):
    """File I/O tool."""

    def actions(self) -> t.List[t.Type[Action]]:
        """Return the list of actions."""
        return [OpenFile, EditFile, CreateFile, Scroll, ListFiles, SearchWord, FindFile]

    def triggers(self) -> t.List:
        """Return the list of triggers."""
        return []
