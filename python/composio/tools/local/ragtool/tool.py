import typing as t

from composio.tools.local.base import Action, Tool

from .actions import AddContentToRagTool, RagToolQuery


class RagTool(Tool):
    """Rag Tool"""

    def actions(self) -> list[t.Type[Action]]:
        return [RagToolQuery, AddContentToRagTool]

    def triggers(self) -> list:
        return []
