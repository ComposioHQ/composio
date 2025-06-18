"""
Action for creating a dataset in RAGFlow.
"""

import requests
from typing import Dict
from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction


class CreateDatasetRequest(BaseModel):
    """Request schema for creating a dataset."""

    name: str = Field(
        ...,
        description="Name of the dataset to create",
    )
    ragflow_server: str = Field(
        ...,
        description="RAGFlow server URL (e.g., 'http://localhost:8080')",
    )
    api_key: str = Field(
        ...,
        description="API key for RAGFlow authentication",
    )


class CreateDatasetResponse(BaseModel):
    """Response schema for creating a dataset."""

    success: bool = Field(
        default=False,
        description="Whether the dataset creation was successful",
    )
    dataset_id: str = Field(
        default="",
        description="ID of the created dataset",
    )
    message: str = Field(
        default="",
        description="Success or error message",
    )


class CreateDataset(LocalAction[CreateDatasetRequest, CreateDatasetResponse]):
    """
    Create a new dataset in RAGFlow.

    This action creates a new dataset that can hold documents for embedding generation.
    The dataset_id returned should be used for subsequent operations like uploading documents.
    """

    display_name = "CreateDataset"
    _request_schema = CreateDatasetRequest
    _response_schema = CreateDatasetResponse

    def execute(self, request: CreateDatasetRequest, metadata: Dict) -> CreateDatasetResponse:
        """Execute the create dataset action."""
        try:
            url = f"{request.ragflow_server.rstrip('/')}/api/v1/datasets"
            headers = {
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {request.api_key}'
            }
            data = {
                'name': request.name
            }
            
            response = requests.post(url, headers=headers, json=data)
            
            if response.status_code == 200:
                result = response.json()
                if 'data' in result and 'id' in result['data']:
                    return CreateDatasetResponse(
                        success=True,
                        dataset_id=result['data']['id'],
                        message=f"Dataset '{request.name}' created successfully"
                    )
                else:
                    return CreateDatasetResponse(
                        success=False,
                        message=f"Unexpected response format: {result}"
                    )
            else:
                return CreateDatasetResponse(
                    success=False,
                    message=f"HTTP {response.status_code}: {response.text}"
                )
                
        except requests.exceptions.RequestException as e:
            return CreateDatasetResponse(
                success=False,
                message=f"Request failed: {str(e)}"
            )
        except Exception as e:
            return CreateDatasetResponse(
                success=False,
                message=f"Unexpected error: {str(e)}"
            ) 