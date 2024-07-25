import typing as t

from composio.tools.local.base import Action, Tool

from .actions import Calculator


class Mathematical(Tool):
    """
    Mathematical Tools for LLM
    """

    def actions(self) -> list[t.Type[Action]]:
        return [Calculator]

    def triggers(self) -> list:
        return []
