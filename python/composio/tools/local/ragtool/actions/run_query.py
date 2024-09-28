from operator import index
from turtle import distance
from typing import Dict

from pydantic import BaseModel, Field
from sympy import content
from torch import Tensor

from composio.tools.base.local import LocalAction
import numpy as np
import faiss

class QueryRequest(BaseModel):

    query: str = Field(
        ...,
        description="query to ask the embedding",
    )
    text_chunks: list = Field(..., description="text chunks of the file or folder")
    vector_index: faiss.Index = Field(..., description="vector index object")

class QueryResponse(BaseModel):
    status: str = Field(..., description="Status of the addition to the knowledge base")
    result : str | list[str | dict]= Field(..., description="result of the query")


class RunQuery(LocalAction[QueryRequest, QueryResponse]):
    def get_relevant_texts(self,text_chunks, indices) :# -> list[Any] :
        """
        Given a list of text chunks and their corresponding indices,
        return -> a list of the text chunks corresponding to the given indices
        """

        relevant_texts = [text_chunks[i] for i in indices[0]]
        return relevant_texts





    def generate_answer(self, relevant_texts, question):

        """
        Generate an answer to a question based on the relevant texts.
        Parameters
        ----------
        relevant_texts : list of str
            A list of relevant texts to the question.
        question : str
            The question to answer.
        
        Returns
        -------
        str
            The answer to the question.
        """
        try:    
            from langchain_groq import ChatGroq
        except ImportError as e:
          raise ImportError(f"Failed to import ChatGroq from langchain_groq (run pip install langchain_groq): {e}") from e

        llm = ChatGroq(model="llama3-8b-8192", stop_sequences=[]) 

        context = " ".join(relevant_texts)
        prompt = f'''you are an AI assistant, please answer the question from given context, if you don't have answer, please say I don't know.
        
        Context: {context}\n\nQuestion: {question}\n Answer:'''
        answer = llm.invoke(prompt)
        return answer.content



    def execute(self, request: QueryRequest, metadata: Dict) -> QueryResponse:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as e:
          raise ImportError(f"Failed to import SentenceTransformer from sentence_transformers (run pip install sentence_transformers): {e}") from e


        model = SentenceTransformer('all-MiniLM-L6-v2')

        query_embeddings: Tensor = model.encode(request.query)

        _distance, indices = request.vector_index.search(np.array([query_embeddings]), k=2) #type: ignore

        relevant_texts:list = self.get_relevant_texts(request.text_chunks, indices)
        answer = self.generate_answer(relevant_texts, request.query)
        return QueryResponse(status="Query successful", result=answer)
