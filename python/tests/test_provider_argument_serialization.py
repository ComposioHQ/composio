"""Provider-boundary tests for validated tool argument serialization."""

import typing as t

import pytest

from composio.client.types import Tool, tool_list_response


PROVIDERS = ("crewai", "langchain", "langgraph")


def _make_tool(input_parameters: t.Dict[str, t.Any]) -> Tool:
    return Tool(
        name="Test tool",
        slug="TEST_TOOL",
        description="Test tool for provider argument serialization",
        input_parameters=input_parameters,
        output_parameters={},
        available_versions=["12012025_00"],
        version="12012025_00",
        scopes=[],
        toolkit=tool_list_response.ItemToolkit(name="Test", slug="test", logo=""),
        deprecated=tool_list_response.ItemDeprecated(
            available_versions=["12012025_00"],
            displayName="Test tool",
            version="12012025_00",
            toolkit=tool_list_response.ItemDeprecatedToolkit(logo=""),
            is_deprecated=False,
        ),
        is_deprecated=False,
        no_auth=True,
        tags=[],
    )


def _provider(name: str):
    module = pytest.importorskip(f"composio_{name}")
    class_name = {
        "crewai": "CrewAIProvider",
        "langchain": "LangchainProvider",
        "langgraph": "LanggraphProvider",
    }[name]
    return getattr(module, class_name)()


def _wrap(name: str, input_parameters: t.Dict[str, t.Any]):
    received: t.List[t.Dict[str, t.Any]] = []

    def execute_tool(slug: str, arguments: t.Dict[str, t.Any]):
        assert slug == "TEST_TOOL"
        received.append(arguments)
        return {"successful": True, "data": arguments, "error": None}

    wrapped = _provider(name).wrap_tool(_make_tool(input_parameters), execute_tool)
    return wrapped, received


def _run(name: str, wrapped: t.Any, arguments: t.Dict[str, t.Any]):
    if name == "crewai":
        return wrapped.run(**arguments)
    return wrapped.run(arguments)


@pytest.mark.parametrize("name", PROVIDERS)
def test_provider_serialization_preserves_argument_presence_and_aliases(name: str):
    wrapped, received = _wrap(
        name,
        {
            "type": "object",
            "title": "TestArguments",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer"},
                "note": {
                    "anyOf": [{"type": "string"}, {"type": "null"}],
                },
                "page": {"type": "integer", "default": 5},
                "validate": {"type": "string"},
            },
            "required": ["query"],
        },
    )

    _run(
        name,
        wrapped,
        {"query": "agents", "note": None, "validate": "yes"},
    )

    assert received == [
        {
            "query": "agents",
            "note": None,
            "page": 5,
            "validate": "yes",
        }
    ]


@pytest.mark.parametrize("name", PROVIDERS)
def test_provider_serialization_preserves_free_form_objects(name: str):
    wrapped, received = _wrap(
        name,
        {
            "type": "object",
            "title": "FreeFormArguments",
            "properties": {},
        },
    )

    _run(name, wrapped, {"custom": {"nested": True}, "items": [1, "two"]})

    assert received == [{"custom": {"nested": True}, "items": [1, "two"]}]


@pytest.mark.parametrize("name", PROVIDERS)
def test_provider_serialization_validates_pattern_only_schemas(name: str):
    wrapped, received = _wrap(
        name,
        {
            "type": "object",
            "title": "PatternArguments",
            "properties": {},
            "patternProperties": {
                "^count_": {"type": "integer", "minimum": 1},
            },
            "additionalProperties": False,
        },
    )

    _run(name, wrapped, {"count_valid": 2})
    invalid_result = _run(name, wrapped, {"count_invalid": "not-an-integer"})

    assert received == [{"count_valid": 2}]
    if name == "crewai":
        assert invalid_result["successful"] is False
        assert invalid_result["data"] is None


@pytest.mark.parametrize(
    ("arguments", "parameter"),
    [
        ({"query": "agents", "limit": "not-an-integer"}, "limit"),
        ({"limit": 5}, "query"),
    ],
)
def test_crewai_returns_structured_validation_errors(
    arguments: t.Dict[str, t.Any], parameter: str
):
    wrapped, received = _wrap(
        "crewai",
        {
            "type": "object",
            "title": "RequiredArguments",
            "properties": {
                "query": {"type": "string"},
                "limit": {"type": "integer"},
            },
            "required": ["query"],
        },
    )

    result = _run("crewai", wrapped, arguments)

    assert result["successful"] is False
    assert result["data"] is None
    assert parameter in result["error"]
    assert received == []
