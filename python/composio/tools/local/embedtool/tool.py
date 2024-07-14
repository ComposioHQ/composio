import typing as t

from composio.tools.local.base import Action, Tool

from .actions import CreateImageVectorStore  # Import your action class
from .actions import QueryImageVectorStore


class EmbedTool(Tool):
    """
    This tool is useful in embedding images and finding images with text
    """

    def actions(self) -> t.List[t.Type[Action]]:
        return [CreateImageVectorStore, QueryImageVectorStore]

    def triggers(self) -> list:
        return []
