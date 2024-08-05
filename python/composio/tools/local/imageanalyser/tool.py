"""
Browser tool for Composio.
"""

import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import Analyse


class ImageAnalyser(LocalTool, autoload=True):
    """Image Analyser tool for local usage."""

    @classmethod
    def actions(cls) -> t.List[t.Type[LocalAction]]:
        """Return the list of actions."""
        return [Analyse]
