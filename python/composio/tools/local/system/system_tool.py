import typing as t

from composio.tools.local.base import Action, Tool

from .actions import Notify, ScreenCapture


class SystemTools(Tool):
    """
    System Tools for LLM
    """

    def actions(self) -> list[t.Type[Action]]:
        return [ScreenCapture, Notify]

    def triggers(self) -> list:
        return []
