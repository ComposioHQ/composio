"""Tests for provider-facing tool schema aliases."""

import copy
import importlib.util
import inspect
import sys
import types
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from composio.exceptions import InvalidSchemaError
from composio.utils.shared import (
    alias_tool_input_schema,
    substitute_reserved_python_keywords,
)


PYTHON_ROOT = Path(__file__).resolve().parents[1]


def _load_module(monkeypatch, module_name: str, path: Path):
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, module_name, module)
    spec.loader.exec_module(module)
    return module


def test_alias_tool_input_schema_restores_nested_aliases_without_mutating_schema():
    schema = {
        "type": "object",
        "properties": {
            "from": {"type": "string"},
            "payload": {
                "type": "object",
                "properties": {"class": {"type": "string"}},
                "required": ["class"],
            },
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"for": {"type": "string"}},
                    "required": ["for"],
                },
            },
        },
        "required": ["from", "payload"],
    }
    original = copy.deepcopy(schema)

    aliases = alias_tool_input_schema(schema)

    assert schema == original
    assert list(aliases.schema["properties"]) == ["from_rs", "payload", "items"]
    assert aliases.schema["required"] == ["from_rs", "payload"]
    assert aliases.schema["properties"]["payload"]["required"] == ["class_rs"]
    assert aliases.schema["properties"]["items"]["items"]["required"] == ["for_rs"]

    arguments = {
        "from_rs": "sender@example.com",
        "payload": {"class_rs": "primary"},
        "items": [{"for_rs": "recipient@example.com"}],
    }
    assert aliases.restore_arguments(arguments) == {
        "from": "sender@example.com",
        "payload": {"class": "primary"},
        "items": [{"for": "recipient@example.com"}],
    }


def test_alias_tool_input_schema_rejects_duplicate_aliases():
    schema = {
        "type": "object",
        "properties": {
            "from": {"type": "string"},
            "from_rs": {"type": "string"},
        },
    }

    with pytest.raises(InvalidSchemaError, match="duplicate Python parameter alias"):
        alias_tool_input_schema(schema)


def test_legacy_keyword_helpers_use_tool_schema_aliases():
    schema = {
        "type": "object",
        "properties": {"$top": {"type": "integer"}},
        "required": ["$top"],
    }

    aliased_schema, aliases = substitute_reserved_python_keywords(schema)

    assert list(aliased_schema["properties"]) == ["_top"]
    assert aliased_schema["required"] == ["_top"]
    assert aliases["_top"] == "$top"


def test_gemini_manual_response_restores_provider_visible_aliases(monkeypatch):
    google_module = types.ModuleType("google")
    genai_module = types.ModuleType("google.genai")
    genai_types_module = types.ModuleType("google.genai.types")

    class FunctionResponse:
        def __init__(self, name, response):
            self.name = name
            self.response = response

    class Part:
        def __init__(self, function_response):
            self.function_response = function_response

    genai_types_module.FunctionResponse = FunctionResponse
    genai_types_module.Part = Part
    genai_module.types = genai_types_module
    google_module.genai = genai_module
    monkeypatch.setitem(sys.modules, "google", google_module)
    monkeypatch.setitem(sys.modules, "google.genai", genai_module)
    monkeypatch.setitem(sys.modules, "google.genai.types", genai_types_module)

    provider_module = _load_module(
        monkeypatch,
        "test_composio_gemini_provider",
        PYTHON_ROOT / "providers/gemini/composio_gemini/provider.py",
    )
    provider = provider_module.GeminiProvider()
    execute_tool = Mock(return_value={"successful": True, "data": {"ok": True}})
    tool = SimpleNamespace(
        slug="TOOL_WITH_RESERVED",
        description="Tool with reserved parameters",
        input_parameters={
            "type": "object",
            "properties": {"for": {"type": "string"}},
            "required": ["for"],
        },
    )
    provider.wrap_tools([tool], execute_tool)

    response = SimpleNamespace(
        candidates=[
            SimpleNamespace(
                content=SimpleNamespace(
                    parts=[
                        SimpleNamespace(
                            function_call=SimpleNamespace(
                                name="TOOL_WITH_RESERVED",
                                args={"for_rs": "recipient@example.com"},
                            )
                        )
                    ]
                )
            )
        ]
    )

    function_responses, executed = provider.handle_response(response)

    assert executed is True
    assert function_responses[0].function_response.name == "TOOL_WITH_RESERVED"
    execute_tool.assert_called_once_with(
        slug="TOOL_WITH_RESERVED", arguments={"for": "recipient@example.com"}
    )


def test_google_adk_wrap_tool_aliases_signature_and_restores_arguments(monkeypatch):
    google_module = types.ModuleType("google")
    adk_module = types.ModuleType("google.adk")
    tools_module = types.ModuleType("google.adk.tools")

    class FunctionTool:
        def __init__(self, func):
            self.func = func

    tools_module.FunctionTool = FunctionTool
    adk_module.tools = tools_module
    google_module.adk = adk_module
    monkeypatch.setitem(sys.modules, "google", google_module)
    monkeypatch.setitem(sys.modules, "google.adk", adk_module)
    monkeypatch.setitem(sys.modules, "google.adk.tools", tools_module)

    provider_module = _load_module(
        monkeypatch,
        "test_composio_google_adk_provider",
        PYTHON_ROOT / "providers/google_adk/composio_google_adk/provider.py",
    )
    provider = provider_module.GoogleAdkProvider()
    execute_tool = Mock(return_value={"successful": True, "data": {"ok": True}})
    tool = SimpleNamespace(
        slug="TOOL_WITH_RESERVED",
        description="Tool with reserved parameters",
        input_parameters={
            "type": "object",
            "properties": {
                "from": {"type": "string", "description": "Sender"},
                "limit": {"type": "integer", "description": "Limit"},
            },
            "required": ["from"],
        },
    )

    wrapped = provider.wrap_tool(tool, execute_tool)

    assert list(inspect.signature(wrapped.func).parameters) == ["from_rs", "limit"]
    assert "from_rs: Sender" in (wrapped.func.__doc__ or "")
    wrapped.func(from_rs="sender@example.com", limit=10)
    execute_tool.assert_called_once_with(
        slug="TOOL_WITH_RESERVED",
        arguments={"from": "sender@example.com", "limit": 10},
    )
