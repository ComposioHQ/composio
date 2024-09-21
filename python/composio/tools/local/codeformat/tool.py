"""
Code grep tool for Composio.
"""

import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import FormatAndLintCodebase


class CodeFormatTool(LocalTool, autoload=True):
    """Code Format tool."""

    logo = "https://raw.githubusercontent.com/ComposioHQ/composio/master/python/docs/imgs/logos/codeformat.png"

    @classmethod
    def actions(cls) -> t.List[t.Type[LocalAction]]:
        """Return the list of actions."""
        return [FormatAndLintCodebase]
