from composio.local_tools.tool import Tool

from .codequery import CodeQuery


class Greptile(Tool):
    """
    Code understanding tool. Index Code and answer questions about it.
    """

    def actions(self) -> list:
        return [CodeQuery]

    def triggers(self) -> list:
        return []
