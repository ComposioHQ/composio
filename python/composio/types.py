import typing as t

import typing_extensions as te

from composio.client.types import Tool
from composio.core.models.connected_accounts import auth_scheme
from composio.core.models.custom_tools import ExecuteRequestFn
from composio.core.models.tools import (
    Modifiers,
    ToolExecuteParams,
    ToolExecutionResponse,
)
from composio.core.models.triggers import TriggerEvent
from composio.core.provider.base import TTool, TToolCollection

# Tool versioning types
ToolkitLatestVersion = te.Literal["latest"]
ToolkitVersion = str  # Can be "latest" or any version string like "20250906_01"
ToolkitVersions = t.Dict[str, ToolkitVersion]
ToolkitVersionParam = t.Union[
    str, ToolkitVersions, None
]  # String can be any global version

__all__ = [
    # Existing types
    "Tool",
    "TTool",
    "TToolCollection",
    "ToolExecuteParams",
    "ToolExecutionResponse",
    "ExecuteRequestFn",
    "TriggerEvent",
    "Modifiers",
    "auth_scheme",
    # New tool versioning types
    "ToolkitLatestVersion",
    "ToolkitVersion",
    "ToolkitVersions",
    "ToolkitVersionParam",
]
