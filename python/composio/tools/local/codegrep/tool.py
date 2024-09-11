"""
Code grep tool for Composio.
"""

import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import SearchCodebase


class CodeGrepTool(LocalTool, autoload=True):
    """Code Grep tool."""

    logo = "https://raw.githubusercontent.com/ComposioHQ/composio/master/python/docs/imgs/logos/codegrep.png"

    @classmethod
    def actions(cls) -> t.List[t.Type[LocalAction]]:
        """Return the list of actions."""
        return [SearchCodebase]
