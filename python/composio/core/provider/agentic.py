import typing as t

from composio.client.types import Tool
from composio.core.provider.base import BaseProvider, TTool, TToolCollection


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


class AgenticProvider(BaseProvider, t.Generic[TTool, TToolCollection]):
    """
    Base class for all agentic providers. This class is not meant to be used
    directly but rather to be extended by concrete provider implementations.
    """

    tool_type: t.Type[TTool]
    tool_collection_type: t.Type[TToolCollection]

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
