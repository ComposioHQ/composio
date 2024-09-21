"""
Action for getting memory.
"""

# pylint: disable=import-outside-toplevel

import os
import typing as t

from pydantic import BaseModel

from composio.tools.base.local import LocalAction


class GetMemoryRequest(BaseModel):
    """Get memory from zep session request."""

    session_id: str


class GetMemoryResponse(BaseModel):
    """Get memory from zep session response."""

    messages: t.List[t.Dict]
    summary: t.Dict
    facts: t.List[str]
    metadata: t.Dict[str, t.Any]
    relevant_summaries: t.List[t.Dict]


class GetMemory(LocalAction[GetMemoryRequest, GetMemoryResponse]):
    """Get memory from zep session."""

    display_name = "Create A Zep Session"
    _request_schema = GetMemoryRequest
    _response_schema = GetMemoryResponse
    _tags = ["memory", "history"]
    _tool_name = "zeptool"

    def execute(self, request: GetMemoryRequest, metadata: t.Dict) -> GetMemoryResponse:
        """Get memory from session."""
        from zep_cloud.client import Zep

        client = Zep(api_key=os.environ.get("ZEP_API_KEY", metadata.get("api_key")))
        result = client.memory.get(session_id=request.session_id)
        return GetMemoryResponse(
            messages=[message.dict() for message in result.messages or []],
            summary=result.summary.dict() if result.summary is not None else {},
            facts=result.facts or [],
            metadata=result.metadata or {},
            relevant_summaries=[
                summary.dict() for summary in result.relevant_summaries or []
            ],
        )
