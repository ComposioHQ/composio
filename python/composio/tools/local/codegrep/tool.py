"""
Code grep tool for Composio.
"""

import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import SearchCodebase


class CodeGrepTool(LocalTool, autoload=True):
    """Code Grep tool."""

    @classmethod
    def actions(cls) -> t.List[t.Type[LocalAction]]:
        """Return the list of actions."""
        return [SearchCodebase]
