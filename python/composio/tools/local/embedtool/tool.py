import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import CreateImageVectorStore, QueryImageVectorStore


class EmbedTool(LocalTool, autoload=True):
    """
    This tool is useful in embedding images and finding images with text
    """

    logo = "https://raw.githubusercontent.com/ComposioHQ/composio/master/python/docs/imgs/logos/embedtool.png"

    @classmethod
    def actions(cls) -> t.List[t.Type[LocalAction]]:
        return [CreateImageVectorStore, QueryImageVectorStore]
