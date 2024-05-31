from pydantic import BaseModel, Field
from composio.core.local import Action

class RagToolAddRequest(BaseModel):
    content: str = Field(..., description="Content to add to the knowledge base")

class RagToolAddResponse(BaseModel):
    status: str = Field(..., description="Status of the addition to the knowledge base")

class AddContentToRagTool(Action):
    """
    Tool for adding content to the knowledge base
    """

    _display_name = "Add Content to Rag Tool"
    _request_schema = RagToolAddRequest
    _response_schema = RagToolAddResponse
    _tags = ["Knowledge Base"]
    _tool_name = "ragtoolactions"

    def execute(self, request: RagToolAddRequest, authorisation_data: dict = {}):
        """Add content to the knowledge base"""
        try:
            from embedchain import App
        except ImportError as e:
            raise ImportError(f"Failed to import App from embedchain: {e}")
        try:
            embedchain_app = App()
            content = request.content
            embedchain_app.add(content)
            return "Content added successfully"
        except Exception as e:
            raise Exception(f"Error adding content: {e}")
