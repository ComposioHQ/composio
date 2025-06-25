from abc import ABC, abstractmethod
from typing import List, Dict, Any
from composio.tools.local.doc_rag.constants import INDEX_CACHE, DEEPLAKE_FOLDER


class VectorStore(ABC):
    @abstractmethod
    def add(
        self,
        ids: List[str],
        texts: List[str],
        embeddings: List[List[float]],
        metadatas: List[Dict],
    ):
        pass

    @abstractmethod
    def search(self, query_vector: List[float], top_k: int) -> List[Dict[str, Any]]:
        pass


class DeeplakeVectorStore(VectorStore):
    def __init__(self, path: str):
        from deeplake.core.vectorstore.deeplake_vectorstore import (  # pylint: disable=import-outside-toplevel
            DeepLakeVectorStore,
        )

        try:
            self._ds = DeepLakeVectorStore(
                path=path,
                overwrite=False,
                read_only=False,
                ingestion_batch_size=1000,
            )
        except OSError as e:
            raise OSError(f"failed to create or access vector store: {str(e)}") from e

    def add(
        self, documents: List[str], embeddings: List[List[float]], metadatas: List[Dict]
    ):
        try:
            self._ds.add(
                text=documents,
                embedding=embeddings,
                metadata=metadatas,
            )
        except Exception as e:
            raise RuntimeError(f"error in adding to vector store: {str(e)}") from e

    def search(self, query_vector: List[float], top_k: int) -> Dict:
        try:
            results = self._ds.search(embedding=query_vector, k=top_k)
            return results  # type: ignore
        except Exception as e:
            raise RuntimeError(f"error during vector store search: {str(e)}") from e
