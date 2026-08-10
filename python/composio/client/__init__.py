"""
This module is a facade over the auto-generated composio client.

It works with either supported generation of the generated client package —
the Stainless ``composio-client`` 1.x line (v1) or the self-managed 2.x line
(v2) — presenting one internal call convention to the rest of the SDK (see
:mod:`composio.client.compat`).
"""

import contextvars
import os
import platform
import typing as t
from importlib.metadata import version
from uuid import uuid4

import typing_extensions as te
from httpx import Client, Request

from composio.client import compat
from composio.client.compat import OMIT, ResourceProxy
from composio.utils.logging import WithLogger

if compat.IS_V2:
    from composio_client import APIError
    from composio_client import Composio as _GeneratedComposio
    from composio_client._base_client import DEFAULT_MAX_RETRIES
else:
    from composio_client import (
        DEFAULT_MAX_RETRIES,
        NOT_GIVEN,
        APIError,
        _base_client,
    )
    from composio_client import Composio as _GeneratedComposio

ComposioAPIError = APIError
APIEnvironment = te.Literal["production", "staging", "local"]

#: Default sentinel for optional constructor arguments ("not given").
_UNSET = OMIT


def _is_given(value: t.Any) -> bool:
    """True when a constructor argument was explicitly provided.

    ``None`` and the OMIT sentinel count as "not given"; under v1 the
    Stainless ``NOT_GIVEN`` sentinel does too.
    """
    if value is None or isinstance(value, compat.OmitType):
        return False
    if not compat.IS_V2 and value is NOT_GIVEN:
        return False
    return True


def _get_python_implementation() -> str:
    """
    Get the Python implementation name.

    Returns:
        String identifier for Python implementation (CPYTHON, PYPY, JYTHON, IRONPYTHON, etc.)
    """
    impl = platform.python_implementation().upper()
    return impl


def _detect_runtime_environment() -> str:
    """
    Detect the runtime environment where the code is executing.

    Returns a string identifier for the environment.
    """
    # Check for Google Colab
    try:
        import google.colab  # type: ignore # noqa: F401

        return "GOOGLE_COLAB"
    except ImportError:
        pass

    # Check for Jupyter/IPython
    try:
        shell = get_ipython().__class__.__name__  # type: ignore # noqa: F821
        if shell == "ZMQInteractiveShell":
            return "JUPYTER_NOTEBOOK"
        elif shell == "TerminalInteractiveShell":
            return "IPYTHON"
    except NameError:
        pass

    # Check for AWS Lambda
    if os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return "AWS_LAMBDA"

    # Check for Google Cloud Functions
    if os.environ.get("FUNCTION_NAME") or os.environ.get("K_SERVICE"):
        return "GOOGLE_CLOUD_FUNCTION"

    # Check for Azure Functions
    if os.environ.get("FUNCTIONS_WORKER_RUNTIME"):
        return "AZURE_FUNCTION"

    # Check for Kaggle
    if os.environ.get("KAGGLE_KERNEL_RUN_TYPE"):
        return "KAGGLE"

    # Check for Replit
    if os.environ.get("REPL_ID") or os.environ.get("REPLIT_DB_URL"):
        return "REPLIT"

    # Check for GitHub Actions
    if os.environ.get("GITHUB_ACTIONS"):
        return "GITHUB_ACTIONS"

    # Check for GitLab CI
    if os.environ.get("GITLAB_CI"):
        return "GITLAB_CI"

    # Check for CircleCI
    if os.environ.get("CIRCLECI"):
        return "CIRCLECI"

    # Check for Jenkins
    if os.environ.get("JENKINS_HOME"):
        return "JENKINS"

    # Check for Docker
    if os.path.exists("/.dockerenv") or os.path.exists("/run/.containerenv"):
        return "DOCKER"

    # Check if running in a container (generic)
    try:
        with open("/proc/1/cgroup", "r") as f:
            if "docker" in f.read() or "containerd" in f.read():
                return "CONTAINER"
    except (FileNotFoundError, PermissionError):
        pass

    # Default to LOCAL for development environments
    return "LOCAL"


class RequestContext(te.TypedDict):
    id: te.NotRequired[t.Optional[str]]
    provider: str


def _sdk_version() -> str:
    try:
        return version("composio")
    except Exception:
        return "unknown"


_RUNTIME_ENV = f"{_detect_runtime_environment()}_{_get_python_implementation()}"


