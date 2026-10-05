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


def test_wrap_tool_drops_keywords_vertex_rejects() -> None:
    """Composio schema keywords outside the Vertex ``Schema`` must not raise."""
    tool = Tool.model_construct(
        slug="TEST_KEYWORDS",
        description="test",
        input_parameters={
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "examples": ["is:unread"],
                    "human_parameter_name": "Search query",
                    "human_parameter_description": "What to search for",
                },
                "kind": {"type": "string", "const": "message"},
                "page_token": {
                    "description": "Next page",
                    "anyOf": [
                        {"type": "string", "examples": ["abc"]},
                        {"type": "null"},
                    ],
                },
                "amount": {
                    "description": "Amount",
                    "anyOf": [{"type": "string"}, {"type": "integer"}],
                },
                "direction": {"type": "null"},
                "label": {"type": ["string", "null"]},
                "value": {"type": ["string", "integer"]},
                "id": {
                    "type": ["string", "integer"],
                    "anyOf": [{"type": "string"}, {"type": "boolean"}],
                },
                "format": {"type": "integer", "enum": [0, 1], "exclusiveMinimum": -1},
                "target": {
                    "oneOf": [
                        {"type": "object", "properties": {"id": {"type": "string"}}},
                        {"type": "string"},
                    ]
                },
                # A property may be named like a schema keyword.
                "description": {"type": "string", "file_uploadable": True},
            },
            "required": ["query"],
        },
    )

    parameters = GoogleProvider().wrap_tool(tool).to_dict()["parameters"]
    properties = parameters["properties"]

    assert properties["query"] == {"type": "STRING"}
    assert properties["kind"] == {"type": "STRING", "enum": ["message"]}
    assert properties["page_token"] == {
        "type": "STRING",
        "description": "Next page",
        "nullable": True,
    }
    assert properties["amount"] == {
        "any_of": [
            {"type": "STRING", "description": "Amount"},
            {"type": "INTEGER", "description": "Amount"},
        ]
    }
    assert properties["direction"] == {"nullable": True}
    assert properties["label"] == {"type": "STRING", "nullable": True}
    assert properties["value"]["any_of"] == [{"type": "STRING"}, {"type": "INTEGER"}]
    assert properties["id"] == {"type": "STRING"}
    assert properties["format"] == {
        "type": "INTEGER",
        "description": "Allowed values: 0, 1.",
    }
    assert len(properties["target"]["any_of"]) == 2
    assert properties["description"] == {"type": "STRING"}

    # Vertex rejects a schema that sets any other field next to any_of.
    def any_of_stands_alone(node: Any) -> bool:
        if isinstance(node, list):
            return all(any_of_stands_alone(item) for item in node)
        if not isinstance(node, dict):
            return True
        if "any_of" in node and len(node) > 1:
            return False
        return all(any_of_stands_alone(value) for value in node.values())

    assert any_of_stands_alone(parameters)


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
        data={"results": []}, error=None, log_id="log-session"
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
