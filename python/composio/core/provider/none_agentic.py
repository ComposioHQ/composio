from __future__ import annotations

import typing as t

from composio.client.types import Tool
from composio.core.provider.base import BaseProvider, TTool, TToolCollection


class NonAgenticProvider(BaseProvider, t.Generic[TTool, TToolCollection]):
    """
    Base class for all non-agentic providers, such as `openai` This class is not
    meant to be used directly, but rather to be extended by concrete implementations
    This version doesn't have the execute_tool_fn for `wrap_tool` and `wrap_tools`
    """

    def __init_subclass__(cls, name: str) -> None:
        cls.name = name

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
