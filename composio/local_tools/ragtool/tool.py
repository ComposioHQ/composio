from ..action import Action
from composio.local_tools.tool import Tool
from ..tool import Tool
from .actions.rag_query import RagToolQuery
from .actions.rag_add_request import AddContentToRagTool
import typing as t

class RagTool(Tool):
    """Rag Tool"""

    def actions(self) -> list[t.Type[Action]]:
        return [RagToolQuery, AddContentToRagTool]

    def triggers(self) -> list:
        return []