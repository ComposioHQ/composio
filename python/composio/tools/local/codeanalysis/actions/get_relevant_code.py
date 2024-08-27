from typing import Dict, Type

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from composio.tools.local.codeanalysis import embedder


class GetRelevantCodeRequest(BaseModel):
    repo_name: str = Field(
        ...,
        description="Name of the repository. It should be the last part of valid github repository name. It should not contain any '/'.",
    )
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
    Retrieves the body of a specified method.

    This action can retrieve the method body in two scenarios:
    1. If a class name is provided, it retrieves the method from within that class.
    2. If no class name is provided, it retrieves the method from the global scope.

    The retrieved body includes any decorators and comments associated with the method.
    """

    _display_name = "Get Relevant Code"
    _request_schema: Type[GetRelevantCodeRequest] = GetRelevantCodeRequest
    _response_schema: Type[GetRelevantCodeResponse] = GetRelevantCodeResponse

    def execute(
        self, request: GetRelevantCodeRequest, metadata: Dict
    ) -> GetRelevantCodeResponse:
        try:
            repo_path = request.repo_name
            if "/" in repo_path:
                repo_path = repo_path.split("/")[-1]
            vector_store = embedder.get_vector_store(repo_path, overwrite=False)
            query = request.query
            results = embedder.get_topn_chunks_from_query(vector_store, query, top_n=5)
            sep = "\n" + "=" * 100 + "\n"
            result_string = "Query: " + query + sep
            for i, metadata in enumerate(results["metadata"]):
                result_string += f"Chunk {i+1}: \n" + str(metadata["chunk"]) + sep
            return GetRelevantCodeResponse(result=result_string)
        except Exception as e:
            raise RuntimeError(f"Failed to execute GetRelevantCode: {e}")
