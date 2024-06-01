import typing as t
from composio.core.local import Tool, Action
from .actions import RagToolQuery, AddContentToRagTool

class RagTool(Tool):
    """Rag Tool"""

    def actions(self) -> list[t.Type[Action]]:
        return [RagToolQuery, AddContentToRagTool]

    def triggers(self) -> list:
        return []