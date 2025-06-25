import os
import hashlib
from typing import List, Dict, Any

from pydantic import BaseModel, Field

from composio.utils.logging import get as get_logger

from composio.tools.base.local import LocalAction

from composio.tools.local.doc_rag.constants import (
    DEEPLAKE_FOLDER,
    INDEX_CACHE,
    TOP_K,
)
from composio.tools.local.doc_rag.processing.embedder import Embedding
from composio.tools.local.doc_rag.storage.storage import DeeplakeVectorStore

logger = get_logger("DocRAG")

class QueryIndexRequest(BaseModel):
    query: str = Field(..., description="The question to ask the indexed documents.")


class QueryIndexResponse(BaseModel):
    sources: List[Dict[str, Any]] = Field(
        ..., description="List of relevant source chunks."
    )


class QueryIndex(LocalAction[QueryIndexRequest, QueryIndexResponse]):
    display_name = "Query index"
    _tags = ["index"]
    requires = ["tqdm"]

    def execute(self, request: QueryIndexRequest, metadata: Dict) -> QueryIndexResponse:
        self.path = os.path.normpath(os.path.abspath(metadata["dir_to_index_path"]))

        path_hash = hashlib.md5(self.path.encode()).hexdigest()
        self.cache_dir = os.path.join(INDEX_CACHE, path_hash)

        self.vector_store = DeeplakeVectorStore(
            os.path.join(self.cache_dir, DEEPLAKE_FOLDER)
        )
        try:
            self.embedding_model = Embedding()
            query_vector = self.embedding_model.compute([request.query])[0]
            retrieved_chunks = self.vector_store.search(query_vector, top_k=TOP_K)

            if not retrieved_chunks:
                logger.warning(f"failed to get any relevant chunks for query: {request.query}")
                return QueryIndexResponse(sources=[])

            sources = [
                {"source": metadata.get("source"), "text": text}
                for text, metadata in zip(
                    retrieved_chunks.get("text", []), retrieved_chunks.get("metadata", [])
                )
            ]

            return QueryIndexResponse(sources=sources)
        except Exception as e:
            raise RuntimeError(f"query index failed: {e}") from e
