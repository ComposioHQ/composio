"""
Action for getting memory.
"""

import os
import typing as t

from pydantic import BaseModel

from composio.tools.local.base.action import Action


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


class GetMemory(Action):
    """Get memory from zep session."""

    _display_name = "Create A Zep Session"
    _request_schema = GetMemoryRequest
    _response_schema = GetMemoryResponse
    _tags = ["memory", "history"]
    _tool_name = "zeptool"

    def execute(
        self,
        request_data: GetMemoryRequest,
        authorisation_data: dict,
    ) -> GetMemoryResponse:
        """Create session."""
        from zep_cloud.client import Zep  # pylint: disable=import-outside-toplevel

        client = Zep(
            api_key=os.environ.get(
                "ZEP_API_KEY",
                authorisation_data.get("api_key"),
            ),
        )
        result = client.memory.get(
            session_id=request_data.session_id,
        )
        return GetMemoryResponse(
            messages=[message.dict() for message in result.messages or []],
            summary=result.summary.dict() if result.summary is not None else {},
            facts=result.facts or [],
            metadata=result.metadata or {},
            relevant_summaries=[
                summary.dict() for summary in result.relevant_summaries or []
            ],
        )
