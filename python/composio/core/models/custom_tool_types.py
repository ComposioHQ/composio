"""Type definitions for custom tools in tool router sessions.

Mirrors the TypeScript types in ts/packages/core/src/types/customTool.types.ts
"""

from __future__ import annotations

import re
import typing as t
from dataclasses import dataclass, field

import typing_extensions as te
from pydantic import BaseModel

from composio_client.types.tool_router.session_execute_response import (
    SessionExecuteResponse,
)
from composio_client.types.tool_router.session_proxy_execute_response import (
    SessionProxyExecuteResponse,
)

# ────────────────────────────────────────────────────────────────
# Constants
# ────────────────────────────────────────────────────────────────

LOCAL_TOOL_PREFIX = "LOCAL_"
MAX_SLUG_LENGTH = 60
SLUG_REGEX = re.compile(r"^[A-Za-z0-9_-]+$")

# ────────────────────────────────────────────────────────────────
# Execute function type
# ────────────────────────────────────────────────────────────────

CustomToolExecuteFn = t.Callable[
    [t.Any, "SessionContext"],
    t.Dict[str, t.Any],
]
"""
Execute function for custom tools.

Signature: (input: BaseModel, ctx: SessionContext) -> dict

Just return the result data, or raise an error. The SDK wraps it internally
into {data, error, successful}.
"""

# ────────────────────────────────────────────────────────────────
# SessionContext protocol
# ────────────────────────────────────────────────────────────────


class SessionContext(te.Protocol):
    """Session context injected into custom tool execute functions at runtime.

    Provides identity context and methods to call other tools or proxy API requests.
    """

    @property
    def user_id(self) -> str: ...

    def execute(
        self,
        tool_slug: str,
        arguments: t.Dict[str, t.Any],
    ) -> SessionExecuteResponse:
        """Execute any Composio tool from within a custom tool.

        Returns the same response model as ``session.execute()``.
        """
        ...

    def proxy_execute(
        self,
        *,
        toolkit: str,
        endpoint: str,
        method: t.Literal["GET", "POST", "PUT", "DELETE", "PATCH"],
        body: t.Any = None,
        parameters: t.Optional[t.List[t.Dict[str, t.Any]]] = None,
    ) -> SessionProxyExecuteResponse:
        """Proxy API calls through Composio's auth layer.

        Returns the same response model as ``session.proxy_execute()``.
        """
        ...


# ────────────────────────────────────────────────────────────────
# Custom tool / toolkit definitions (returned by factory functions)
# ────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class CustomTool:
    """Custom tool definition returned from ``@composio.experimental.tool()``.

    Pass to ``composio.create(user_id, experimental={"custom_tools": [...]})``
    to bind to a session.
    """

    slug: str
    name: str
    description: str
    input_schema: t.Dict[str, t.Any]
    input_params: t.Type[BaseModel]
    execute: CustomToolExecuteFn
    extends_toolkit: t.Optional[str] = None
    output_schema: t.Optional[t.Dict[str, t.Any]] = None


# ────────────────────────────────────────────────────────────────
# Internal routing map types
# ────────────────────────────────────────────────────────────────


@dataclass
class CustomToolsMapEntry:
    """Entry in the per-session custom tools routing map."""

    handle: CustomTool
    final_slug: str
    toolkit: t.Optional[str] = None


@dataclass
class CustomToolsMap:
    """Lookup maps used by ToolRouterSession for routing custom tools."""

    by_final_slug: t.Dict[str, CustomToolsMapEntry] = field(default_factory=dict)
    by_original_slug: t.Dict[str, CustomToolsMapEntry] = field(default_factory=dict)
    toolkits: t.Optional[t.List[t.Any]] = None


# ────────────────────────────────────────────────────────────────
# Registered types (returned by session.custom_tools() / .custom_toolkits())
# ────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class RegisteredCustomTool:
    """A custom tool as registered in a session, with its final resolved slug."""

    slug: str
    name: str
    description: str
    input_schema: t.Dict[str, t.Any]
    toolkit: t.Optional[str] = None
    output_schema: t.Optional[t.Dict[str, t.Any]] = None


@dataclass(frozen=True)
class RegisteredCustomToolkit:
    """A custom toolkit as registered in a session, with final slugs on nested tools."""

    slug: str
    name: str
    description: str
    tools: t.List[RegisteredCustomTool]
