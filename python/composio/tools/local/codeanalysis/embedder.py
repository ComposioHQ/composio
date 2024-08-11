import os

from deeplake.core.vectorstore.deeplake_vectorstore import DeepLakeVectorStore
from sentence_transformers import SentenceTransformer

from composio.tools.local.codeanalysis.constants import DEEPLAKE_FOLDER, EMBEDDER


def get_vector_store(repo_path, overwrite=True):
    repo_name = os.path.basename(repo_path)
    deeplake_repo_path = os.path.join(DEEPLAKE_FOLDER, repo_name)
    deeplake_vector_store = DeepLakeVectorStore(
        path=deeplake_repo_path, overwrite=overwrite
    )
    return deeplake_vector_store


class Embedding:
    def __init__(self):
        self.model = SentenceTransformer(EMBEDDER)

    def compute(self, texts: list[str]):
        return self.model.encode(texts, batch_size=256, show_progress_bar=True).tolist()


embed_model = Embedding()


def get_vector_store_from_chunks(repo_path, documents, ids, metadatas):
    vector_store = get_vector_store(repo_path)
    embeddings = embed_model.compute(documents)
    vector_store.add(text=ids, embedding=embeddings, metadata=metadatas)

    return vector_store


def get_topn_chunks_from_query(vector_store, query, top_n=5):
    query_embedding = embed_model.compute([query])[0]
    results = vector_store.search(embedding=query_embedding, k=top_n)
    return results
