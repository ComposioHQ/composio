from composio.core.local import Tool, Action
from .actions import Calculator
import typing as t

class Mathematical(Tool):
    """
    Mathematical Tools for LLM
    """

    def actions(self) -> list[t.Type[Action]]:
        return [Calculator]

    def triggers(self) -> list:
        return []
