"""
Base resource class for representing resources in the composio client.
"""

import contextvars
import functools
import inspect
import os
import time
import traceback
import typing as t
from collections.abc import Mapping
from contextlib import contextmanager

from composio_client import AutoAuth, NoAuth, ProjectAuth, Scope, UserAuth

from composio.__version__ import __version__
from composio.client import HttpClient
from composio.core.models.tool_router_constants import (
    ORG_ID_HEADER,
    PROJECT_ID_HEADER,
    USER_API_KEY_HEADER,
)
from composio.utils.logging import WithLogger
from composio.utils.redaction import redact_sensitive_text

from ._telemetry import create_event, push_event

if t.TYPE_CHECKING:
    from composio.client._async import AsyncHttpClient


PayloadT = t.TypeVar("PayloadT", bound=dict)

allow_tracking = contextvars.ContextVar[bool]("allow_tracking", default=True)
_environment = os.getenv("ENVIRONMENT", "development")


@contextmanager
def _trace_invocation(name: str, provider: str) -> t.Iterator[None]:
    start = time.monotonic()
    event = create_event(
        type="metric",
        functionName=name,
        timestamp=time.time(),
        props={},
        source={
            "environment": _environment,  # type: ignore[typeddict-item]  # Preserve deployment-provided environment labels.
            "language": "python",
            "service": "sdk",
            "version": __version__,
        },
        metadata={"provider": provider},
    )
    try:
        yield
    except Exception as exc:
        _, payload = event
        payload["error"] = {
            "name": type(exc).__name__,
            "message": redact_sensitive_text(str(exc)),
            "stack": redact_sensitive_text(traceback.format_exc()),
        }
        event = ("error", payload)
        raise
    finally:
        event[1]["durationMs"] = (time.monotonic() - start) * 1000
        push_event(event=event)


def trace_method(method: t.Callable, name: str) -> t.Callable:
    """Record the entire invocation, including time spent awaiting I/O."""
    if getattr(method, "__self__", None) is not None:
        return method

    if inspect.iscoroutinefunction(method):

        @functools.wraps(method)
        async def trace_async(self, *args: t.Any, **kwargs: t.Any) -> t.Any:
            if not self._tracking_enabled:
                return await method(self, *args, **kwargs)
            with _trace_invocation(name, self._client.provider):
                return await method(self, *args, **kwargs)

        return trace_async

    @functools.wraps(method)
    def trace_sync(self, *args: t.Any, **kwargs: t.Any) -> t.Any:
        if not self._tracking_enabled:
            return method(self, *args, **kwargs)
        with _trace_invocation(name, self._client.provider):
            return method(self, *args, **kwargs)

    return trace_sync


class ResourceMeta(type):
    """Meta class for resource classes."""

    def __init__(cls, name, bases, attrs):
        for attr in attrs:
            if attr.startswith("_") or not callable(getattr(cls, attr)):
                continue
            setattr(cls, attr, trace_method(getattr(cls, attr), f"{name}.{attr}"))


class _ResourceBase(WithLogger, metaclass=ResourceMeta):
    @property
    def _tracking_enabled(self) -> bool:
        return allow_tracking.get()

    def sanitize_payload(self, payload: PayloadT) -> PayloadT:
        return t.cast(PayloadT, dict(payload))


class AsyncResource(_ResourceBase):
    """Base class for resources backed by the native async transport."""

    def __init__(self, client: "AsyncHttpClient"):
        super().__init__()
        self._client = client

    @property
    def _tracking_enabled(self) -> bool:
        return self._client.allow_tracking


class Resource(_ResourceBase):
    """Base resource class for the synchronous client."""

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


def credential_headers(client: "HttpClient | AsyncHttpClient") -> t.Dict[str, str]:
    """The single credential header the client puts on its own requests.

    For the destinations the SDK hands a credential to outside the client (the
    session MCP config, the realtime channel auth). Read from the ``auth`` the
    SDK constructed the client with, never from the client's read-back
    properties: a project key (``ProjectAuth``, or ``AutoAuth`` holding one)
    travels as ``x-api-key``, otherwise a user key (``UserAuth``, or
    ``AutoAuth`` holding only a user key) as ``x-user-api-key``. Under
    ``NoAuth`` a caller-placed ``x-user-api-key`` default header is the
    credential. Empty when no such key is held as a string. The environment is
    never consulted here.
    """
    auth = client.sdk_auth
    project: object = None
    user: object = None
    if isinstance(auth, NoAuth):
        user = header_value(client.default_headers, USER_API_KEY_HEADER)
    elif isinstance(auth, ProjectAuth):
        project = auth.credential
    elif isinstance(auth, UserAuth):
        user = auth.credential
    elif isinstance(auth, AutoAuth):
        project, user = auth.project, auth.user
    if isinstance(project, str) and project:
        return {"x-api-key": project}
    if isinstance(user, str) and user:
        return {USER_API_KEY_HEADER: user}
    return {}


def scope_headers(client: "HttpClient | AsyncHttpClient") -> t.Dict[str, str]:
    """The ``x-org-id`` / ``x-project-id`` the client sends to its API origin:
    its ``scope``, or without one the caller-placed default headers."""
    scope = client.scope
    if isinstance(scope, Scope):
        pairs = (
            (ORG_ID_HEADER, scope.organization_id),
            (PROJECT_ID_HEADER, scope.project_id),
        )
    else:
        default_headers: t.Mapping[str, t.Any] = client.default_headers
        pairs = (
            (ORG_ID_HEADER, header_value(default_headers, ORG_ID_HEADER)),
            (PROJECT_ID_HEADER, header_value(default_headers, PROJECT_ID_HEADER)),
        )
    return {name: value for name, value in pairs if value}
