"""
Base resource class for representing resources in the composio client.
"""

import contextvars
import functools
import os
import time
import traceback
import typing as t

from composio.__version__ import __version__
from composio.client import HttpClient
from composio.utils.logging import WithLogger

from ._telemetry import Event, create_event, push_event

PayloadT = t.TypeVar("PayloadT", bound=dict)

allow_tracking = contextvars.ContextVar[bool]("allow_tracking", default=True)
_environment = os.getenv("ENVIRONMENT", "development")


def trace_method(method: t.Callable, name: str, **attributes: t.Any) -> t.Callable:
    """Wrap a method to log the call."""

    @functools.wraps(method)
    def trace_wrapper(self, *args, **kwargs):
        if not allow_tracking.get():
            return method(self, *args, **kwargs)

        event: t.Optional[Event] = None
        start_time = time.time()
        event = create_event(
            type="metric",
            functionName=name,
            timestamp=time.time(),
            props=attributes,
            source={
                "environment": _environment,  # type: ignore
                "language": "python",
                "service": "sdk",
                "version": __version__,
            },
            metadata={
                "provider": self._client.provider,
            },
        )
        try:
            return method(self, *args, **kwargs)
        except Exception as e:
            _, payload = event
            payload["error"] = {
                "name": e.__class__.__name__,
                "message": str(e),
                "stack": traceback.format_exc(),
            }
            event = ("error", payload)
            raise e
        finally:
            if event is not None:
                event[1]["durationMs"] = (time.time() - start_time) * 1000
                push_event(event=event)

    trace_wrapper.__name__ = method.__name__
    return trace_wrapper


class ResourceMeta(type):
    """Meta class for resource classes."""

    def __init__(cls, name, bases, attrs):
        for attr in attrs:
            if attr.startswith("_") or not callable(getattr(cls, attr)):
                continue
            setattr(cls, attr, trace_method(getattr(cls, attr), f"{name}.{attr}"))


class Resource(WithLogger, metaclass=ResourceMeta):
    """Base resource class for composio client."""

    def sanitize_payload(self, payload: PayloadT) -> PayloadT:
        return {k: v for k, v in payload.items()}  # type: ignore

    def __init__(self, client: HttpClient):
        super().__init__()
        self._client = client
