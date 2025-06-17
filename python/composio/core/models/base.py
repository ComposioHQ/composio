"""
Base resource class for representing resources in the composio client.
"""

import functools
import typing as t

from composio.client import HttpClient
from composio.utils.logging import WithLogger

PayloadT = t.TypeVar("PayloadT", bound=dict)


# TODO: integrate the metric collection service @haxzie is working on
def trace_method(method: t.Callable, name: str, **attributes: t.Any) -> t.Callable:
    """Wrap a method to log the call."""

    @functools.wraps(method)
    def wrapper(self, *args, **kwargs):
        return method(self, *args, **kwargs)

    return wrapper


class ResourceMeta(type):
    """Meta class for resource classes."""

    def __init__(cls, name, bases, attrs):
        for attr in attrs:
            if "__" in attr:
                continue
            setattr(cls, attr, trace_method(getattr(cls, attr), f"{name}.{attr}"))


class Resource(WithLogger, metaclass=ResourceMeta):
    """Base resource class for composio client."""

    def sanitize_payload(self, payload: PayloadT) -> PayloadT:
        return {k: v for k, v in payload.items()}  # type: ignore

    def __init__(self, client: HttpClient):
        super().__init__()
        self._client = client
