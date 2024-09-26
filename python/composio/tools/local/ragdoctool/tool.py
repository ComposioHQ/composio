# ragdoctool/tool.py

import typing as t
from composio.tools.base.local import LocalAction, LocalTool
from .actions import AddContentToRagTool, RagToolQuery


class RagTool(LocalTool, autoload=True):
    """RAG Tool for embedding and querying documents."""

    logo = "https://raw.githubusercontent.com/ComposioHQ/composio/master/python/docs/imgs/logos/Ragtool.png"

    @classmethod
    def actions(cls) -> list[t.Type[LocalAction]]:
        return [AddContentToRagTool, RagToolQuery]
