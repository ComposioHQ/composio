"""Provider-boundary tests for validated tool argument serialization."""

import typing as t

import pytest

from composio.client.types import Tool, tool_list_response
from composio.utils.shared import (
    json_schema_to_model,
    validate_and_serialize_tool_arguments,
)


PROVIDERS = ("crewai", "langchain", "langgraph")


@pytest.fixture(autouse=True)
def _sandbox_provider_home(tmp_path, monkeypatch):
    """Keep provider initialization from writing caches into the real home."""
    monkeypatch.setenv("HOME", str(tmp_path))


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
def test_provider_serialization_preserves_nested_argument_presence(name: str):
    wrapped, received = _wrap(
        name,
        {
            "type": "object",
            "title": "NestedArguments",
            "properties": {
                "payload": {
                    "type": "object",
                    "title": "Payload",
                    "properties": {
                        "query": {"type": "string"},
                        "note": {
                            "anyOf": [{"type": "string"}, {"type": "null"}],
                        },
                        "explicit_null": {
                            "anyOf": [{"type": "string"}, {"type": "null"}],
                        },
                        "null_default": {
                            "anyOf": [{"type": "string"}, {"type": "null"}],
                            "default": None,
                        },
                        "page": {"type": "integer", "default": 5},
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "title": "Item",
                                "properties": {
                                    "name": {"type": "string"},
                                    "label": {
                                        "anyOf": [
                                            {"type": "string"},
                                            {"type": "null"},
                                        ],
                                    },
                                    "enabled": {
                                        "type": "boolean",
                                        "default": True,
                                    },
                                },
                                "required": ["name"],
                            },
                        },
                        "mapping": {
                            "type": "object",
                            "additionalProperties": {
                                "type": "object",
                                "title": "Entry",
                                "properties": {
                                    "name": {"type": "string"},
                                    "label": {
                                        "anyOf": [
                                            {"type": "string"},
                                            {"type": "null"},
                                        ],
                                    },
                                    "null_default": {
                                        "anyOf": [
                                            {"type": "string"},
                                            {"type": "null"},
                                        ],
                                        "default": None,
                                    },
                                    "config": {
                                        "type": "object",
                                        "properties": {
                                            "implicit": {
                                                "anyOf": [
                                                    {"type": "string"},
                                                    {"type": "null"},
                                                ],
                                            },
                                            "null_default": {
                                                "anyOf": [
                                                    {"type": "string"},
                                                    {"type": "null"},
                                                ],
                                                "default": None,
                                            },
                                        },
                                    },
                                    "score": {"type": "integer", "default": 2},
                                },
                                "required": ["name", "config"],
                            },
                        },
                    },
                    "required": ["query", "items", "mapping"],
                },
            },
            "required": ["payload"],
        },
    )

    _run(
        name,
        wrapped,
        {
            "payload": {
                "query": "agents",
                "explicit_null": None,
                "items": [
                    {"name": "first"},
                    {"name": "second", "label": None},
                ],
                "mapping": {
                    "one": {"name": "one", "config": {}},
                    "two": {"name": "two", "label": None, "config": {}},
                },
            },
        },
    )

    assert received == [
        {
            "payload": {
                "query": "agents",
                "explicit_null": None,
                "null_default": None,
                "page": 5,
                "items": [
                    {"name": "first", "enabled": True},
                    {"name": "second", "label": None, "enabled": True},
                ],
                "mapping": {
                    "one": {
                        "name": "one",
                        "null_default": None,
                        "config": {"null_default": None},
                        "score": 2,
                    },
                    "two": {
                        "name": "two",
                        "label": None,
                        "null_default": None,
                        "config": {"null_default": None},
                        "score": 2,
                    },
                },
            },
        }
    ]


@pytest.mark.parametrize("name", PROVIDERS)
def test_provider_serialization_preserves_dynamic_array_item_defaults(name: str):
    wrapped, received = _wrap(
        name,
        {
            "type": "object",
            "title": "DynamicArrayArguments",
            "patternProperties": {
                "^items_": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "implicit": {
                                "anyOf": [
                                    {"type": "string"},
                                    {"type": "null"},
                                ],
                            },
                            "null_default": {
                                "anyOf": [
                                    {"type": "string"},
                                    {"type": "null"},
                                ],
                                "default": None,
                            },
                        },
                    },
                },
            },
            "additionalProperties": False,
        },
    )

    _run(name, wrapped, {"items_a": [{}, {"implicit": None}]})

    assert received == [
        {
            "items_a": [
                {"null_default": None},
                {"implicit": None, "null_default": None},
            ]
        }
    ]


