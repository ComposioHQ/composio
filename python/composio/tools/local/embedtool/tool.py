import typing as t

from composio.tools.local.base import Action, Tool

<<<<<<< HEAD
from .actions import CreateImageVectorStore  # Import your action class
from .actions import QueryImageVectorStore
=======
from .actions import (
    CreateImageVectorStore,  # Import your action class
    QueryImageVectorStore,
)
>>>>>>> 290719188e128b7c686b0c042afc13318fe1022c


class EmbedTool(Tool):
    """
    This tool is useful in embedding images and finding images with text
    """

    def actions(self) -> t.List[t.Type[Action]]:
        return [CreateImageVectorStore, QueryImageVectorStore]

    def triggers(self) -> list:
        return []
