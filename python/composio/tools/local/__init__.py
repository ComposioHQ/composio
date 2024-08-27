"""Local tools."""

import importlib
from pathlib import Path

from composio.tools.base.abs import ToolRegistry, tool_registry


TOOLS_PATH = Path(__file__).parent


def load_local_tools() -> ToolRegistry:
    for tooldef in TOOLS_PATH.glob("*/tool.py"):
        importlib.import_module(
            f"composio.tools.local.{tooldef.parent.name}.{tooldef.name.replace('.py', '')}"
        )

    return tool_registry
