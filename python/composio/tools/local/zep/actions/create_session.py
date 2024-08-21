"""
Action for creating session.
"""

# pylint: disable=import-outside-toplevel

import os
import typing as t
import uuid

from pydantic import BaseModel

from composio.tools.base.local import LocalAction


class CreateSessionRequest(BaseModel):
    """Create zep session request."""

    session_id: t.Optional[str] = None


class CreateSessionResponse(BaseModel):
    """Create zep session response."""

    session_id: str


class CreateSession(LocalAction[CreateSessionRequest, CreateSessionResponse]):
    """Create zep session."""

    _tags = ["memory", "history"]

    def execute(
        self, request: CreateSessionRequest, metadata: t.Dict
    ) -> CreateSessionResponse:
        """Create a new session."""
        from zep_cloud.client import Zep

        client = Zep(api_key=os.environ.get("ZEP_API_KEY", metadata.get("api_key")))
        session_id = request.session_id or uuid.uuid4().hex
        client.memory.add_session(session_id=session_id)
        return CreateSessionResponse(session_id=session_id)
