"""
Code map tool for Composio.
"""

import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import (
    DeleteRepoMap,
    GenerateRankedTags,
    GetRepoMap,
    GetRepoStructure,
    InitRepoMap,
)


class CodeMapTool(LocalTool, autoload=True):
    """Code Map tool."""

    @classmethod
    def actions(cls) -> t.List[t.Type[LocalAction]]:
        """Return the list of actions."""
        return [
            GenerateRankedTags,
            GetRepoMap,
            InitRepoMap,
            DeleteRepoMap,
            GetRepoStructure,
        ]
