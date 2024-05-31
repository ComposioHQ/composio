from composio.local_tools.tool import Tool, Action
from .actions.codequery import CodeQuery
import typing as t

class Greptile(Tool):
    """
    Code understanding tool. Index Code and answer questions about it.
    """

    def actions(self) -> list[t.Type[Action]]:
        return [CodeQuery]

    def triggers(self) -> list:
        return []
