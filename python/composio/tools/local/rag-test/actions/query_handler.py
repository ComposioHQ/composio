from typing import Dict, List  
from pydantic import BaseModel, Field  
from composio.tools.base.local import LocalAction  
from sklearn.metrics.pairwise import cosine_similarity  
import numpy as np  


class QueryRequest(BaseModel):  
    question: str = Field(  
        ...,  
        description="Question to ask about the documents."  
    )  
    embeddings: List[List[float]] = Field(  
        ...,  
        description="Embeddings generated from the documents."  
    )  
    query_embedding: List[float] = Field(  
        ...,  
        description="Embedding of the question."  
    )  


class QueryResponse(BaseModel):  
    most_similar_document: int = Field(  
        ...,  
        description="Index of the most similar document."  
    )  


class QueryHandler(LocalAction[QueryRequest, QueryResponse]):  
    """  
    Handles queries against the generated embeddings to find the most similar document.  
    """  

    _tags = ["query_handler"]  

    def execute(self, request: QueryRequest, metadata: Dict) -> QueryResponse:  
        # Convert lists to numpy arrays for compatibility with cosine_similarity  
        query_embedding_reshaped = np.array([request.query_embedding])  
        document_embeddings_reshaped = np.array(request.embeddings)  

        # Check for empty inputs  
        if document_embeddings_reshaped.size == 0 or query_embedding_reshaped.size == 0:  
            raise ValueError("Embeddings or query embedding cannot be empty.")  

        # Calculate cosine similarities  
        similarities = cosine_similarity(query_embedding_reshaped, document_embeddings_reshaped)  
        
        most_similar_idx = similarities[0].argmax()  # Get the index of the most similar document  
        
        return QueryResponse(most_similar_document=most_similar_idx)