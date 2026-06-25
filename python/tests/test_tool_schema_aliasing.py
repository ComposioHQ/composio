"""Tests for provider-facing tool schema aliases."""

import asyncio
import copy
import importlib.util
import inspect
import re
import sys
import types
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from composio.exceptions import InvalidSchemaError
from composio.utils.shared import (
    alias_tool_input_schema,
    json_schema_to_model,
    substitute_reserved_python_keywords,
)


PYTHON_ROOT = Path(__file__).resolve().parents[1]
ANTHROPIC_PROPERTY_RE = re.compile(r"^[a-zA-Z0-9_.-]{1,64}$")


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
    long_name = "x" * 80
    schema = {
        "title": "ODataParams",
        "type": "object",
        "properties": {
            "$top": {"type": "integer"},
            "@microsoft.graph.conflictBehavior": {"type": "string"},
            long_name: {"type": "string"},
        },
        "required": ["$top", long_name],
    }

    aliased_schema, aliases = substitute_reserved_python_keywords(schema)

    aliased_names = list(aliased_schema["properties"])
    assert aliased_names[0] == "param_top"
    assert aliased_names[1] == "param_microsoft_graph_conflictBehavior"
    assert len(aliased_names[2]) == 64
    assert all(ANTHROPIC_PROPERTY_RE.fullmatch(name) for name in aliased_names)
    assert aliased_schema["required"] == ["param_top", aliased_names[2]]
    assert aliases["param_top"] == "$top"
    assert aliases["param_microsoft_graph_conflictBehavior"] == (
        "@microsoft.graph.conflictBehavior"
    )
    assert aliases[aliased_names[2]] == long_name
    model = json_schema_to_model(aliased_schema)
    assert "param_top" in model.model_fields


def test_alias_tool_input_schema_dereferences_refs_before_aliasing():
    schema = {
        "$ref": "#/$defs/SearchParams",
        "$defs": {
            "SearchParams": {
                "type": "object",
                "properties": {
                    "filter": {"$ref": "#/$defs/ODataFilter"},
                },
                "required": ["filter"],
            },
            "ODataFilter": {
                "type": "object",
                "properties": {"$top": {"type": "integer"}},
                "required": ["$top"],
            },
        },
    }

    aliases = alias_tool_input_schema(schema)

    assert "$defs" not in aliases.schema
    assert aliases.schema["required"] == ["filter"]
    filter_schema = aliases.schema["properties"]["filter"]
    assert list(filter_schema["properties"]) == ["param_top"]
    assert filter_schema["required"] == ["param_top"]
    assert aliases.restore_arguments({"filter": {"param_top": 10}}) == {
        "filter": {"$top": 10}
    }


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


