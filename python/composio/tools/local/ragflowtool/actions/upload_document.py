"""
Action for uploading a document to RAGFlow.
"""

import requests
import os
from typing import Dict
from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction


class UploadDocumentRequest(BaseModel):
    """Request schema for uploading a document."""

    dataset_id: str = Field(
        ...,
        description="ID of the dataset to upload the document to",
    )
    file_path: str = Field(
        ...,
        description="Path to the document file to upload (PDF, DOC, etc.)",
    )
    ragflow_server: str = Field(
        ...,
        description="RAGFlow server URL (e.g., 'http://localhost:8080')",
    )
    api_key: str = Field(
        ...,
        description="API key for RAGFlow authentication",
    )


class UploadDocumentResponse(BaseModel):
    """Response schema for uploading a document."""

    success: bool = Field(
        default=False,
        description="Whether the document upload was successful",
    )
    document_id: str = Field(
        default="",
        description="ID of the uploaded document",
    )
    message: str = Field(
        default="",
        description="Success or error message",
    )


class UploadDocument(LocalAction[UploadDocumentRequest, UploadDocumentResponse]):
    """
    Upload a document to a RAGFlow dataset.

    This action uploads a PDF, DOC, or other supported document format to a dataset.
    The document will be prepared for chunking and embedding generation.
    """

    display_name = "UploadDocument"
    _request_schema = UploadDocumentRequest
    _response_schema = UploadDocumentResponse

    def execute(self, request: UploadDocumentRequest, metadata: Dict) -> UploadDocumentResponse:
        """Execute the upload document action."""
        try:
            # Check if file exists
            if not os.path.exists(request.file_path):
                return UploadDocumentResponse(
                    success=False,
                    message=f"File not found: {request.file_path}"
                )
            
            url = f"{request.ragflow_server.rstrip('/')}/api/v1/datasets/{request.dataset_id}/documents"
            headers = {
                'Authorization': f'Bearer {request.api_key}'
            }
            
            with open(request.file_path, 'rb') as file:
                files = {
                    'file': (os.path.basename(request.file_path), file, 'application/octet-stream')
                }
                
                response = requests.post(url, headers=headers, files=files)
            
            if response.status_code == 200:
                result = response.json()
                if 'data' in result and 'id' in result['data']:
                    return UploadDocumentResponse(
                        success=True,
                        document_id=result['data']['id'],
                        message=f"Document uploaded successfully: {os.path.basename(request.file_path)}"
                    )
                else:
                    return UploadDocumentResponse(
                        success=False,
                        message=f"Unexpected response format: {result}"
                    )
            else:
                return UploadDocumentResponse(
                    success=False,
                    message=f"HTTP {response.status_code}: {response.text}"
                )
                
        except requests.exceptions.RequestException as e:
            return UploadDocumentResponse(
                success=False,
                message=f"Request failed: {str(e)}"
            )
        except Exception as e:
            return UploadDocumentResponse(
                success=False,
                message=f"Unexpected error: {str(e)}"
            ) 