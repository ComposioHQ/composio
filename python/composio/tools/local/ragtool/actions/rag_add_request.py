from typing import Dict
from pydantic import BaseModel, Field
from composio.tools.base.local import LocalAction

# Model for adding content (e.g., PDF) to the knowledge base
class RagToolAddRequest(BaseModel):
    content: str = Field(
        ..., 
        description="Content (text from PDF/doc) to add to the knowledge base",
        json_schema_extra={"file_readable": True},
    )

class RagToolAddResponse(BaseModel):
    status: str = Field(..., description="Status of the addition to the knowledge base")

# Action for adding content to the RAG tool
class AddContentToRagTool(LocalAction[RagToolAddRequest, RagToolAddResponse]):
    """Tool for adding content (e.g., PDF) to the knowledge base"""

    _tags = ["Knowledge Base"]

    def execute(self, request: RagToolAddRequest, metadata: Dict) -> RagToolAddResponse:
        """Add content to the knowledge base"""
        try:
            from embedchain import App
        except ImportError as e:
            raise ImportError(f"Failed to import App from embedchain: {e}") from e

        # Generate embeddings for the content and add it to the RAG knowledge base
        App().add(request.content)
        return RagToolAddResponse(status="Content added successfully")
