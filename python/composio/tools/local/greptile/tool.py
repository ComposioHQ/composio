import typing as t

from composio.tools.local.base import Action, Tool

from .actions import CodeQuery


class Greptile(Tool):
    """
    Code understanding tool. Index Code and answer questions about it.
    """

    def actions(self) -> list[t.Type[Action]]:
        return [CodeQuery]

    def triggers(self) -> list:
        return []
