from sentence_transformers import SentenceTransformer
import torch

class EmbeddingModel:

    def __init__(self, model_name: str = 'sentence-transformers/all-MiniLM-L6-v2'):
        self.model = SentenceTransformer(model_name)

    def generate_embeddings(self, text: str) -> torch.Tensor:
        return self.model.encode(text, convert_to_tensor=True)

    def calculate_similarity(self, embedding1: torch.Tensor, embedding2: torch.Tensor) -> float:
        return torch.cosine_similarity(embedding1, embedding2).item()