"""
Action for adding memory.
"""

import os
import typing as t

from pydantic import BaseModel

from composio.tools.local.base.action import Action


class AddMemoryRequest(BaseModel):
    """Add memory to zep session request."""

    session_id: str
    messages: t.List[t.Dict]


class AddMemoryResponse(BaseModel):
    """Add memory to zep session response."""

    message: t.Optional[str] = None


class AddMemory(Action):
    """Add memory to zep session."""

    _display_name = "Create A Zep Session"
    _request_schema = AddMemoryRequest
    _response_schema = AddMemoryResponse
    _tags = ["memory", "history"]
    _tool_name = "zeptool"

    def execute(
        self,
        request_data: AddMemoryRequest,
        authorisation_data: dict,
    ) -> AddMemoryResponse:
        """Create session."""
        from zep_cloud.client import Zep  # pylint: disable=import-outside-toplevel
        from zep_cloud.types import Message  # pylint: disable=import-outside-toplevel

        client = Zep(
            api_key=os.environ.get(
                "ZEP_API_KEY",
                authorisation_data.get("api_key"),
            ),
        )
        result = client.memory.add(
            session_id=request_data.session_id,
            messages=[
                Message(
                    role=message["role"],
                    role_type=message["role_type"],
                    content=message["content"],
                    metadata=message.get("metadata"),
                )
                for message in request_data.messages
            ],
        )
        return AddMemoryResponse(message=result.message)
