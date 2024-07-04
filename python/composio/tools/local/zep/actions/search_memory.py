"""
Action for searching memory.
"""

import os
import typing as t

from pydantic import BaseModel

from composio.tools.local.base.action import Action


class SearchMemoryRequest(BaseModel):
    """Search memory from zep session request."""

    session_id: str

    query: str
    limit: int = 10
    search_type: str = "similarity"
    search_scope: str = "facts"


class SearchResult(BaseModel):
    """Search memory from zep session result."""

    message: t.Optional[t.Dict]
    metadata: t.Optional[t.Dict[str, t.Any]]
    summary: t.Optional[t.Dict]
    score: t.Optional[float]


class SearchMemoryResponse(BaseModel):
    """Search memory from zep session response."""

    results: t.List[SearchResult]


class SearchMemory(Action):
    """Search memory from zep session."""

    _display_name = "Search Memory From Zep Session"
    _request_schema = SearchMemoryRequest
    _response_schema = SearchMemoryResponse
    _tags = ["memory", "history"]
    _tool_name = "zeptool"

    def execute(
        self,
        request_data: SearchMemoryRequest,
        authorisation_data: dict,
    ) -> SearchMemoryResponse:
        """Create session."""
        from zep_cloud.client import Zep  # pylint: disable=import-outside-toplevel

        client = Zep(
            api_key=os.environ.get(
                "ZEP_API_KEY",
                authorisation_data.get("api_key"),
            ),
        )
        results = client.memory.search(
            session_id=request_data.session_id,
            text=request_data.query,
            limit=request_data.limit,
            search_type=request_data.search_type,
            search_scope=request_data.search_scope,
        )
        return SearchMemoryResponse(
            results=[
                SearchResult(
                    message=(
                        result.message.dict() if result.message is not None else {}
                    ),
                    metadata=result.metadata,
                    summary=(
                        result.summary.dict() if result.summary is not None else {}
                    ),
                    score=result.score,
                )
                for result in results
            ]
        )
