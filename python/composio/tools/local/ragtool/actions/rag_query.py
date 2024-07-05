from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class RagToolQueryRequest(BaseModel):
    query: str = Field(..., description="The query to search in the knowledge base")


class RagToolQueryResponse(BaseModel):
    response: str = Field(
        ..., description="The response to the query from the knowledge base"
    )


class RagToolQuery(Action[RagToolQueryRequest, RagToolQueryResponse]):
    """
    Tool for querying a knowledge base
    this can only be performed after AddContentToRagTool
    """

    _display_name = "Rag Tool"
    _request_schema = RagToolQueryRequest
    _response_schema = RagToolQueryResponse
    _tags = ["Knowledge Base"]
    _tool_name = "ragtool"

    def execute(self, request: RagToolQueryRequest, authorisation_data: dict) -> dict:
        """Query the knowledge base and return the response"""
        if authorisation_data is None:
            authorisation_data = {}
        try:
            # pylint: disable=import-outside-toplevel
            from embedchain import App

            # pylint: enable=import-outside-toplevel
        except ImportError as e:
            raise ImportError(f"Failed to import App from embedchain: {e}") from e
        embedchain_app = None
        try:
            embedchain_app = App()
        except Exception as e:
            print(f"Failed to initialize App: {e}")
            raise Exception(f"Failed to initialize App: {e}") from e

        query = request.query

        if embedchain_app:
            try:
                _, sources = embedchain_app.query(query, citations=True)
                response = "\n\n".join([source[0] for source in sources])
                return {"response": response}
            except Exception as e:
                return {"error": f"Error querying knowledge base: {e}"}
        else:
            return {"error": "App initialization failed, cannot perform query."}
