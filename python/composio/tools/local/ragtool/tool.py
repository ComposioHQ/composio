import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import AddContentToRagTool, RagToolQuery


class Ragtool(LocalTool, autoload=True):
    """Rag Tool"""

    @classmethod
    def actions(cls) -> list[t.Type[LocalAction]]:
        return [RagToolQuery, AddContentToRagTool]
