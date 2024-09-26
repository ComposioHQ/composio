# ragdoctool/actions/RagToolQuery.py

import os
from typing import Dict, List

from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer
import chromadb
import openai

from composio.tools.base.local import LocalAction
from composio.tools.base.exceptions import ExecutionFailed


class RagToolQueryRequest(BaseModel):
    query: str = Field(..., description="The user query to search for relevant information.")


class RagToolQueryResponse(BaseModel):
    answer: str = Field(..., description="Generated answer based on the query and retrieved documents.")


class RagToolQuery(LocalAction[RagToolQueryRequest, RagToolQueryResponse]):
    """Action to query the RAG knowledge base for relevant information using OpenAI's language model."""

    _tags = ["RAG", "Knowledge Base", "Query"]

    def __init__(self):
        super().__init__()
        # Initialize the embedding model once
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        # Initialize ChromaDB client and collection once
        storage_path = os.path.expanduser("~/.composio/ragdoctool_storage")
        self.client = chromadb.PersistentClient(path=storage_path)
        self.collection = self.client.get_or_create_collection(name="rag_embeddings")
        # Initialize OpenAI API key
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        if not self.openai_api_key:
            raise ExecutionFailed("OpenAI API key not found. Please set the OPENAI_API_KEY environment variable.")
        openai.api_key = self.openai_api_key

    def execute(self, request: RagToolQueryRequest, metadata: Dict) -> RagToolQueryResponse:
        """
        Execute the RagToolQuery action.

        Parameters:
            request (RagToolQueryRequest): The request containing the query string.
            metadata (Dict): Additional metadata (not used here).

        Returns:
            RagToolQueryResponse: Generated answer based on the query and retrieved documents.
        """
        try:
            query = request.query
            print(f"Received query: {query}")

            # Generate embedding for the query
            query_embedding = self.model.encode([query])[0].tolist()

            # Retrieve relevant documents from ChromaDB
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=5,  # Number of top results to retrieve
                include=['documents', 'metadatas']
            )

            # Extract documents
            retrieved_documents = results.get('documents', [[]])[0]
            retrieved_metadatas = results.get('metadatas', [[]])[0]

            if not retrieved_documents:
                print("No relevant documents found for the query.")
                return RagToolQueryResponse(answer="I'm sorry, but I couldn't find any relevant information to answer your query.")

            # Compile the retrieved documents into a single context
            context = "\n\n".join([f"Source: {meta.get('source', 'Unknown')}\nContent: {doc}" 
                                   for doc, meta in zip(retrieved_documents, retrieved_metadatas)])

            # Create the prompt for OpenAI
            prompt = (
                f"You are an AI assistant that provides concise and accurate answers based on the provided context. Do not reply if you do not know the answer.\n\n"
                f"Context:\n{context}\n\n"
                f"Question: {query}\n"
                f"Answer:"
            )

            response = openai.Completion.create(
                engine="gpt-3,5-turbo",  # Cheapest option available, can use gpt 4 for better usage
                prompt=prompt,
                max_tokens=300,
                temperature=0.7,
                top_p=1,
                frequency_penalty=0,
                presence_penalty=0,
                stop=["\n"]
            )

            generated_answer = response.choices[0].text.strip()

            print(f"Generated Answer: {generated_answer}")
            return RagToolQueryResponse(answer=generated_answer)

        except ExecutionFailed as e:
            raise e
        except Exception as e:
            print(f"Unexpected error during query execution: {e}")
            raise ExecutionFailed(f"Unexpected error: {e}")
