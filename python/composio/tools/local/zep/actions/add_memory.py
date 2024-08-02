"""
Action for adding memory.
"""

# pylint: disable=import-outside-toplevel

import os
import typing as t

from pydantic import BaseModel

from composio.tools.base.local import LocalAction


class AddMemoryRequest(BaseModel):
    """Add memory to zep session request."""

    session_id: str
    messages: t.List[t.Dict]


class AddMemoryResponse(BaseModel):
    """Add memory to zep session response."""

    message: t.Optional[str] = None


class AddMemory(LocalAction[AddMemoryRequest, AddMemoryResponse]):
    """Add memory to zep session."""

    _tags = ["memory", "history"]

    def execute(self, request: AddMemoryRequest, metadata: t.Dict) -> AddMemoryResponse:
        """Add memory to a session."""

        from zep_cloud.client import Zep
        from zep_cloud.types import Message

        client = Zep(api_key=os.environ.get("ZEP_API_KEY", metadata.get("api_key")))
        result = client.memory.add(
            session_id=request.session_id,
            messages=[
                Message(
                    role=message["role"],
                    role_type=message["role_type"],
                    content=message["content"],
                    metadata=message.get("metadata"),
                )
                for message in request.messages
            ],
        )
        return AddMemoryResponse(message=result.message)
