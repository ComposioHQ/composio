"""
Action for creating session.
"""

import os
import typing as t
import uuid

from pydantic import BaseModel

from composio.tools.local.base.action import Action


class CreateSessionRequest(BaseModel):
    """Create zep session request."""

    session_id: t.Optional[str] = None


class CreateSessionResponse(BaseModel):
    """Create zep session response."""

    session_id: str


class CreateSession(Action):
    """Create zep session."""

    _display_name = "Create A Zep Session"
    _request_schema = CreateSessionRequest
    _response_schema = CreateSessionResponse
    _tags = ["memory", "history"]
    _tool_name = "zeptool"

    def execute(
        self,
        request_data: CreateSessionRequest,
        authorisation_data: dict,
    ) -> CreateSessionResponse:
        """Create session."""
        from zep_cloud.client import Zep  # pylint: disable=import-outside-toplevel

        client = Zep(
            api_key=os.environ.get(
                "ZEP_API_KEY",
                authorisation_data.get("api_key"),
            ),
        )
        session_id = request_data.session_id or uuid.uuid4().hex
        client.memory.add_session(session_id=session_id)
        return CreateSessionResponse(session_id=session_id)
