import typing as t

from composio.core.local import Action, Tool

from .actions import ScreenCapture

class System(Tool):
    """
    Mathematical Tools for LLM
    """

    def actions(self) -> list[t.Type[Action]]:
        return [ScreenCapture]

    def triggers(self) -> list:
        return []
