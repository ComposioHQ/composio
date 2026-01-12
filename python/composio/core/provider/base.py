"""
BaseProvider module

Defines the barebones provider metaclass that needs to be subclassed for every provider.
"""

from __future__ import annotations

import typing as t

import typing_extensions as te

if t.TYPE_CHECKING:
    from composio.core.models.tools import Modifiers, ToolExecutionResponse

TTool = t.TypeVar("TTool", covariant=True)
TToolCollection = t.TypeVar("TToolCollection", covariant=True)


class ExecuteToolFn(t.Protocol):
    def __call__(
        self,
        slug: str,
        arguments: t.Dict,
        *,
        modifiers: t.Optional[Modifiers] = None,
        user_id: t.Optional[str] = None,
    ) -> ToolExecutionResponse:
        """
        Execute a wrapped tool by slug, passing an arbitrary input dict.
        This function is used by the providers to execute tools for the helper methods.
        Returns a dict with the following keys:
            - data: The data returned by the tool.
            - error: The error returned by the tool.
            - successful: Whether the tool was successful.
        """
        ...


class SchemaConfig(te.TypedDict):
    skip_defaults: te.NotRequired[bool]


class BaseProviderConfig(te.TypedDict):
    schema_config: te.NotRequired[SchemaConfig]


class BaseProvider(t.Generic[TTool, TToolCollection]):
    """
    BaseProvider class

    All providers should inherit from this class and implement `wrap_tools` so that
    they can be used with the core Composio class.
    """

    name: str
    """Name of the provider"""

    __schema_skip_defaults__ = False

    execute_tool: ExecuteToolFn
    """
    The function to execute a tool for the provider's helper methods.
    This is automatically injected by the core SDK.
    """

    def __init__(self, **kwargs: t.Unpack[BaseProviderConfig]) -> None:
        self.skip_default = kwargs.get("schema_config", {}).get(
            "skip_defaults", self.__schema_skip_defaults__
        )

    def set_execute_tool_fn(self, execute_tool_fn: ExecuteToolFn):
        self.execute_tool = execute_tool_fn
