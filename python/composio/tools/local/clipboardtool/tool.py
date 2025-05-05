"""
Clipboard tool for Composio.

This tool provides clipboard operations for text, images, and file paths.
It maintains clipboard state in memory and provides copy/paste functionality
for different types of content.
"""

from typing import List, Type

from composio.client.enums.base import ActionData, add_runtime_action
from composio.tools.base.local import LocalAction, LocalTool

from .actions import (
    CopyFilePaths,
    CopyImage,
    CopyText,
    PasteFilePaths,
    PasteImage,
    PasteText,
)


def register_clipboard_actions() -> None:
    """Register clipboard actions in the Action enum."""
    actions = [
        (CopyText, "Copy text to clipboard"),
        (PasteText, "Paste text from clipboard"),
        (CopyImage, "Copy image to clipboard"),
        (PasteImage, "Paste image from clipboard"),
        (CopyFilePaths, "Copy file paths to clipboard"),
        (PasteFilePaths, "Paste file paths from clipboard"),
    ]

    for action, _ in actions:
        add_runtime_action(
            f"CLIPBOARDTOOL_{action.__name__.upper()}",
            ActionData(
                name=action.__name__,
                app="CLIPBOARDTOOL",
                tags=[],
                no_auth=True,
                is_local=True,
                is_runtime=True,
            ),
        )


# Register actions in Action enum when the module is imported
register_clipboard_actions()


class Clipboardtool(LocalTool, autoload=True):
    """Clipboard tool."""

    logo = "https://raw.githubusercontent.com/ComposioHQ/composio/master/python/docs/imgs/logos/clipboardtool.png"

    @classmethod
    def actions(cls) -> List[Type[LocalAction]]:
        """Return the list of actions."""
        actions: List[Type[LocalAction]] = [
            CopyText,
            PasteText,
            CopyImage,
            PasteImage,
            CopyFilePaths,
            PasteFilePaths,
        ]
        return actions
