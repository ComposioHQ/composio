import os
from typing import Dict

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from composio.tools.local.codeanalysis.actions.create_codemap import (
    CreateCodeMap,
    CreateCodeMapRequest,
)


class GetRelevantCodeRequest(BaseModel):
    query: str = Field(
        ...,
        description="Query to retrieve relevant code from the repository",
    )


class GetRelevantCodeResponse(BaseModel):
    result: str = Field(
        ...,
        description="Retrieved method body as a string, including any decorators and comments",
    )


class GetRelevantCode(LocalAction[GetRelevantCodeRequest, GetRelevantCodeResponse]):
    """
    Retrieves relevant code snippets from a repository based on a given query.

    Use this action when you need to:
    1. Find code snippets related to a specific topic or functionality.
    2. Search for implementations of particular features across the codebase.

    Usage example:
    query: "database connection pooling"

    The relevance of retrieved code snippets depends on the quality and specificity of the provided query.
    Don't use this action if you are not sure about the query. And the results returned are not very relevant.
    """

    display_name = "Get Relevant Code"
    _tags = ["index"]

    def execute(
        self, request: GetRelevantCodeRequest, metadata: Dict
    ) -> GetRelevantCodeResponse:
        CreateCodeMap().execute(CreateCodeMapRequest(), metadata)
        from composio.tools.local.codeanalysis import (  # pylint: disable=import-outside-toplevel
            embedder,
        )

        repo_name = os.path.basename(metadata["dir_to_index_path"])
        vector_store = embedder.get_vector_store(repo_name, overwrite=False)
        query = request.query
        results = embedder.get_topn_chunks_from_query(vector_store, query, top_n=5)
        sep = "\n" + "=" * 100 + "\n"
        result_string = "Query: " + query + sep
        for i, _metadata in enumerate(results["metadata"]):
            result_string += f"Chunk {i + 1}: \n" + str(_metadata["chunk"]) + sep
        return GetRelevantCodeResponse(result=result_string)
