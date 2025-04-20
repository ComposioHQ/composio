import typing as t
from composio.tools.base.local import LocalAction, LocalTool
from .actions.document_rag_action import UploadDocument, QueryDocument

class DocumentRagTool(LocalTool, autoload=True):
    """Document RAG Tool for handling document uploads and queries"""
    
    @classmethod
    def actions(cls) -> list[t.Type[LocalAction]]:
        return [UploadDocument, QueryDocument]
    