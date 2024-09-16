from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction
from composio.tools.local.codeindex.actions.create_index import CreateIndex


class SearchCodebaseRequest(BaseModel):
    codebase_directory: str = Field(
        ...,
        description="Absolute path to the directory containing the codebase to search",
        examples=["/home/user/projects/my-project", "/Users/developer/workspace/app"],
    )
    search_query: str = Field(
        ...,
        description="The search query to find relevant code snippets",
        examples=["implement user authentication", "database connection string"],
    )
    max_results: int = Field(
        default=5,
        description="Maximum number of search results to return",
        examples=[5, 10, 20],
    )
    file_extension: str = Field(
        None,
        description="File extension to filter results (case-insensitive). Supported types: PY, JS, TS, HTML, CSS, JAVA, CPP, C, H, MD, TXT",
        examples=["py", "js", "java"],
    )


class CodeSnippet(BaseModel):
    file_path: str = Field(
        ..., description="Relative path to the file containing the code snippet"
    )
    start_line: int = Field(
        ..., description="Starting line number of the code snippet in the file"
    )
    end_line: int = Field(
        ..., description="Ending line number of the code snippet in the file"
    )
    snippet_content: str = Field(
        ..., description="The actual content of the code snippet"
    )
    relevance_score: float = Field(
        ..., description="Relevance score of the snippet to the search query (0 to 1)"
    )
    file_type: str = Field(..., description="File type of the code snippet")


class SearchCodebaseResponse(BaseModel):
    matched_snippets: List[CodeSnippet] = Field(
        ..., description="List of matching code snippets"
    )
    error_message: Optional[str] = Field(
        default=None, description="Error message if the search operation failed"
    )


class SearchCodebase(LocalAction[SearchCodebaseRequest, SearchCodebaseResponse]):
    """
    Searches the indexed codebase for relevant code snippets based on a given query.

    This action allows a software engineering agent to find and retrieve code snippets
    that match a specific search query within an indexed codebase. It supports filtering
    by file type and provides detailed information about each matching snippet.
    """

    display_name = "Search Indexed Codebase"
    _tags = ["codebase", "search", "index"]

    def execute(
        self, request: SearchCodebaseRequest, metadata: dict
    ) -> SearchCodebaseResponse:
        import chromadb  # pylint: disable=C0415
        from chromadb.errors import ChromaError  # pylint: disable=C0415

        # Verify index existence
        index_creator = CreateIndex()
        index_status = index_creator.check_status(request.codebase_directory)
        if index_status["status"] != "completed":
            return SearchCodebaseResponse(
                matched_snippets=[],
                error_message="Codebase index is not complete or not found",
            )

        # Configure Chroma client and collection
        index_storage_path = Path.home() / ".composio" / "index_storage"
        chroma_client = chromadb.PersistentClient(path=str(index_storage_path))
        collection_name = Path(request.codebase_directory).name

        embedding_type = index_status.get("embedding_type", "local")
        embedding_function = index_creator.create_embedding_function(embedding_type)

        try:
            chroma_collection = chroma_client.get_collection(
                name=collection_name, embedding_function=embedding_function
            )

            # Set up file type filter if specified
            file_type_filter = None
            if request.file_extension:
                file_type_filter = {
                    "file_type": {"$eq": request.file_extension.upper()}
                }

            # Execute the search query
            if file_type_filter:
                search_results = chroma_collection.query(
                    query_texts=[request.search_query],
                    n_results=request.max_results,
                    where=file_type_filter,
                )
            else:
                search_results = chroma_collection.query(
                    query_texts=[request.search_query],
                    n_results=request.max_results,
                )

            # Process and format the search results
            matched_snippets = []
            if all(
                key in search_results for key in ["documents", "metadatas", "distances"]
            ):
                if (
                    search_results
                    and search_results["documents"]
                    and search_results["metadatas"]
                    and search_results["distances"]
                ):
                    for snippet, mdata, distance in zip(
                        search_results["documents"][0],
                        search_results["metadatas"][0],
                        search_results["distances"][0],
                    ):
                        matched_snippets.append(
                            CodeSnippet(
                                file_path=str(mdata["file_path"]),
                                start_line=int(mdata["start_line"]),
                                end_line=int(mdata["end_line"]),
                                file_type=str(mdata["file_type"]),
                                snippet_content=snippet,
                                relevance_score=round(1 - distance, 4),
                            )
                        )

            return SearchCodebaseResponse(matched_snippets=matched_snippets)
        except ChromaError as chroma_error:
            return SearchCodebaseResponse(
                matched_snippets=[],
                error_message=f"Failed to access collection '{collection_name}': {str(chroma_error)}",
            )
        except Exception as general_error:
            error_details = f"An unexpected error occurred during the search operation: {str(general_error)}"
            print(error_details)
            return SearchCodebaseResponse(
                matched_snippets=[], error_message=error_details
            )
