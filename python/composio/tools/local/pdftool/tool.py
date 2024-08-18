"""
PDF tool for Composio.
"""

import typing as t

from composio.tools.local.base import Action, Tool

from .actions import (
    ExtractText,
    MergePDFs,
    ReplaceText
)


class PDFTool(Tool):
    """PDF tool."""

    def actions(self) -> t.List[t.Type[Action]]:
        """Return the list of actions."""
        return [
            ExtractText,
            MergePDFs,
            ReplaceText
        ]

    def triggers(self) -> t.List:
        """Return the list of triggers."""
        return []
