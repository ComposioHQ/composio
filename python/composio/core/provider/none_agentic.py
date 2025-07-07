from __future__ import annotations

import typing as t

from composio.client.types import Tool
from composio.core.provider.base import BaseProvider, TTool, TToolCollection

if t.TYPE_CHECKING:
    from composio.core.models.tools import Modifiers, ToolExecutionResponse


class NoneAgenticProviderExecuteFn(t.Protocol):
    def __call__(
        self,
        slug: str,
        arguments: t.Dict,
        modifiers: t.Optional[Modifiers] = None,
        user_id: t.Optional[str] = None,
    ) -> ToolExecutionResponse:
        """
        Execute a wrapped tool by slug, passing an arbitrary input dict.
        Returns a dict with the following keys:
            - data: The data returned by the tool.
            - error: The error returned by the tool.
            - successful: Whether the tool was successful.
        """
        ...


class NonAgenticProvider(BaseProvider, t.Generic[TTool, TToolCollection]):
    """
    Base class for all non-agentic providers, such as `openai` This class is not
    meant to be used directly, but rather to be extended by concrete implementations
    This version doesn't have the execute_tool_fn for `wrap_tool` and `wrap_tools`
    """

    execute_tool: NoneAgenticProviderExecuteFn
    """The function to execute a tool. This is automatically injected by the core SDK"""

    def __init_subclass__(cls, name: str) -> None:
        cls.name = name

    def set_execute_tool_fn(self, execute_tool_fn: NoneAgenticProviderExecuteFn):
        self.execute_tool = execute_tool_fn

    def wrap_tool(
        self,
        tool: Tool,
    ) -> TTool:
        """Wrap a tool in the provider-specific format"""
        raise NotImplementedError

    def wrap_tools(
        self,
        tools: t.Sequence[Tool],
    ) -> TToolCollection:
        """Wrap a list of tools in the provider-specific format"""
        raise NotImplementedError
