"""Provider-boundary tests for validated tool argument serialization."""

import ast
import asyncio
import importlib
import json
import os
import typing as t

import pydantic
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


# ---------------------------------------------------------------------------
# Cross-provider matrix for free-form object arguments (SUP-1643).
#
# Each row drives a provider through the entry point its framework really
# calls, because the frameworks drop keys before our wrapper code runs.
# ---------------------------------------------------------------------------

# Providers this environment must have. CI and nox set it so a missing
# install fails instead of skipping; locally it is usually empty.
EXPECTED_PROVIDERS = frozenset(
    os.environ.get("COMPOSIO_EXPECTED_PROVIDERS", "").replace(",", " ").split()
)

# Row name -> (provider package, provider class).
MATRIX_PROVIDERS: t.Dict[str, t.Tuple[str, str]] = {
    "crewai": ("crewai", "CrewAIProvider"),
    "langchain": ("langchain", "LangchainProvider"),
    "langchain_async": ("langchain", "LangchainProvider"),
    "langgraph": ("langgraph", "LanggraphProvider"),
    "gemini": ("gemini", "GeminiProvider"),
    "autogen": ("autogen", "AutogenProvider"),
    "autogen_ag2": ("autogen", "AutogenProvider"),
    "google_adk": ("google_adk", "GoogleAdkProvider"),
    "llamaindex": ("llamaindex", "LlamaIndexProvider"),
    "openai_agents": ("openai_agents", "OpenAIAgentsProvider"),
}

# Providers that validate arguments on the client. LlamaIndex and OpenAI
# Agents pass the model's arguments through, so they only get preservation
# rows.
VALIDATING_PROVIDERS = frozenset(
    {
        "crewai",
        "langchain",
        "langchain_async",
        "langgraph",
        "gemini",
        "autogen",
        "autogen_ag2",
        "google_adk",
    }
)


def _matrix_provider(row: str):
    package, class_name = MATRIX_PROVIDERS[row]
    try:
        module = importlib.import_module(f"composio_{package}")
    except ImportError as error:
        if package in EXPECTED_PROVIDERS:
            pytest.fail(f"composio_{package} is expected here but missing: {error}")
        pytest.skip(f"composio_{package} is not installed")
    return getattr(module, class_name)()


def _matrix_call(row: str, input_parameters: t.Dict[str, t.Any], arguments):
    """Wrap a tool, call it through the framework, and record what executes."""
    received: t.List[t.Dict[str, t.Any]] = []

    def execute_tool(slug: str, arguments: t.Dict[str, t.Any]):
        assert slug == "TEST_TOOL"
        received.append(arguments)
        return {"successful": True, "data": {}, "error": None}

    provider = _matrix_provider(row)
    tool = _make_tool(input_parameters)
    wrapped = provider.wrap_tool(tool, execute_tool)
    try:
        result = _matrix_invoke(row, provider, wrapped, arguments)
    except pydantic.ValidationError as error:
        # Gemini's callable raises; google-genai reports it back to the model.
        result = error
    return received, result


def _matrix_invoke(row: str, provider, wrapped, arguments):
    if row == "crewai":
        result = wrapped.run(**arguments)
    elif row in ("langchain", "langgraph"):
        result = wrapped.invoke(arguments)
    elif row == "langchain_async":
        result = asyncio.run(wrapped.ainvoke(arguments))
    elif row == "gemini":
        # Gemini's automatic function calling invokes the callable directly.
        result = wrapped(**arguments)
    elif row == "autogen":
        from autogen_core import CancellationToken

        result = asyncio.run(wrapped.run_json(arguments, CancellationToken()))
    elif row == "autogen_ag2":
        from autogen import ConversableAgent

        caller = ConversableAgent(
            "caller",
            llm_config={"config_list": [{"model": "gpt-4o-mini", "api_key": "x"}]},
            human_input_mode="NEVER",
        )
        executor = ConversableAgent(
            "executor", llm_config=False, human_input_mode="NEVER"
        )
        provider.register_tools(caller=caller, executor=executor, tools=[wrapped])
        _, result = executor.execute_function(
            {"name": wrapped.name, "arguments": json.dumps(arguments)}
        )
    elif row == "google_adk":
        from unittest.mock import MagicMock

        context = MagicMock()
        context.tool_confirmation = None
        result = asyncio.run(wrapped.run_async(args=arguments, tool_context=context))
    elif row == "llamaindex":
        result = wrapped.call(**arguments)
    elif row == "openai_agents":
        result = asyncio.run(wrapped.on_invoke_tool(None, json.dumps(arguments)))
    else:  # pragma: no cover - guarded by MATRIX_PROVIDERS
        raise AssertionError(row)
    return result


