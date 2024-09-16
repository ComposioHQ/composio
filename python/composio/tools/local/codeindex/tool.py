"""
File I/O tool for Composio.
"""

import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import CreateIndex, IndexStatus, SearchCodebase


class CodeIndexTool(LocalTool, autoload=True):
    """Code index tool."""

    logo = "https://raw.githubusercontent.com/ComposioHQ/composio/master/python/docs/imgs/logos/codemap.png"

    @classmethod
    def actions(cls) -> t.List[t.Type[LocalAction]]:
        """Return the list of actions."""
        return [CreateIndex, IndexStatus, SearchCodebase]
