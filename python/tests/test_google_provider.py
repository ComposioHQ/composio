"""Tests for the Vertex AI Google provider."""

import pytest

from composio.client.types import Tool

GoogleProvider = pytest.importorskip("composio_google").GoogleProvider


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
