import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import CreateVectorIndex, GenerateEmbeddings, RunQuery


class RagtoolEmbedTool(LocalTool, autoload=True):
    """Rag Tool"""

    logo = "https://raw.githubusercontent.com/ComposioHQ/composio/master/python/docs/imgs/logos/Ragtool.png"

    @classmethod
    def actions(cls) -> list[t.Type[LocalAction]]:
        return [GenerateEmbeddings, CreateVectorIndex, RunQuery]
