import typing as t
from composio.tools.base.local import LocalTool
from .rag_add_request import AddContentToRagTool
from .rag_query import RagToolQuery

class Ragtool(LocalTool, autoload=True):
    """Rag Tool"""

    logo = "https://raw.githubusercontent.com/ComposioHQ/composio/master/python/docs/imgs/logos/Ragtool.png"

    @classmethod
    def get_actions(cls) -> t.List[t.Type[LocalTool]]:
        return [RagToolQuery, AddContentToRagTool]
