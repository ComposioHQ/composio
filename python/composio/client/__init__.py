"""
This module is a light wrapper around the auto-generated composio client.
"""

import contextvars
import os
import platform
import typing as t
from importlib.metadata import version
from uuid import uuid4

import typing_extensions as te
from composio_client import (
    DEFAULT_MAX_RETRIES,
    NOT_GIVEN,
    APIError,
    NotGiven,
    _base_client,
)
from composio_client import Composio as BaseComposio
from httpx import URL, Client, Request, Timeout

from composio.utils.logging import WithLogger

ComposioAPIError = APIError
APIEnvironment = te.Literal["production", "staging", "local"]


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


# TODO: Rename `Composio` to `HttpClient` in stainless generator
class HttpClient(BaseComposio, WithLogger):
    """
    Wrapper around the auto-generated composio client.
    """

    request_ctx: contextvars.ContextVar[RequestContext]
    not_given = NOT_GIVEN

    # Detect once at class initialization
    _runtime_env: str = (
        f"{_detect_runtime_environment()}_{_get_python_implementation()}"
    )

    def __init__(
        self,
        *,
        provider: str,
        api_key: t.Optional[str] = None,
        environment: te.Union[NotGiven, APIEnvironment] = "production",
        base_url: t.Optional[t.Union[str, URL, NotGiven]] = NOT_GIVEN,
        timeout: t.Optional[t.Union[float, Timeout, NotGiven]] = NOT_GIVEN,
        max_retries: int = DEFAULT_MAX_RETRIES,
        default_headers: t.Optional[t.Mapping[str, str]] = None,
        default_query: t.Optional[t.Mapping[str, object]] = None,
        http_client: t.Optional[Client] = None,
        _strict_response_validation: bool = False,
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
        BaseComposio.__init__(
            self,
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
        # TOFIX: Verbosity wrapper impl
        _base_client.log = self._logger  # type: ignore
        self.provider = provider
        self.request_ctx = contextvars.ContextVar[RequestContext](
            "request_ctx",
            default={
                "id": None,
                "provider": provider,
            },
        )
        # Lazily-built sibling client with retries disabled; see `without_retries`.
        self._without_retries: t.Optional[te.Self] = None

    def copy(  # type: ignore[override]
        self,
        *,
        _extra_kwargs: t.Mapping[str, t.Any] = {},
        **kwargs: t.Any,
    ) -> te.Self:
        """
        Clone the client, re-injecting the required ``provider`` keyword.

        The Stainless-generated ``copy`` rebuilds the client via
        ``self.__class__(...)`` without passing ``provider``, which this subclass
        requires — so the inherited ``copy``/``with_options`` raise ``TypeError``.
        Threading ``provider`` through ``_extra_kwargs`` makes them work again
        (e.g. ``with_options(max_retries=0)``).
        """
        return super().copy(  # type: ignore[misc]
            _extra_kwargs={
                "provider": self.provider,
                # The generated `copy` does not re-pass `_strict_response_validation`,
                # so without this the clone would silently fall back to the default
                # (False) even when the original had it enabled — keeping the sibling
                # a faithful copy that differs from the parent only in `max_retries`.
                "_strict_response_validation": self._strict_response_validation,
                **_extra_kwargs,
            },
            **kwargs,
        )

    # Re-alias `with_options` to this override. The base class binds
    # `with_options = copy` at class-definition time, so without this it would
    # still resolve to the base `copy` and miss the `provider` re-injection.
    with_options = copy

    @property
    def without_retries(self) -> te.Self:
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

    def _prepare_request(self, request: Request) -> None:
        """
        Request interceptor to inject request id, provider, and SDK version.
        """
        ctx = self.request_ctx.get()
        request.headers["x-request-id"] = ctx.get("id") or uuid4().hex
        request.headers["x-framework"] = ctx["provider"]
        request.headers["x-source"] = "PYTHON_SDK"
        request.headers["x-runtime"] = HttpClient._runtime_env

        try:
            request.headers["x-sdk-version"] = version("composio")
        except Exception:
            request.headers["x-sdk-version"] = "unknown"
