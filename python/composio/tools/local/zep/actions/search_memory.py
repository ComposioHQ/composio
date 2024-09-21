"""
Action for searching memory.
"""

import os
import typing as t

from pydantic import BaseModel

from composio.tools.base.local import LocalAction


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


class SearchMemory(LocalAction[SearchMemoryRequest, SearchMemoryResponse]):
    """Search memory from zep session."""

    _tags = ["memory", "history"]

    def execute(
        self, request: SearchMemoryRequest, metadata: t.Dict
    ) -> SearchMemoryResponse:
        """Search memory from a session."""

        from zep_cloud.client import Zep  # pylint: disable=import-outside-toplevel

        client = Zep(api_key=os.environ.get("ZEP_API_KEY", metadata.get("api_key")))
        results = client.memory.search(
            session_id=request.session_id,
            text=request.query,
            limit=request.limit,
            search_type=request.search_type,
            search_scope=request.search_scope,
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
