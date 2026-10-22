"""Tests for the CrewAI provider."""

import pytest
from pydantic import BaseModel

from composio.client.types import Tool

CrewAIProvider = pytest.importorskip("composio_crewai").CrewAIProvider


def test_wrap_tool_dereferences_internal_refs() -> None:
    """Referenced input properties must keep their type in the args schema."""
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

    wrapped = CrewAIProvider().wrap_tool(tool, lambda slug, arguments: {})
    assert wrapped.args_schema is not None
    message_type = wrapped.args_schema.model_fields["message"].annotation

    assert isinstance(message_type, type)
    assert issubclass(message_type, BaseModel)
    assert message_type.model_fields["subject"].annotation is str