# Cases whose arguments every provider must deliver unchanged.
PRESERVATION_CASES: t.Dict[str, t.Tuple[t.Dict[str, t.Any], t.Dict[str, t.Any]]] = {
    # The customer-reported shape: a free-form object under a declared property.
    "nested_free_form": (
        {
            "type": "object",
            "title": "NestedFreeForm",
            "properties": {
                "title": {"type": "string"},
                "body": {"type": "object"},
            },
            "required": ["title", "body"],
        },
        {"title": "t", "body": {"unit": {"id": 7}, "tags": ["a"]}},
    ),
    "nested_additional_properties_schema": (
        {
            "type": "object",
            "title": "NestedMap",
            "properties": {
                "body": {
                    "type": "object",
                    "additionalProperties": {"type": "string"},
                },
            },
            "required": ["body"],
        },
        {"body": {"a": "x", "b": "y"}},
    ),
    "array_of_free_form_objects": (
        {
            "type": "object",
            "title": "FreeFormItems",
            "properties": {
                "items": {"type": "array", "items": {"type": "object"}},
            },
            "required": ["items"],
        },
        {"items": [{"a": 1}, {"b": {"c": 2}}]},
    ),
    "root_free_form": (
        {"type": "object", "title": "RootFreeForm", "properties": {}},
        {"custom": {"nested": True}},
    ),
    "root_additional_properties": (
        {
            "type": "object",
            "title": "RootOpen",
            "properties": {"title": {"type": "string"}},
            "required": ["title"],
            "additionalProperties": True,
        },
        {"title": "t", "extra": {"k": 1}},
    ),
}

# Cases every validating provider must reject without executing the tool.
REJECTION_CASES: t.Dict[str, t.Tuple[t.Dict[str, t.Any], t.Dict[str, t.Any]]] = {
    "nested_map_value_type": (
        PRESERVATION_CASES["nested_additional_properties_schema"][0],
        {"body": {"a": 1}},
    ),
    "pattern_property_type": (
        {
            "type": "object",
            "title": "PatternArguments",
            "properties": {},
            "patternProperties": {"^count_": {"type": "integer", "minimum": 1}},
            "additionalProperties": False,
        },
        {"count_x": "nope"},
    ),
    # Unknown root keys on a schema that declares properties and omits
    # additionalProperties are rejected, not dropped.
    "closed_root_unknown_key": (
        {
            "type": "object",
            "title": "ClosedRoot",
            "properties": {"title": {"type": "string"}},
            "required": ["title"],
        },
        {"title": "t", "extra": 1},
    ),
    # String-encoded scalars are rejected, not coerced.
    "string_for_integer": (
        {
            "type": "object",
            "title": "IntegerArgument",
            "properties": {"limit": {"type": "integer"}},
            "required": ["limit"],
        },
        {"limit": "5"},
    ),
}


def _matrix_params(rows, cases):
    return [
        pytest.param(row, case, id=f"{row}-{case}") for row in rows for case in cases
    ]


@pytest.mark.parametrize(
    ("row", "case"), _matrix_params(MATRIX_PROVIDERS, PRESERVATION_CASES)
)
def test_matrix_preserves_free_form_arguments(row: str, case: str):
    input_parameters, arguments = PRESERVATION_CASES[case]

    received, _ = _matrix_call(row, input_parameters, arguments)

    assert received == [arguments]


@pytest.mark.parametrize(
    ("row", "case"),
    _matrix_params(
        [row for row in MATRIX_PROVIDERS if row in VALIDATING_PROVIDERS],
        REJECTION_CASES,
    ),
)
def test_matrix_rejects_invalid_dynamic_arguments(row: str, case: str):
    input_parameters, arguments = REJECTION_CASES[case]

    received, result = _matrix_call(row, input_parameters, arguments)

    assert received == []
    error = _rejection_error(row, result)
    if error is not None:
        assert REJECTION_FIELDS[case] in error


# The argument each rejection case's error must name.
REJECTION_FIELDS = {
    "nested_map_value_type": "body.a",
    "pattern_property_type": "count_x",
    "closed_root_unknown_key": "extra",
    "string_for_integer": "limit",
}


def _rejection_error(row: str, result: t.Any) -> t.Optional[str]:
    """The validation error a rejected call reported, in its framework's shape.

    Fails on any other result, so a crash cannot pass as a rejection. Returns
    ``None`` where the framework hides the detail.
    """
    if row in ("langchain", "langchain_async", "langgraph"):
        # `handle_validation_error=True` replaces the detail with this string.
        assert result == "Tool input validation error"
        return None
    if row == "gemini":
        assert isinstance(result, pydantic.ValidationError)
        return str(result)
    if row == "autogen_ag2":
        # AG2 returns the tool result serialized into the function message.
        result = ast.literal_eval(result["content"])
    assert isinstance(result, dict), result
    assert result["successful"] is False
    assert result["data"] is None
    return result["error"]


# ---------------------------------------------------------------------------
# Google ADK: validation errors reach the agent as results (SUP-1643).
# ---------------------------------------------------------------------------


def test_google_adk_returns_validation_errors_without_executing():
    input_parameters, arguments = REJECTION_CASES["pattern_property_type"]

    received, result = _matrix_call("google_adk", input_parameters, arguments)

    assert received == []
    assert result["successful"] is False
    assert result["data"] is None
    assert "count_x" in result["error"]


