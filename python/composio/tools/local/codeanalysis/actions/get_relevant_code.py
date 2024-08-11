from typing import Type
from composio.tools.local.base import Action
from composio.tools.local.codeanalysis import embedder

from pydantic import BaseModel, Field


class GetRelevantCodeInput(BaseModel):
    repo_path: str = Field(
        ...,
        description="Path to the repository",
    )
    query: str = Field(
        ...,
        description="Query to retrieve relevant code from the repository",
    )


class GetRelevantCodeOutput(BaseModel):
    result: str = Field(
        ...,
        description="Retrieved method body as a string, including any decorators and comments",
    )


class GetRelevantCode(Action):
    """
    Retrieves the body of a specified method.

    This action can retrieve the method body in two scenarios:
    1. If a class name is provided, it retrieves the method from within that class.
    2. If no class name is provided, it retrieves the method from the global scope.

    The retrieved body includes any decorators and comments associated with the method.
    """

    _display_name = "Get Relevant Code"
    _request_schema: Type[GetRelevantCodeInput] = GetRelevantCodeInput
    _response_schema: Type[GetRelevantCodeOutput] = GetRelevantCodeOutput

    def execute(self, request_data: GetRelevantCodeInput) -> GetRelevantCodeOutput:
        try:
            vector_store = embedder.get_vector_store(request_data.repo_path, overwrite=False)
            query = request_data.query
            results = embedder.get_topn_chunks_from_query(vector_store, query, top_n=5)  
            sep = "\n" + "="*100 + "\n"
            result_string = "Query: " + query + sep
            for i,metadata in enumerate(results['metadata']):
                result_string += (f"Chunk {i+1}: \n" + str(metadata['chunk']) + sep)
            return GetRelevantCodeOutput(result=result_string)
        except Exception as e:
            raise RuntimeError(f"Failed to execute GetRelevantCode: {e}")