class _RequestContextHook:
    """Inject dynamic telemetry without duplicating hooks on shared clients."""

    def __init__(self, request_ctx: contextvars.ContextVar[RequestContext]) -> None:
        self.request_ctx = request_ctx

    def __call__(self, request: Request) -> None:
        ctx = self.request_ctx.get()
        request.headers["x-request-id"] = ctx.get("id") or uuid4().hex
        request.headers["x-framework"] = ctx["provider"]


if not compat.IS_V2:

    class _StainlessBackend(_GeneratedComposio):  # type: ignore[misc, valid-type]
        """Internal v1 backend: the Stainless client + telemetry interceptor."""

        _request_ctx_ref: contextvars.ContextVar[RequestContext]

        def _prepare_request(self, request: Request) -> None:
            """
            Request interceptor to inject request id, provider, and SDK version.
            """
            ctx = self._request_ctx_ref.get()
            request.headers["x-request-id"] = ctx.get("id") or uuid4().hex
            request.headers["x-framework"] = ctx["provider"]
            request.headers["x-source"] = "PYTHON_SDK"
            request.headers["x-runtime"] = _RUNTIME_ENV
            request.headers["x-sdk-version"] = _sdk_version()


class HttpClient(WithLogger):
    """
    Facade over the auto-generated composio client.

    Presents one internal call convention (see :mod:`composio.client.compat`)
    to the SDK regardless of which generated-client generation is installed,
    and injects the SDK telemetry headers on every request.
    """

    request_ctx: contextvars.ContextVar[RequestContext]
    not_given = OMIT

    # Detect once at class initialization
    _runtime_env: str = _RUNTIME_ENV

    def __init__(
        self,
        *,
        provider: str,
        api_key: t.Optional[str] = None,
        environment: t.Any = "production",
        base_url: t.Any = _UNSET,
        timeout: t.Any = _UNSET,
        max_retries: int = DEFAULT_MAX_RETRIES,
        default_headers: t.Optional[t.Mapping[str, str]] = None,
        default_query: t.Optional[t.Mapping[str, object]] = None,
        http_client: t.Optional[Client] = None,
        _strict_response_validation: bool = False,
        _request_ctx: t.Optional[contextvars.ContextVar[RequestContext]] = None,
    ) -> None:
        """
        Initialize the client.

        :param provider: The provider to use for the client.
        :param api_key: The API key to use for the client.
        :param environment: The environment to use for the client.
        :param base_url: The base URL to use for the client.
        :param timeout: The timeout to use for the client.
        :param max_retries: The maximum number of retries to use for the client.
        :param default_headers: The default headers to use for the client.
        :param default_query: The default query parameters to use for the client.
        :param http_client: The HTTP client to use for the client.
        """
        WithLogger.__init__(self)
        self.provider = provider
        self.request_ctx = _request_ctx or contextvars.ContextVar[RequestContext](
            "request_ctx", default={"id": None, "provider": provider}
        )
        self._strict_response_validation = _strict_response_validation
        # Remember the constructor arguments so sibling facades
        # (``with_options`` / ``without_retries``) can be rebuilt from them.
        self._ctor_kwargs: t.Dict[str, t.Any] = {
            "provider": provider,
            "api_key": api_key,
            "environment": environment,
            "base_url": base_url,
            "timeout": timeout,
            "max_retries": max_retries,
            "default_headers": default_headers,
            "default_query": default_query,
            "http_client": http_client,
            "_strict_response_validation": _strict_response_validation,
        }

        if compat.IS_V2:
            self._backend, http_client = self._build_v2_backend(
                api_key=api_key,
                environment=environment,
                base_url=base_url,
                timeout=timeout,
                max_retries=max_retries,
                default_headers=default_headers,
                default_query=default_query,
                http_client=http_client,
            )
        else:
            self._backend = self._build_v1_backend(
                api_key=api_key,
                environment=environment,
                base_url=base_url,
                timeout=timeout,
                max_retries=max_retries,
                default_headers=default_headers,
                default_query=default_query,
                http_client=http_client,
                _strict_response_validation=_strict_response_validation,
            )

        # Clones share the request context and resolved transport. This keeps
        # telemetry consistent and avoids opening a second connection pool.
        self._ctor_kwargs["http_client"] = http_client
        self._ctor_kwargs["_request_ctx"] = self.request_ctx

        # Lazily-built sibling facade with retries disabled; see `without_retries`.
        self._without_retries: t.Optional["HttpClient"] = None

    # -- backend construction ----------------------------------------------

    def _build_v1_backend(
        self,
        *,
        api_key: t.Optional[str],
        environment: t.Any,
        base_url: t.Any,
        timeout: t.Any,
        max_retries: int,
        default_headers: t.Optional[t.Mapping[str, str]],
        default_query: t.Optional[t.Mapping[str, object]],
        http_client: t.Optional[Client],
        _strict_response_validation: bool,
    ) -> t.Any:
        backend = _StainlessBackend(
            api_key=api_key,
            environment=environment if _is_given(environment) else NOT_GIVEN,
            base_url=base_url if _is_given(base_url) else NOT_GIVEN,
            timeout=timeout if not isinstance(timeout, compat.OmitType) else NOT_GIVEN,
            max_retries=max_retries,
            default_headers=default_headers,
            default_query=default_query,
            http_client=http_client,
            _strict_response_validation=_strict_response_validation,
        )
        backend._request_ctx_ref = self.request_ctx
        # TOFIX: Verbosity wrapper impl
        _base_client.log = self._logger  # type: ignore
        return backend

    def _build_v2_backend(
        self,
        *,
        api_key: t.Optional[str],
        environment: t.Any,
        base_url: t.Any,
        timeout: t.Any,
        max_retries: int,
        default_headers: t.Optional[t.Mapping[str, str]],
        default_query: t.Optional[t.Mapping[str, object]],
        http_client: t.Optional[Client],
    ) -> t.Tuple[t.Any, Client]:
        # Static telemetry headers ride on every request as client defaults;
        # the per-request ``x-request-id`` is injected via an httpx request
        # event hook (the v2 client has no ``_prepare_request`` seam).
        headers: t.Dict[str, str] = {
            "x-framework": self.provider,
            "x-source": "PYTHON_SDK",
            "x-runtime": _RUNTIME_ENV,
            "x-sdk-version": _sdk_version(),
        }
        if default_headers:
            headers.update(default_headers)

        if http_client is None:
            http_client = Client(
                event_hooks={"request": [_RequestContextHook(self.request_ctx)]}
            )
        else:
            event_hooks = http_client.event_hooks
            request_hooks = event_hooks.setdefault("request", [])
            if not any(
                isinstance(hook, _RequestContextHook)
                and hook.request_ctx is self.request_ctx
                for hook in request_hooks
            ):
                request_hooks.append(_RequestContextHook(self.request_ctx))
                # httpx copies the hook mapping on property access; write it back.
                http_client.event_hooks = event_hooks

        resolved_base_url = str(base_url) if _is_given(base_url) else None
        resolved_environment: t.Optional[str]
        if resolved_base_url is not None:
            # Mirror v1 semantics: an explicit base_url wins over the
            # (defaulted) environment literal.
            resolved_environment = None
        else:
            resolved_environment = str(environment) if _is_given(environment) else None

        # Typed as Any: static checkers resolve ``composio_client`` against the
        # v1 package, whose constructor signature differs from the v2 one used
        # at runtime in this branch.
        client_cls: t.Any = _GeneratedComposio
        return (
            client_cls(
                api_key=api_key,
                environment=resolved_environment,
                base_url=resolved_base_url,
                timeout=timeout if _is_given(timeout) else None,
                max_retries=max_retries,
                default_headers=headers,
                default_query=default_query,
                http_client=http_client,
            ),
            http_client,
        )

    # -- generated-resource access ------------------------------------------

    def __getattr__(self, name: str) -> t.Any:
        # Only called for attributes not found on the facade itself: treat
        # them as generated-client resource accessors.
        backend = self.__dict__.get("_backend")
        if name.startswith("_") or backend is None:
            raise AttributeError(name)
        return ResourceProxy(backend, (name,))

    # -- raw verb methods ---------------------------------------------------

    def get(
        self,
        path: str,
        *,
        cast_to: t.Any,
        options: t.Optional[t.Mapping[str, t.Any]] = None,
    ) -> t.Any:
        if not compat.IS_V2:
            return self._backend.get(path, cast_to=cast_to, options=dict(options or {}))
        return compat._unwrap_root(
            self._backend.get(
                path,
                cast_to=_v2_cast_to(cast_to),
                query=(options or {}).get("params"),
                headers=(options or {}).get("headers"),
            )
        )

    def post(
        self,
        path: str,
        *,
        cast_to: t.Any,
        body: t.Optional[t.Any] = None,
        options: t.Optional[t.Mapping[str, t.Any]] = None,
    ) -> t.Any:
        if not compat.IS_V2:
            return self._backend.post(
                path, cast_to=cast_to, body=body, options=dict(options or {})
            )
        return compat._unwrap_root(
            self._backend.post(
                path,
                cast_to=_v2_cast_to(cast_to),
                body=body,
                query=(options or {}).get("params"),
                headers=(options or {}).get("headers"),
            )
        )

    def patch(
        self,
        path: str,
        *,
        cast_to: t.Any,
        body: t.Optional[t.Any] = None,
        options: t.Optional[t.Mapping[str, t.Any]] = None,
    ) -> t.Any:
        if not compat.IS_V2:
            return self._backend.patch(
                path, cast_to=cast_to, body=body, options=dict(options or {})
            )
        return compat._unwrap_root(
            self._backend.patch(
                path,
                cast_to=_v2_cast_to(cast_to),
                body=body,
                query=(options or {}).get("params"),
                headers=(options or {}).get("headers"),
            )
        )

    def put(
        self,
        path: str,
        *,
        cast_to: t.Any,
        body: t.Optional[t.Any] = None,
        options: t.Optional[t.Mapping[str, t.Any]] = None,
    ) -> t.Any:
        if not compat.IS_V2:
            return self._backend.put(
                path, cast_to=cast_to, body=body, options=dict(options or {})
            )
        return compat._unwrap_root(
            self._backend.put(
                path,
                cast_to=_v2_cast_to(cast_to),
                body=body,
                query=(options or {}).get("params"),
                headers=(options or {}).get("headers"),
            )
        )

    def delete(
        self,
        path: str,
        *,
        cast_to: t.Any,
        body: t.Optional[t.Any] = None,
        options: t.Optional[t.Mapping[str, t.Any]] = None,
    ) -> t.Any:
        if not compat.IS_V2:
            return self._backend.delete(
                path, cast_to=cast_to, body=body, options=dict(options or {})
            )
        return compat._unwrap_root(
            self._backend.delete(
                path,
                cast_to=_v2_cast_to(cast_to),
                body=body,
                query=(options or {}).get("params"),
                headers=(options or {}).get("headers"),
            )
        )

    # -- facade plumbing ----------------------------------------------------

    @property
    def api_key(self) -> t.Any:
        return self._backend.api_key

    @property
    def base_url(self) -> t.Any:
        return self._backend.base_url

    @property
    def max_retries(self) -> int:
        return self._backend.max_retries

    def copy(self, **kwargs: t.Any) -> "HttpClient":
        """
        Build a sibling facade with some constructor options overridden
        (e.g. ``with_options(max_retries=0)``). Both backends are rebuilt from
        the remembered constructor arguments; the underlying ``http_client``
        (and thus transport) is shared with the parent when one was provided.
        """
        merged = {**self._ctor_kwargs, **kwargs}
        return type(self)(**merged)

    with_options = copy

    @property
    def without_retries(self) -> "HttpClient":
        """
        A cached sibling client that never retries requests.

        Used for non-idempotent writes (``tools.execute`` / ``tools.proxy``),
        where a silent retry after a read timeout can duplicate a side effect
        (e.g. send an email twice). Reads keep the default retry behaviour.

        Scope: only ``tools.execute`` / ``tools.proxy`` route through this today.
        Other non-idempotent writes (``auth_configs.create`` / ``update`` /
        ``delete``, ``mcp.update`` / ``delete``, ``connected_accounts.delete`` /
        ``refresh``, ``link.create``) keep the default retries — most are
        naturally idempotent on retry, and the durable fix is backend-honoured
        idempotency keys.

        The sibling is cached rather than rebuilt per call so a fresh client is
        not constructed on every execute/proxy (the hottest path); its options
        never change, so one per client suffices.
        """
        if self._without_retries is None:
            self._without_retries = self.with_options(max_retries=0)
        return self._without_retries


def _v2_cast_to(cast_to: t.Any) -> t.Any:
    """Translate a raw-verb ``cast_to`` for the v2 backend.

    The v2 client validates typed responses via ``cast_to.model_validate``; for
    untyped targets (``object``, ``t.Dict[...]``) pass ``cast_to=None`` so the
    decoded JSON is returned as-is (matching the v1 behaviour at our call
    sites).
    """
    import inspect

    import pydantic

    if inspect.isclass(cast_to) and issubclass(cast_to, pydantic.BaseModel):
        return cast_to
    return None
