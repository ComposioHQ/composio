from typing import Dict
from pydantic import BaseModel, Field
from composio.tools.base.local import LocalAction
from .embedding_model import EmbeddingModel


class RagPDFQueryRequest(BaseModel):
    query: str = Field(..., description="The query to search in the knowledge base")


class RagPDFQueryResponse(BaseModel):
    response: str = Field(..., description="The response to the query based on PDF embeddings")


class RagPDFQuery(LocalAction[RagPDFQueryRequest, RagPDFQueryResponse]):
    _tags = ["Knowledge Base", "Query", "PDF", "Embeddings"]

    def execute(
        self, request: RagPDFQueryRequest, metadata: Dict
    ) -> RagPDFQueryResponse:
        """Query the knowledge base and return relevant results"""
        try:
            embedding_model = EmbeddingModel()

            knowledge_base = self.knowledge_base

            if not knowledge_base:
                return RagPDFQueryResponse(response="No content in the knowledge base")

            query_embedding = embedding_model.generate_embeddings(request.query)

            best_match = None
            best_similarity = -1
            for pdf, embeddings in knowledge_base.items():
                similarity = embedding_model.calculate_similarity(embeddings, query_embedding)
                if similarity > best_similarity:
                    best_similarity = similarity
                    best_match = pdf

            if best_match:
                return RagPDFQueryResponse(response=f"Best match: {best_match} with similarity: {best_similarity}")
            else:
                return RagPDFQueryResponse(response="No relevant content found")

        except Exception as e:
            return RagPDFQueryResponse(response=f"Failed to query knowledge base: {str(e)}")
