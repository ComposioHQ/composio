from typing import List
from composio.tools.local.doc_rag.constants import (
    EMBEDDER
)

class Embedding:
    def __init__(self):
        # pylint: disable=import-outside-toplevel
        from sentence_transformers import SentenceTransformer

        self.model = SentenceTransformer(EMBEDDER)

    def compute(self, texts: List[str]) -> List[List[float]]:
        try:
            embeddings = self.model.encode(texts, batch_size=64, show_progress_bar=False, convert_to_numpy=True)
            return embeddings.tolist() 
        except Exception as e:
            raise RuntimeError(f"failed to compute embeddings: {str(e)}") from e