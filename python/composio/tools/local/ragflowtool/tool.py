"""
RAGFlow tool for Composio.
"""

import typing as t

from composio.tools.base.local import LocalAction, LocalTool

from .actions import (
    CreateDataset,
    UploadDocument,
    StartProcessing,
    QueryDocuments,
)


class RAGFlowTool(LocalTool, autoload=True):
    """RAGFlow tool for document embeddings and querying."""

    requires = ["requests"]

    logo = "https://raw.githubusercontent.com/ComposioHQ/composio/master/python/docs/imgs/logos/ragflowtool.png"

    @classmethod
    def actions(cls) -> t.List[t.Type[LocalAction]]:
        """Return the list of actions."""
        return [
            CreateDataset,
            UploadDocument,
            StartProcessing,
            QueryDocuments,
        ] 