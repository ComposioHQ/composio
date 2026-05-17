import sys
import types
from importlib import import_module
from unittest.mock import MagicMock


class FakeFunctionTool:
    def __init__(self, func):
        self.func = func


google_module = types.ModuleType("google")
adk_module = types.ModuleType("google.adk")
tools_module = types.ModuleType("google.adk.tools")
tools_module.FunctionTool = FakeFunctionTool
adk_module.tools = tools_module
google_module.adk = adk_module
sys.modules["google"] = google_module
sys.modules["google.adk"] = adk_module
sys.modules["google.adk.tools"] = tools_module


def _provider_class():
    return import_module("composio_google_adk").GoogleAdkProvider


def test_provider_name_is_google_adk():
    provider = _provider_class()()

    assert provider.name == "google_adk"


def test_wrap_tool_handles_empty_input_parameters():
    provider = _provider_class()()
    execute_tool = MagicMock(return_value={"successful": True, "data": {"ok": True}})
    tool = MagicMock(
        slug="NO_ARG_TOOL",
        description="Run without arguments",
        input_parameters=None,
    )

    wrapped = provider.wrap_tool(tool, execute_tool)

    assert isinstance(wrapped, FakeFunctionTool)
    assert wrapped.func.__name__ == "NO_ARG_TOOL"
    assert str(wrapped.func.__signature__) == "()"
    assert wrapped.func() == {"successful": True, "data": {"ok": True}}
    execute_tool.assert_called_once_with(slug="NO_ARG_TOOL", arguments={})


def test_wrap_tool_handles_missing_description():
    provider = _provider_class()()
    tool = MagicMock(
        slug="DESCRIBE_ME",
        description=None,
        input_parameters={"type": "object", "properties": {}, "required": []},
    )

    wrapped = provider.wrap_tool(tool, MagicMock())

    assert wrapped.func.__doc__.startswith("Execute DESCRIBE_ME")
