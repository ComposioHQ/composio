"""
BaseProvider module

Defines the barebones provider metaclass that needs to be subclassed for every provider.
"""

from __future__ import annotations

import abc
import typing as t

TTool = t.TypeVar("TTool", covariant=True)
TToolCollection = t.TypeVar("TToolCollection", covariant=True)


class BaseProvider(abc.ABC, t.Generic[TTool, TToolCollection]):
    """
    BaseProvider class

    All providers should inherit from this class and implement `wrap_tools` so that
    they can be used with the core Composio class.
    """

    name: str
    """Name of the provider"""
