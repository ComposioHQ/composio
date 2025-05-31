"""
Document RAG tool for Composio.
"""
import typing as t
from composio.tools.base.local import LocalAction, LocalTool
from .actions import CreateIndex, QueryIndex

class DocumentRAG(LocalTool, autoload=True):
    """Document RAG tool for indexing and querying documents."""
    logo = "https://raw.githubusercontent.com/ComposioHQ/composio/master/python/docs/imgs/logos/documentrag.png"
    
    @classmethod
    def actions(cls) -> t.List[t.Type[LocalAction]]:
        """Return the list of actions."""
        return [CreateIndex, QueryIndex]