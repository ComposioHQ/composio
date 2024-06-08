from pydantic import BaseModel, Field

from composio.core.local import Action


class RagToolAddRequest(BaseModel):
    content: str = Field(..., description="Content to add to the knowledge base", json_schema_extra={"file_readable": True})


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
    _tool_name = "ragtool"

    def execute(self, request: RagToolAddRequest, authorisation_data: dict = None):
        """Add content to the knowledge base"""
        if authorisation_data is None:
            authorisation_data = {}
        try:
            # pylint: disable=import-outside-toplevel
            from embedchain import App

            # pylint: enable=import-outside-toplevel
        except ImportError as e:
            raise ImportError(f"Failed to import App from embedchain: {e}") from e
        try:
            embedchain_app = App()
            content = request.content
            embedchain_app.add(content)
            return "Content added successfully"
        except Exception as e:
            raise Exception(f"Error adding content: {e}") from e
