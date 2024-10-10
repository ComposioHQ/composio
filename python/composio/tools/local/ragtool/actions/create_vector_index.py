from operator import index
from typing import Dict

from numpy import ndarray
from pydantic import BaseModel, Field
from torch import embedding

from composio.tools.base.local import LocalAction

import faiss # faiss-cpu

class RagEmbedQRequestRequest(BaseModel):
  embeddings: ndarray = Field(
    ...,
    description="embeddigs to create vector index",
  )

class CreateVectorIndexResponse(BaseModel):
  status: str = Field(..., description="Status of the addition to the knowledge base")
  index : faiss.Index= Field(..., description="Index of the embeddings")


class CreateVectorIndex(LocalAction[RagEmbedQRequestRequest, CreateVectorIndexResponse]):

  def execute(self, request: RagEmbedQRequestRequest, metadata: Dict) -> CreateVectorIndexResponse:
    """create index from embeddings"""

    dim: int = request.embeddings.shape[1]
    index = faiss.IndexFlatL2(dim)
    index.add(request.embeddings) # type: ignore

    return CreateVectorIndexResponse(status="Index created successfully", index=index)