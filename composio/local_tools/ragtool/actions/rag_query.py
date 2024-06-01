from pydantic import BaseModel, Field
from composio.core.local import Action

class RagToolQueryRequest(BaseModel):
    query: str = Field(..., description="The query to search in the knowledge base")

class RagToolQueryResponse(BaseModel):
    response: str = Field(..., description="The response to the query from the knowledge base")

class RagToolQuery(Action):
    """
    Tool for querying a knowledge base 
    this can only be performed after AddContentToRagTool
    """

    _display_name = "Rag Tool"
    _request_schema = RagToolQueryRequest
    _response_schema = RagToolQueryResponse
    _tags = ["Knowledge Base"]
    _tool_name = "ragtoolactions"


    def execute(self, request: RagToolQueryRequest, authorisation_data: dict = {}):
        """Query the knowledge base and return the response"""
        try:
            from embedchain import App
        except ImportError as e:
            raise ImportError(f"Failed to import App from embedchain: {e}")
        embedchain_app = None
        try:
            embedchain_app = App()
        except Exception as e:
            print(f"Failed to initialize App: {e}")
            raise Exception(f"Failed to initialize App: {e}")

        query = request.query

        if embedchain_app:
            try:
                result, sources = embedchain_app.query(query, citations=True)
                response = "\n\n".join([source[0] for source in sources])
                return response
            except Exception as e:
                return f"Error querying knowledge base: {e}"
        else:
            return "App initialization failed, cannot perform query."