def test_anthropic_wrap_tool_aliases_schema_and_restores_arguments(monkeypatch):
    anthropic_module = types.ModuleType("anthropic")
    types_module = types.ModuleType("anthropic.types")
    beta_module = types.ModuleType("anthropic.types.beta")
    beta_tool_use_module = types.ModuleType("anthropic.types.beta.beta_tool_use_block")
    message_module = types.ModuleType("anthropic.types.message")
    tool_param_module = types.ModuleType("anthropic.types.tool_param")
    tool_use_module = types.ModuleType("anthropic.types.tool_use_block")

    class BetaToolUseBlock:
        pass

    class Message:
        def __init__(self, **kwargs):
            self.__dict__.update(kwargs)

    class ToolUseBlock:
        pass

    beta_tool_use_module.BetaToolUseBlock = BetaToolUseBlock
    message_module.Message = Message
    tool_param_module.ToolParam = dict
    tool_use_module.ToolUseBlock = ToolUseBlock
    monkeypatch.setitem(sys.modules, "anthropic", anthropic_module)
    monkeypatch.setitem(sys.modules, "anthropic.types", types_module)
    monkeypatch.setitem(sys.modules, "anthropic.types.beta", beta_module)
    monkeypatch.setitem(
        sys.modules,
        "anthropic.types.beta.beta_tool_use_block",
        beta_tool_use_module,
    )
    monkeypatch.setitem(sys.modules, "anthropic.types.message", message_module)
    monkeypatch.setitem(sys.modules, "anthropic.types.tool_param", tool_param_module)
    monkeypatch.setitem(sys.modules, "anthropic.types.tool_use_block", tool_use_module)

    provider_module = _load_module(
        monkeypatch,
        "test_composio_anthropic_provider",
        PYTHON_ROOT / "providers/anthropic/composio_anthropic/provider.py",
    )
    provider = provider_module.AnthropicProvider()
    provider.execute_tool = Mock(return_value={"successful": True})
    long_name = "x" * 80
    tool = SimpleNamespace(
        slug="TOOL_WITH_ODATA",
        description="Tool with OData parameters",
        input_parameters={
            "type": "object",
            "properties": {
                "$top": {"type": "integer"},
                "@microsoft.graph.conflictBehavior": {"type": "string"},
                long_name: {"type": "string"},
            },
            "required": ["$top", long_name],
        },
    )

    wrapped = provider.wrap_tool(tool)

    aliased_names = list(wrapped["input_schema"]["properties"])
    assert aliased_names[0] == "param_top"
    assert aliased_names[1] == "param_microsoft_graph_conflictBehavior"
    assert len(aliased_names[2]) == 64
    assert all(ANTHROPIC_PROPERTY_RE.fullmatch(name) for name in aliased_names)

    tool_call = SimpleNamespace(
        name="TOOL_WITH_ODATA",
        input={
            "param_top": 10,
            "param_microsoft_graph_conflictBehavior": "rename",
            aliased_names[2]: "value",
        },
    )
    provider.execute_tool_call(user_id="user", tool_call=tool_call)

    provider.execute_tool.assert_called_once_with(
        slug="TOOL_WITH_ODATA",
        arguments={
            "$top": 10,
            "@microsoft.graph.conflictBehavior": "rename",
            long_name: "value",
        },
        modifiers=None,
        user_id="user",
    )


def test_claude_agent_sdk_wrap_tool_aliases_schema_and_restores_arguments(monkeypatch):
    claude_agent_sdk_module = types.ModuleType("claude_agent_sdk")

    def sdk_tool(name, description, input_schema):
        def decorator(fn):
            fn._tool_name = name
            fn._tool_description = description
            fn._input_schema = input_schema
            return fn

        return decorator

    claude_agent_sdk_module.McpSdkServerConfig = dict
    claude_agent_sdk_module.SdkMcpTool = object
    claude_agent_sdk_module.create_sdk_mcp_server = Mock()
    claude_agent_sdk_module.tool = sdk_tool
    monkeypatch.setitem(sys.modules, "claude_agent_sdk", claude_agent_sdk_module)

    provider_module = _load_module(
        monkeypatch,
        "test_composio_claude_agent_sdk_provider",
        PYTHON_ROOT
        / "providers/claude_agent_sdk/composio_claude_agent_sdk/provider.py",
    )
    provider = provider_module.ClaudeAgentSDKProvider()
    execute_tool = Mock(return_value={"successful": True})
    tool = SimpleNamespace(
        slug="TOOL_WITH_ODATA",
        description="Tool with OData parameters",
        input_parameters={
            "type": "object",
            "properties": {"$top": {"type": "integer"}},
            "required": ["$top"],
        },
    )

    wrapped = provider.wrap_tool(tool, execute_tool)

    assert list(wrapped._input_schema["properties"]) == ["param_top"]
    assert wrapped._input_schema["required"] == ["param_top"]
    result = asyncio.run(wrapped({"param_top": 5}))

    assert result["content"][0]["type"] == "text"
    execute_tool.assert_called_once_with("TOOL_WITH_ODATA", {"$top": 5})
