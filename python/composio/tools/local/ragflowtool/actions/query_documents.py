"""
Action for querying documents in RAGFlow.
"""

import requests
from typing import Dict, List
from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction


class QueryDocumentsRequest(BaseModel):
    """Request schema for querying documents."""

    dataset_id: str = Field(
        ...,
        description="ID of the dataset to query",
    )
    question: str = Field(
        ...,
        description="Question to ask about the documents",
    )
    ragflow_server: str = Field(
        ...,
        description="RAGFlow server URL (e.g., 'http://localhost:8080')",
    )
    api_key: str = Field(
        ...,
        description="API key for RAGFlow authentication",
    )
    top_k: int = Field(
        default=3,
        description="Number of top relevant chunks to retrieve (default: 3)",
    )


class DocumentChunk(BaseModel):
    """Schema for a document chunk."""
    
    chunk_id: str = Field(description="ID of the chunk")
    content: str = Field(description="Content of the chunk")
    score: float = Field(description="Relevance score")
    document_name: str = Field(description="Name of the source document")


class QueryDocumentsResponse(BaseModel):
    """Response schema for querying documents."""

    success: bool = Field(
        default=False,
        description="Whether the query was successful",
    )
    answer: str = Field(
        default="",
        description="Generated answer based on the retrieved documents",
    )
    relevant_chunks: List[DocumentChunk] = Field(
        default_factory=list,
        description="List of relevant document chunks",
    )
    message: str = Field(
        default="",
        description="Success or error message",
    )


class QueryDocuments(LocalAction[QueryDocumentsRequest, QueryDocumentsResponse]):
    """
    Query documents in a RAGFlow dataset.

    This action allows you to ask questions about the processed documents.
    It retrieves relevant chunks and can generate answers based on the content.
    """

    display_name = "QueryDocuments"
    _request_schema = QueryDocumentsRequest
    _response_schema = QueryDocumentsResponse

    def execute(self, request: QueryDocumentsRequest, metadata: Dict) -> QueryDocumentsResponse:
        """Execute the query documents action."""
        try:
            # Retrieve relevant chunks using the official API endpoint
            search_url = f"{request.ragflow_server.rstrip('/')}/api/v1/datasets/{request.dataset_id}/retrieval"
            headers = {
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {request.api_key}'
            }
            search_data = {
                'question': request.question,
                'top_k': request.top_k
            }
            
            response = requests.post(search_url, headers=headers, json=search_data)
            
            if response.status_code == 200:
                result = response.json()
                
                # Extract relevant chunks
                chunks = []
                answer = ""
                
                if 'data' in result:
                    # Parse the response based on RAGFlow's API structure
                    if 'chunks' in result['data']:
                        for chunk_data in result['data']['chunks']:
                            chunks.append(DocumentChunk(
                                chunk_id=chunk_data.get('id', ''),
                                content=chunk_data.get('content', ''),
                                score=chunk_data.get('score', 0.0),
                                document_name=chunk_data.get('document_name', 'Unknown')
                            ))
                    
                    # If there's a generated answer in the response
                    if 'answer' in result['data']:
                        answer = result['data']['answer']
                    else:
                        # Generate a simple answer based on the chunks
                        if chunks:
                            answer = f"Based on the documents, here are the most relevant passages for your question '{request.question}':\n\n"
                            for i, chunk in enumerate(chunks[:3], 1):
                                answer += f"{i}. {chunk.content[:200]}{'...' if len(chunk.content) > 200 else ''}\n\n"
                        else:
                            answer = "No relevant information found in the documents for your question."
                
                return QueryDocumentsResponse(
                    success=True,
                    answer=answer,
                    relevant_chunks=chunks,
                    message=f"Successfully retrieved {len(chunks)} relevant chunks"
                )
            else:
                return QueryDocumentsResponse(
                    success=False,
                    message=f"HTTP {response.status_code}: {response.text}"
                )
                
        except requests.exceptions.RequestException as e:
            return QueryDocumentsResponse(
                success=False,
                message=f"Request failed: {str(e)}"
            )
        except Exception as e:
            return QueryDocumentsResponse(
                success=False,
                message=f"Unexpected error: {str(e)}"
            ) 