def test_google_adk_keeps_tool_context_out_of_arguments():
    received, _ = _matrix_call(
        "google_adk",
        {"type": "object", "title": "RootFreeForm", "properties": {}},
        {"custom": {"nested": True}},
    )

    assert received == [{"custom": {"nested": True}}]


def test_google_adk_does_not_forward_reserved_argument_names():
    # ADK reserves `tool_context` and `input_stream`; a model-supplied value
    # for either must not reach the tool backend on a free-form root.
    received, _ = _matrix_call(
        "google_adk",
        {"type": "object", "title": "RootFreeForm", "properties": {}},
        {"tool_context": {"forged": True}, "input_stream": "x", "data": 1},
    )

    assert received == [{"data": 1}]


def test_google_adk_never_sends_its_context_object_to_the_backend():
    # A schema property named like ADK's context parameter makes ADK inject
    # its own ToolContext under that name; it must never be executed with.
    received, result = _matrix_call(
        "google_adk",
        {
            "type": "object",
            "title": "ReservedProperty",
            "properties": {
                "query": {"type": "string"},
                # Untyped, so validation alone would accept any object.
                "tool_context": {"description": "A tool argument"},
            },
            "required": ["query", "tool_context"],
        },
        {"query": "q", "tool_context": "model value"},
    )

    assert received == []
    assert "tool_context" in result["error"]


# ---------------------------------------------------------------------------
# AutoGen: both runtime paths share one validated execution (SUP-1643).
# ---------------------------------------------------------------------------

AUTOGEN_ROWS = ("autogen", "autogen_ag2")


def _autogen_result(row: str, result: t.Any) -> t.Any:
    """The tool's return value, unwrapped from AG2's function message."""
    if row == "autogen_ag2":
        # AG2 serializes a dict result with ``str()``.
        return ast.literal_eval(result["content"])
    return result


@pytest.mark.parametrize("row", AUTOGEN_ROWS)
def test_autogen_returns_structured_validation_error(row: str):
    input_parameters, arguments = REJECTION_CASES["pattern_property_type"]

    received, result = _matrix_call(row, input_parameters, arguments)

    result = _autogen_result(row, result)
    assert received == []
    assert result["successful"] is False
    assert result["data"] is None
    assert "count_x" in result["error"]


@pytest.mark.parametrize("row", AUTOGEN_ROWS)
def test_autogen_omits_optional_arguments_the_model_left_out(row: str):
    received, _ = _matrix_call(
        row,
        {
            "type": "object",
            "title": "OptionalArguments",
            "properties": {
                "query": {"type": "string"},
                "note": {"type": "string"},
            },
            "required": ["query"],
        },
        {"query": "agents"},
    )

    assert received == [{"query": "agents"}]


@pytest.mark.parametrize("row", AUTOGEN_ROWS)
def test_autogen_restores_reserved_keyword_arguments(row: str):
    received, _ = _matrix_call(
        row,
        {
            "type": "object",
            "title": "ReservedArguments",
            "properties": {"from": {"type": "string"}},
            "required": ["from"],
        },
        {"from_rs": "alice"},
    )

    assert received == [{"from": "alice"}]


def test_autogen_run_json_normalizes_string_payload():
    received, _ = _matrix_call(
        "autogen",
        PRESERVATION_CASES["nested_free_form"][0] | {"required": ["body"]},
        '{"body": {"a": 1}}',
    )

    assert received == [{"body": {"a": 1}}]


def test_autogen_run_json_logs_the_tool_call(caplog: pytest.LogCaptureFixture):
    input_parameters, arguments = PRESERVATION_CASES["root_free_form"]

    with caplog.at_level("INFO"):
        received, _ = _matrix_call("autogen", input_parameters, arguments)

    from autogen_core import EVENT_LOGGER_NAME
    from autogen_core.logging import ToolCallEvent

    events = [
        record.msg
        for record in caplog.records
        if record.name == EVENT_LOGGER_NAME and isinstance(record.msg, ToolCallEvent)
    ]
    assert received == [arguments]
    assert [json.loads(str(event))["arguments"] for event in events] == [arguments]


@pytest.mark.parametrize(
    ("input_parameters", "expected"),
    [
        (
            PRESERVATION_CASES["root_free_form"][0],
            {"additionalProperties": True},
        ),
        (
            REJECTION_CASES["pattern_property_type"][0],
            {
                "additionalProperties": False,
                "patternProperties": {"^count_": {"type": "integer", "minimum": 1}},
            },
        ),
    ],
    ids=["root_free_form", "pattern_only"],
)
def test_autogen_schema_mirrors_root_openness(
    input_parameters: t.Dict[str, t.Any], expected: t.Dict[str, t.Any]
):
    wrapped = _matrix_provider("autogen").wrap_tool(
        _make_tool(input_parameters), lambda slug, arguments: {}
    )

    parameters = wrapped.schema["parameters"]

    assert {key: parameters.get(key) for key in expected} == expected
