"""
BaseProvider module

Defines the barebones provider metaclass that needs to be subclassed for every provider.
"""

from __future__ import annotations

import typing as t

import typing_extensions as te

TTool = t.TypeVar("TTool", covariant=True)
TToolCollection = t.TypeVar("TToolCollection", covariant=True)


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

    def __init__(self, **kwargs: t.Unpack[BaseProviderConfig]) -> None:
        self.skip_default = kwargs.get("schema_config", {}).get(
            "skip_defaults", self.__schema_skip_defaults__
        )
