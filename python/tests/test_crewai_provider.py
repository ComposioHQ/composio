"""Tests for the CrewAI provider's argument handling.

CrewAI validates and dumps tool arguments in ``BaseTool.run`` before ``_run`` is
reached, so the provider has to control that step itself. See the wrapper in
``composio_crewai.providers``.
"""

import typing as t

import pytest

from composio.client.types import Tool


crewai = pytest.importorskip("crewai", reason="crewai is not installed")

from composio_crewai import CrewAIProvider  # noqa: E402


def _tool(properties: t.Dict[str, t.Any], required: t.List[str]) -> Tool:
    return Tool.construct(
        slug="TEST_TOOL",
        name="Test tool",
        description="A tool for testing",
        input_parameters={
            "type": "object",
            "title": "Request",
            "properties": properties,
            "required": required,
        },
        output_parameters={},
        toolkit={"slug": "test", "name": "Test"},
        available_versions=["latest"],
        version="latest",
        tags=[],
        no_auth=True,
        deprecated=None,
        scopes=[],
    )


def _wrap(tool: Tool):
    """Wrap a tool, returning it alongside the payloads its executor receives."""
    received: t.List[t.Dict[str, t.Any]] = []

    def execute_tool(slug: str, arguments: t.Dict) -> t.Dict:
        received.append(arguments)
        return {"successful": True, "data": arguments}

    wrapped = CrewAIProvider().wrap_tools([tool], execute_tool)[0]
    return wrapped, received


def test_unset_optional_arguments_are_not_sent():
    """Optional parameters the model never supplied must not reach the backend.

    CrewAI's ``model_dump()`` materializes every field, turning "not supplied"
    into an explicit ``None``.
    """
    tool = _tool(
        {
            "query": {"type": "string"},
            "limit": {"type": "integer"},
            "note": {"type": "string"},
        },
        required=["query"],
    )
    wrapped, received = _wrap(tool)

    wrapped.run(query="ai")

    assert received == [{"query": "ai"}]


def test_supplied_arguments_are_preserved():
    tool = _tool(
        {"query": {"type": "string"}, "limit": {"type": "integer"}},
        required=["query"],
    )
    wrapped, received = _wrap(tool)

    wrapped.run(query="ai", limit=5)

    assert received == [{"query": "ai", "limit": 5}]


def test_reserved_parameter_names_reach_the_backend_unaliased():
    """``validate`` is aliased to ``validate_`` for pydantic; undo it on the way out."""
    tool = _tool(
        {"validate": {"type": "string"}, "query": {"type": "string"}},
        required=["query"],
    )
    wrapped, received = _wrap(tool)

    wrapped.run(query="ai", validate="yes")

    assert received == [{"query": "ai", "validate": "yes"}]


def test_invalid_argument_type_returns_structured_error():
    """CrewAI raises ``ValueError`` from ``run``; the provider must still answer."""
    tool = _tool(
        {"query": {"type": "string"}, "limit": {"type": "integer"}},
        required=["query"],
    )
    wrapped, received = _wrap(tool)

    result = wrapped.run(query="ai", limit="not-an-integer")

    assert result["successful"] is False
    assert result["data"] is None
    assert "limit" in result["error"]
    assert received == []


def test_missing_required_argument_returns_structured_error():
    tool = _tool({"query": {"type": "string"}}, required=["query"])
    wrapped, received = _wrap(tool)

    result = wrapped.run()

    assert result["successful"] is False
    assert result["data"] is None
    assert "query" in result["error"]
    assert received == []
