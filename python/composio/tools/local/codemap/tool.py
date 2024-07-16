"""
Code map tool for Composio.
"""

import typing as t

from composio.tools.local.base import Action, Tool

from .actions import (
    DeleteRepoMap,
    GenerateRankedTags,
    GetRepoMap,
    GetRepoStructure,
    InitRepoMap,
)


class CodeMapTool(Tool):
    """Code Map tool."""

    def actions(self) -> t.List[t.Type[Action]]:
        """Return the list of actions."""
        return [
            GenerateRankedTags,
            GetRepoMap,
            InitRepoMap,
            DeleteRepoMap,
            GetRepoStructure,
        ]

    def triggers(self) -> t.List:
        """Return the list of triggers."""
        return []
