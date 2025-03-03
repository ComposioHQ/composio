from __future__ import annotations

import os
from typing import TYPE_CHECKING, Any, Dict, List

from composio.tools.local.codeanalysis.constants import (
    CODE_MAP_CACHE,
    DEEPLAKE_FOLDER,
    EMBEDDER,
)


if TYPE_CHECKING:
    from deeplake.core.vectorstore.deeplake_vectorstore import DeepLakeVectorStore


def get_vector_store(repo_name: str, overwrite: bool = True) -> DeepLakeVectorStore:
    """
    Get or create a DeepLakeVectorStore for the given repository.

    Args:
        repo_path (str): Path to the repository.
        overwrite (bool, optional): Whether to overwrite existing vector store. Defaults to False.

    Returns:
        DeepLakeVectorStore: The vector store for the repository.

    Raises:
        ValueError: If repo_path is empty or None.
        OSError: If there's an issue creating or accessing the vector store.
    """
    if not repo_name:
        raise ValueError("Repository path cannot be empty or None")

    from deeplake.core.vectorstore.deeplake_vectorstore import (  # pylint: disable=import-outside-toplevel
        DeepLakeVectorStore,
    )

    try:
        repo_name = os.path.basename(repo_name)
        deeplake_repo_path = os.path.join(CODE_MAP_CACHE, repo_name, DEEPLAKE_FOLDER)
        deeplake_vector_store = DeepLakeVectorStore(
            path=deeplake_repo_path,
            overwrite=overwrite,
            read_only=False,
            ingestion_batch_size=1000,
        )
        return deeplake_vector_store

    except OSError as e:
        raise OSError(f"Failed to create or access vector store: {str(e)}") from e


class Embedding:
    def __init__(self):
        # pylint: disable=import-outside-toplevel
        from sentence_transformers import SentenceTransformer

        self.model = SentenceTransformer(EMBEDDER)

    def compute(self, texts: List[str]) -> List[List[float]]:
        """
        Compute embeddings for a list of texts.

        Args:
            texts (List[str]): List of input texts to embed.

        Returns:
            List[List[float]]: List of embeddings, where each embedding is a list of floats.

        Raises:
            ValueError: If texts is empty or None.
        """
        if not texts:
            raise ValueError("Input texts cannot be empty or None")

        try:
            embeddings = self.model.encode(
                texts, batch_size=64, show_progress_bar=True, convert_to_numpy=True
            )
            return embeddings.tolist()  # type: ignore
        except Exception as e:
            raise RuntimeError(f"Failed to compute embeddings: {str(e)}") from e


def get_vector_store_from_chunks(
    repo_name: str,
    documents: List[str],
    ids: List[str],
    metadatas: List[Dict[str, Any]],
) -> DeepLakeVectorStore:
    """
    Create or update a vector store with the given documents, ids, and metadata.

    Args:
        repo_path (str): Path to the repository.
        documents (List[str]): List of document texts to be embedded.
        ids (List[str]): List of unique identifiers for each document.
        metadatas (List[Dict[str, Any]]): List of metadata dictionaries for each document.

    Returns:
        DeepLakeVectorStore: The updated vector store.

    Raises:
        ValueError: If the input lists have different lengths.
        RuntimeError: If there's an error during vector store creation or embedding.
    """
    if not (len(documents) == len(ids) == len(metadatas)):
        raise ValueError("Input lists must have the same length")

    try:
        vector_store = get_vector_store(repo_name)
        embed_model = Embedding()
        embeddings = embed_model.compute(documents)

        # Batch processing for better performance
        batch_size = 1000
        for i in range(0, len(documents), batch_size):
            batch_end = min(i + batch_size, len(documents))
            vector_store.add(
                text=ids[i:batch_end],
                embedding=embeddings[i:batch_end],
                metadata=metadatas[i:batch_end],
            )

        return vector_store
    except Exception as e:
        raise RuntimeError(
            f"Error in vector store creation or embedding: {str(e)}"
        ) from e


def get_topn_chunks_from_query(
    vector_store: DeepLakeVectorStore, query: str, top_n: int = 5
) -> Dict:
    """
    Retrieve the top N most relevant chunks from the vector store based on the given query.

    Args:
        vector_store (DeepLakeVectorStore): The vector store to search in.
        query (str): The query string to search for.
        top_n (int, optional): The number of top results to return. Defaults to 5.

    Returns:
        Dict[str, Any]: A dictionary containing the search results.

    Raises:
        ValueError: If the input parameters are invalid.
        RuntimeError: If there's an error during the search process.
    """
    from deeplake.core.vectorstore.deeplake_vectorstore import (  # pylint: disable=import-outside-toplevel
        DeepLakeVectorStore,
    )

    if not isinstance(vector_store, DeepLakeVectorStore):
        raise ValueError("vector_store must be an instance of DeepLakeVectorStore")
    try:
        embed_model = Embedding()
        query_embedding = embed_model.compute([query])[0]
        results = vector_store.search(embedding=query_embedding, k=top_n)
        return results  # type: ignore
    except Exception as e:
        raise RuntimeError(f"Error during vector store search: {str(e)}") from e