@pytest.mark.parametrize("name", PROVIDERS)
def test_provider_serialization_preserves_presence_across_overlapping_patterns(
    name: str,
):
    object_schema = {
        "type": "object",
        "properties": {
            "implicit": {
                "anyOf": [{"type": "string"}, {"type": "null"}],
            },
            "defaulted": {"type": "integer", "default": 1},
        },
    }
    wrapped, received = _wrap(
        name,
        {
            "type": "object",
            "title": "OverlappingPatternArguments",
            "patternProperties": {
                "^x": {**object_schema, "title": "First"},
                "x$": {**object_schema, "title": "Second"},
            },
            "additionalProperties": False,
        },
    )

    _run(name, wrapped, {"x": {}})

    assert received == [{"x": {"defaulted": 1}}]


@pytest.mark.parametrize("name", PROVIDERS)
@pytest.mark.parametrize("combiner", ("anyOf", "oneOf"))
def test_provider_serialization_uses_selected_composed_object_defaults(
    name: str,
    combiner: str,
):
    wrapped, received = _wrap(
        name,
        {
            "type": "object",
            "title": "ComposedArguments",
            "properties": {
                "payload": {
                    combiner: [
                        {
                            "type": "object",
                            "properties": {
                                "kind": {"type": "string", "enum": ["defaulted"]},
                                "value": {"type": "integer", "default": 5},
                                "config": {
                                    "type": "object",
                                    "properties": {
                                        "nested": {
                                            "type": "integer",
                                            "default": 7,
                                        },
                                    },
                                },
                            },
                            "required": ["kind", "config"],
                        },
                        {
                            "type": "object",
                            "properties": {
                                "kind": {"type": "string", "enum": ["plain"]},
                                "value": {
                                    "anyOf": [
                                        {"type": "integer"},
                                        {"type": "null"},
                                    ],
                                },
                                "config": {
                                    "type": "object",
                                    "properties": {
                                        "nested": {
                                            "anyOf": [
                                                {"type": "integer"},
                                                {"type": "null"},
                                            ],
                                        },
                                    },
                                },
                            },
                            "required": ["kind", "config"],
                        },
                    ],
                },
            },
            "required": ["payload"],
        },
    )

    _run(name, wrapped, {"payload": {"kind": "plain", "config": {}}})
    _run(name, wrapped, {"payload": {"kind": "defaulted", "config": {}}})

    assert received == [
        {"payload": {"kind": "plain", "config": {}}},
        {
            "payload": {
                "kind": "defaulted",
                "value": 5,
                "config": {"nested": 7},
            }
        },
    ]


@pytest.mark.parametrize("name", PROVIDERS)
@pytest.mark.parametrize("combiner", ("anyOf", "oneOf"))
def test_provider_serialization_preserves_selected_composed_null_defaults(
    name: str,
    combiner: str,
):
    nullable_string = {
        "anyOf": [{"type": "string"}, {"type": "null"}],
    }
    wrapped, received = _wrap(
        name,
        {
            "type": "object",
            "title": "ComposedNullDefaultArguments",
            "properties": {
                "payload": {
                    combiner: [
                        {
                            "type": "object",
                            "properties": {
                                "kind": {"type": "string", "enum": ["defaulted"]},
                                "value": {**nullable_string, "default": None},
                            },
                            "required": ["kind"],
                        },
                        {
                            "type": "object",
                            "properties": {
                                "kind": {"type": "string", "enum": ["plain"]},
                                "value": nullable_string,
                            },
                            "required": ["kind"],
                        },
                    ],
                },
            },
            "required": ["payload"],
        },
    )

    _run(name, wrapped, {"payload": {"kind": "plain"}})
    _run(name, wrapped, {"payload": {"kind": "defaulted"}})

    assert received == [
        {"payload": {"kind": "plain"}},
        {"payload": {"kind": "defaulted", "value": None}},
    ]


def test_provider_serialization_preserves_ref_shaped_object_defaults():
    schema = {
        "$defs": {
            "RefTarget": {
                "type": "object",
                "properties": {"value": {"type": "string"}},
            },
        },
        "type": "object",
        "title": "RefShapedDefaultArguments",
        "properties": {
            "payload": {
                "type": "object",
                "additionalProperties": True,
                "default": {"$ref": "#/$defs/RefTarget"},
            },
        },
    }
    model = json_schema_to_model(schema)

    assert model.model_validate({}).model_dump(mode="python", by_alias=True) == {
        "payload": {"$ref": "#/$defs/RefTarget"}
    }
    assert validate_and_serialize_tool_arguments(model, {}) == {
        "payload": {"$ref": "#/$defs/RefTarget"}
    }


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
