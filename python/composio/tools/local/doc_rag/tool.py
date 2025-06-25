import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import (
    CreateIndex,
    QueryIndex,
)


class DocRAGTool(LocalTool, autoload=True):
    """Doc RAG tool."""

    requires = [
        "deeplake>3.9,<3.9.39",
        "sentence-transformers",
        "tokenizers>=0.21,<0.22",
        "pypdf",
        "python-docx"
    ]

    logo = "https://raw.githubusercontent.com/sholaybhature/composio/master/python/docs/imgs/logos/docrag.gif" # hehe

    @classmethod
    def actions(cls) -> t.List[t.Type[LocalAction]]:
        """Return the list of actions."""
        return [
            CreateIndex,
            QueryIndex,
        ]
