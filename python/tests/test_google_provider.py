"""Tests for the Vertex AI Google provider."""

from types import SimpleNamespace
from typing import Any
from unittest.mock import Mock

import pytest

from composio.client.types import Tool

GoogleProvider = pytest.importorskip("composio_google").GoogleProvider
GenerationResponse = pytest.importorskip(
    "vertexai.generative_models"
).GenerationResponse


def test_wrap_tool_dereferences_internal_refs() -> None:
    """Referenced input properties must be expanded before Vertex translation."""
    tool = Tool.model_construct(
        slug="TEST_REF",
        description="test",
        input_parameters={
            "type": "object",
            "properties": {"message": {"$ref": "#/$defs/Message"}},
            "required": ["message"],
            "$defs": {
                "Message": {
                    "type": "object",
                    "properties": {"subject": {"type": "string"}},
                    "required": ["subject"],
                }
            },
        },
    )

    wrapped = GoogleProvider().wrap_tool(tool)
    message_schema = wrapped.to_dict()["parameters"]["properties"]["message"]

    assert "ref" not in message_schema
    assert message_schema["properties"]["subject"]["type"] == "STRING"


def _function_call_response() -> Any:
    return GenerationResponse.from_dict(
        {
            "candidates": [
                {
                    "content": {
                        "role": "model",
                        "parts": [
                            {"text": "Searching"},
                            {
                                "function_call": {
                                    "name": "COMPOSIO_SEARCH_TOOLS",
                                    "args": {"query": "send an email"},
                                }
                            },
                        ],
                    }
                }
            ]
        }
    )


def _session() -> Mock:
    session = Mock()
    session.execute.return_value = SimpleNamespace(
        data={"results": []},
        error=None,
        log_id="log-session",
        result_type="completed",
    )
    return session


def test_handle_response_routes_function_calls_through_session() -> None:
    """Session tools execute through their Tool Router session, not tools.execute."""
    provider = GoogleProvider()
    provider.execute_tool = Mock()
    session = _session()

    results = provider.handle_response(
        response=_function_call_response(), session=session
    )

    session.execute.assert_called_once_with(
        tool_slug="COMPOSIO_SEARCH_TOOLS", arguments={"query": "send an email"}
    )
    provider.execute_tool.assert_not_called()
    assert results == [{"data": {"results": []}, "error": None, "successful": True}]


def test_handle_response_keeps_direct_user_id_execution() -> None:
    """Existing positional user-ID calls keep the direct execution path."""
    provider = GoogleProvider()
    provider.execute_tool = Mock(
        return_value={"data": {}, "error": None, "successful": True}
    )
    modifiers = [Mock()]

    results = provider.handle_response("user_123", _function_call_response(), modifiers)

    provider.execute_tool.assert_called_once_with(
        slug="COMPOSIO_SEARCH_TOOLS",
        arguments={"query": "send an email"},
        modifiers=modifiers,
        user_id="user_123",
    )
    assert results == [{"data": {}, "error": None, "successful": True}]


def test_execute_tool_call_routes_through_session() -> None:
    provider = GoogleProvider()
    provider.execute_tool = Mock()
    session = _session()
    function_call = SimpleNamespace(name="COMPOSIO_SEARCH_TOOLS", args={"query": "x"})

    result = provider.execute_tool_call(session=session, function_call=function_call)

    session.execute.assert_called_once_with(
        tool_slug="COMPOSIO_SEARCH_TOOLS", arguments={"query": "x"}
    )
    provider.execute_tool.assert_not_called()
    assert result == {"data": {"results": []}, "error": None, "successful": True}


def test_handle_response_rejects_modifiers_with_session() -> None:
    provider = GoogleProvider()
    session = _session()

    with pytest.raises(ValueError, match="cannot be used with a Tool Router session"):
        provider.handle_response(
            response=_function_call_response(),
            session=session,
            modifiers=[Mock()],
        )
    session.execute.assert_not_called()


def test_execute_tool_call_requires_exactly_one_target() -> None:
    provider = GoogleProvider()
    function_call = SimpleNamespace(name="COMPOSIO_SEARCH_TOOLS", args={})

    with pytest.raises(ValueError, match="exactly one of user_id or session"):
        provider.execute_tool_call(
            user_id="user_123", session=_session(), function_call=function_call
        )
