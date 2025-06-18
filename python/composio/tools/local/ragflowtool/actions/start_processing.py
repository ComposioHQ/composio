"""
Action for starting document processing (chunking and embedding) in RAGFlow.
"""

import requests
from typing import Dict
from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction


class StartProcessingRequest(BaseModel):
    """Request schema for starting document processing."""

    dataset_id: str = Field(
        ...,
        description="ID of the dataset containing the documents to process",
    )
    document_id: str = Field(
        ...,
        description="ID of the document to process",
    )
    ragflow_server: str = Field(
        ...,
        description="RAGFlow server URL (e.g., 'http://localhost:8080')",
    )
    api_key: str = Field(
        ...,
        description="API key for RAGFlow authentication",
    )


class StartProcessingResponse(BaseModel):
    """Response schema for starting document processing."""

    success: bool = Field(
        default=False,
        description="Whether the processing start was successful",
    )
    message: str = Field(
        default="",
        description="Success or error message",
    )


class StartProcessing(LocalAction[StartProcessingRequest, StartProcessingResponse]):
    """
    Start processing documents in a RAGFlow dataset.

    This action tells RAGFlow to parse uploaded documents, split them into chunks,
    and generate embeddings for each chunk. This is required before querying the documents.
    """

    display_name = "StartProcessing"
    _request_schema = StartProcessingRequest
    _response_schema = StartProcessingResponse

    def execute(self, request: StartProcessingRequest, metadata: Dict) -> StartProcessingResponse:
        """Execute the start processing action."""
        try:
            url = f"{request.ragflow_server.rstrip('/')}/api/v1/datasets/{request.dataset_id}/documents/{request.document_id}/run"
            headers = {
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {request.api_key}'
            }
            
            response = requests.post(url, headers=headers)
            
            if response.status_code == 200:
                return StartProcessingResponse(
                    success=True,
                    message=f"Document processing started successfully for document {request.document_id}"
                )
            else:
                return StartProcessingResponse(
                    success=False,
                    message=f"HTTP {response.status_code}: {response.text}"
                )
                
        except requests.exceptions.RequestException as e:
            return StartProcessingResponse(
                success=False,
                message=f"Request failed: {str(e)}"
            )
        except Exception as e:
            return StartProcessingResponse(
                success=False,
                message=f"Unexpected error: {str(e)}"
            ) 