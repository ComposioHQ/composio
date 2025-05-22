from curses import meta
from pathlib import Path
from typing import Dict

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from python.composio.tools.env.filemanager import file


# pylint: disable=import-outside-toplevel
class RagToolAddRequest(BaseModel):
    content: str = Field(
        ...,
        description="Content to add to the knowledge base",
        json_schema_extra={"file_readable": True},
    )


class RagToolAddResponse(BaseModel):
    status: str = Field(..., description="Status of the addition to the knowledge base")


class AddContentToRagTool(LocalAction[RagToolAddRequest, RagToolAddResponse]):
    """Tool for adding content to the knowledge base"""

    _tags = ["Knowledge Base"]

    def execute(self, request: RagToolAddRequest, metadata: Dict) -> RagToolAddResponse:
        """Add content to the knowledge base"""
        try:
            from embedchain import App
        except ImportError as e:
            raise ImportError(f"Failed to import App from embedchain: {e}") from e

        file_path = metadata.get("file_path")
        if file_path:
            if not Path(file_path).exists():
                raise FileNotFoundError(f"Error: {file_path} does not exist.")
            App().add(file_path)

        App().add(request.content)
        return RagToolAddResponse(status="Content added successfully")
