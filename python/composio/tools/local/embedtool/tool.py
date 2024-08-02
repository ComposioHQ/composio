import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import CreateImageVectorStore  # Import your action class
from .actions import QueryImageVectorStore


class EmbedTool(LocalTool, autoload=True):
    """
    This tool is useful in embedding images and finding images with text
    """

    @classmethod
    def actions(cls) -> t.List[t.Type[LocalAction]]:
        return [CreateImageVectorStore, QueryImageVectorStore]
