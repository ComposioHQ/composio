"""
Base resource class for representing resources in the composio client.
"""

import contextvars
from collections.abc import Mapping
import functools
import os
import time
import traceback
import typing as t

from composio.__version__ import __version__
from composio.client import HttpClient
from composio.utils.redaction import redact_sensitive_text
from composio.utils.logging import WithLogger

from ._telemetry import Event, create_event, push_event

PayloadT = t.TypeVar("PayloadT", bound=dict)

allow_tracking = contextvars.ContextVar[bool]("allow_tracking", default=True)
_environment = os.getenv("ENVIRONMENT", "development")


def trace_method(method: t.Callable, name: str) -> t.Callable:
    """Wrap a method to log the call."""

    # Check if the method is a class method
    if getattr(method, "__self__", None) is not None:
        return method

    @functools.wraps(method)
    def trace_wrapper(self, *args: t.Any, **kwargs: t.Any) -> t.Any:
        if not allow_tracking.get():
            return method(self, *args, **kwargs)

        event: t.Optional[Event] = None
        start_time = time.time()
        event = create_event(
            type="metric",
            functionName=name,
            timestamp=time.time(),
            props={},
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
                "message": redact_sensitive_text(str(e)),
                "stack": redact_sensitive_text(traceback.format_exc()),
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


def header_value(headers: t.Mapping[str, t.Any], name: str) -> t.Optional[str]:
    """The non-empty value of ``name`` in ``headers``, matched case-insensitively."""
    if not isinstance(headers, Mapping):
        return None
    wanted = name.lower()
    for key, value in headers.items():
        if isinstance(key, str) and key.lower() == wanted:
            if isinstance(value, str) and value:
                return value
    return None


def credential_headers(client: HttpClient) -> t.Dict[str, str]:
    """The single credential header the client puts on the wire.

    A non-empty ``x-user-api-key`` default header wins: the client treats a
    caller-placed credential header as the credential and suppresses the
    configured keys. Otherwise the project key travels as ``x-api-key``,
    otherwise the resolved user API key as ``x-user-api-key``. Empty when no
    credential is held. The environment is never consulted here.
    """
    default_headers: t.Mapping[str, t.Any] = client.default_headers
    header_key = header_value(default_headers, "x-user-api-key")
    if header_key:
        return {"x-user-api-key": header_key}
    api_key = client.api_key
    if isinstance(api_key, str) and api_key:
        return {"x-api-key": api_key}
    user_api_key = client.user_api_key
    if isinstance(user_api_key, str) and user_api_key:
        return {"x-user-api-key": user_api_key}
    return {}
