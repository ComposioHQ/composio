from typing import Dict

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction


# pylint: disable=import-outside-toplevel


class RagToolQueryRequest(BaseModel):
    query: str = Field(..., description="The query to search in the knowledge base")


class RagToolQueryResponse(BaseModel):
    response: str = Field(
        ..., description="The response to the query from the knowledge base"
    )


class RagToolQuery(LocalAction[RagToolQueryRequest, RagToolQueryResponse]):
    """
    Tool for querying a knowledge base.

    *Note*: This can only be performed after `add_content_to_rag_tool`
    """

    _tags = ["Knowledge Base", "rag"]

    def execute(
        self, request: RagToolQueryRequest, metadata: Dict
    ) -> RagToolQueryResponse:
        """Query the knowledge base and return the response"""
        try:
            from embedchain import App
        except ModuleNotFoundError as e:
            raise ModuleNotFoundError(
                f"Failed to import App from embedchain: {e}"
            ) from e

        try:
            embedchain_app = App()
        except Exception as e:
            raise Exception(f"Failed to initialize App: {e}") from e

        _, sources = embedchain_app.query(request.query, citations=True)
        return RagToolQueryResponse(
            response="\n\n".join([source[0] for source in sources])
        )
