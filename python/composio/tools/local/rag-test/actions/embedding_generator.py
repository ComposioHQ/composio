import os  
from typing import Dict, List  
from pydantic import BaseModel, Field  
from composio.tools.base.local import LocalAction  
import PyPDF2  
from sklearn.feature_extraction.text import TfidfVectorizer  
import numpy as np 


class EmbeddingRequest(BaseModel):  
    directory: str = Field(  
        ...,  
        description="Path to the directory containing PDF or DOC files."  
    )  


class EmbeddingResponse(BaseModel):  
    embeddings: List[List[float]] = Field(  
        ...,  
        description="Embeddings generated from the documents."  
    )  


class EmbeddingGenerator(LocalAction[EmbeddingRequest, EmbeddingResponse]):  
    """  
    Generates embeddings from the text content of PDF or DOC files in a specified directory.  
    """  

    _tags = ["embedding_generator"]  

    def execute(self, request: EmbeddingRequest, metadata: Dict) -> EmbeddingResponse:  
        text_data = []  
        
        # Iterate through files in the directory  
        for filename in os.listdir(request.directory):  
            if filename.endswith('.pdf'):  
                with open(os.path.join(request.directory, filename), 'rb') as file:  
                    reader = PyPDF2.PdfReader(file)  
                    text = ''.join(page.extract_text() for page in reader.pages if page.extract_text())  
                    text_data.append(text)  
        
        # Generate embeddings using TF-IDF Vectorization for simplicity  
        vectorizer = TfidfVectorizer()  
        
        # Fix: Ensure the sparse matrix is converted to a dense array before use  
        embeddings = vectorizer.fit_transform(text_data).toarray()  # Convert to dense array  
        
        return EmbeddingResponse(embeddings=embeddings.tolist())