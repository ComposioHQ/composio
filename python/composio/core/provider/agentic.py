from __future__ import annotations

import typing as t

from composio.client.types import Tool
from composio.core.provider.base import (
    BaseProvider,
    ToolCallExecutionTarget,
    TTool,
    TToolCollection,
)


class AgenticProviderExecuteFn(t.Protocol):
    def __call__(
        self,
        slug: str,
        arguments: t.Dict,
    ) -> t.Dict:
        """
        Execute a wrapped tool by slug, passing an arbitrary input dict.
        Returns a dict with the following keys:
            - data: The data returned by the tool.
            - error: The error returned by the tool.
            - successful: Whether the tool was successful.
        """
        ...


_EXECUTION_TARGET_ATTR = "__composio_execution_target__"

TExecuteFn = t.TypeVar("TExecuteFn", bound=t.Callable[..., t.Any])


def bind_execution_target(
    execute_tool: TExecuteFn,
    target: ToolCallExecutionTarget,
) -> TExecuteFn:
    """Record the user ID or Tool Router session ``execute_tool`` runs as.

    A provider that executes calls outside the wrapped tools, such as Gemini's
    ``handle_response``, reads it back with :func:`get_execution_target` to
    pick the executor that belongs to a caller's ``user_id`` or ``session``.
    """
    setattr(execute_tool, _EXECUTION_TARGET_ATTR, target)
    return execute_tool


def get_execution_target(
    execute_tool: t.Callable[..., t.Any],
) -> t.Optional[ToolCallExecutionTarget]:
    """Return the target recorded by :func:`bind_execution_target`, if any."""
    return getattr(execute_tool, _EXECUTION_TARGET_ATTR, None)


class AgenticProvider(BaseProvider[TTool, TToolCollection]):
    """
    Base class for all agentic providers. This class is not meant to be used
    directly but rather to be extended by concrete provider implementations.
    """

    def __init_subclass__(cls, name: str) -> None:
        cls.name = name

    def wrap_tool(
        self,
        tool: Tool,
        execute_tool: AgenticProviderExecuteFn,
    ) -> TTool:
        """Wrap a tool in the provider-specific format"""
        raise NotImplementedError

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
        execute_tool: AgenticProviderExecuteFn,
    ) -> TToolCollection:
        """Wrap a list of tools in the provider-specific format"""
        raise NotImplementedError
