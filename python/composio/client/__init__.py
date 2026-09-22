"""
This module is a light wrapper around the auto-generated composio client.
"""

import contextvars
import logging
import os
import platform
import typing as t
import weakref
from importlib.metadata import version
from uuid import uuid4

import typing_extensions as te
from composio_client import (
    DEFAULT_MAX_RETRIES,
    NOT_GIVEN,
    APIError,
    APIStatusError,
    NotGiven,
)
from composio_client import Composio as BaseComposio
from httpx import URL, Client, Request, Response, Timeout

from composio.core.models.tool_router_constants import (
    PROJECT_API_KEY_HEADER,
    USER_API_KEY_HEADER,
)
from composio.exceptions import ComposioError, InvalidParams
from composio.utils.logging import LogLevel, WithLogger, _VerbosityWrapper

ComposioAPIError = APIError
APIEnvironment = te.Literal["production", "staging", "local"]


_SDK_ERROR_CLASSES: t.Dict[t.Type[APIStatusError], t.Type[APIStatusError]] = {}


def _with_sdk_error_base(
    error_class: t.Type[APIStatusError],
) -> t.Type[APIStatusError]:
    """
    Return a subclass of a generated-client status error that also derives
    from the SDK's ``ComposioError``.

    The generated client has its own exception root, unrelated to
    ``composio.exceptions.ComposioError``, so HTTP failures such as an invalid
    API key used to escape ``except ComposioError``. Keeping the generated
    class as the first base preserves its constructor, ``status_code`` and
    ``isinstance`` checks, so existing ``except APIStatusError`` handlers keep
    working unchanged.
    """
    cached = _SDK_ERROR_CLASSES.get(error_class)
    if cached is not None:
        return cached
    sdk_class = t.cast(
        t.Type[APIStatusError],
        type(
            error_class.__name__,
            (error_class, ComposioError),
            {
                "__module__": error_class.__module__,
                "__reduce__": _reduce_sdk_error,
            },
        ),
    )
    # setdefault keeps the first class if two threads race to build one.
    return _SDK_ERROR_CLASSES.setdefault(error_class, sdk_class)


def _reduce_sdk_error(self: APIStatusError) -> t.Tuple[t.Any, ...]:
    """
    Pickle support for the classes built by ``_with_sdk_error_base``.

    They are not module attributes, so pickle cannot find them by name. Record
    the generated class instead and rebuild the SDK subclass on load.
    """
    error_class = type(self).__mro__[1]
    return (
        _rebuild_sdk_error,
        (error_class, self.message, self.response, self.body),
        self.__dict__,
    )


def _rebuild_sdk_error(
    error_class: t.Type[APIStatusError],
    message: str,
    response: Response,
    body: object,
) -> APIStatusError:
    return _with_sdk_error_base(error_class)(message, response=response, body=body)


def _as_sdk_error(error: APIStatusError) -> APIStatusError:
    if isinstance(error, ComposioError):
        return error
    sdk_error = _with_sdk_error_base(type(error))(
        error.message, response=error.response, body=error.body
    )
    return sdk_error.with_traceback(error.__traceback__)


CLIENT_LOGGER_NAME = "composio_client"
"""Name of the logger the generated ``composio_client`` package writes to."""


_active_log_wrapper: contextvars.ContextVar[t.Optional[_VerbosityWrapper]] = (
    contextvars.ContextVar("composio_client_log_wrapper", default=None)
)
"""The SDK logger of the :class:`HttpClient` currently performing a request.

The generated client writes every lifecycle record to one process-wide
``composio_client`` logger, so the record itself does not say which SDK
instance made the request. :meth:`HttpClient.request` binds this variable
for the duration of each call so the forwarder can deliver the record to
that instance's logger instead of whichever instance was constructed last.
"""


class _ClientLogForwarder(logging.Handler):
    """Forward ``composio_client`` records into the SDK logger.

    The generated client logs request/response lifecycle through
    ``logging.getLogger("composio_client")``. Routing those records through
    the SDK's :class:`_VerbosityWrapper` keeps one destination for SDK users
    and applies the same credential redaction and line truncation the SDK's
    own records get. The client's INFO records (per-request lifecycle) are
    forwarded as DEBUG.

    One forwarder is installed per process. A record emitted while an
    :class:`HttpClient` request is in flight goes to that client's logger
    (see :data:`_active_log_wrapper`); a record emitted outside any request
    goes to the logger of the most recently constructed client.
    """

    def __init__(self, wrapper: _VerbosityWrapper) -> None:
        super().__init__()
        self.wrapper = wrapper

    def emit(self, record: logging.LogRecord) -> None:
        wrapper = _active_log_wrapper.get() or self.wrapper
        try:
            message = record.getMessage()
            if record.levelno >= logging.ERROR:
                wrapper.error(message, exc_info=record.exc_info)
            elif record.levelno >= logging.WARNING:
                wrapper.warning(message, exc_info=record.exc_info)
            else:
                wrapper.debug(message, exc_info=record.exc_info)
        except Exception:  # noqa: BLE001 - logging must never fail the call
            self.handleError(record)


_forwarding_wrappers: "weakref.WeakSet[_VerbosityWrapper]" = weakref.WeakSet()
"""The SDK loggers of the :class:`HttpClient` instances still alive.

The ``composio_client`` logger has one process-wide level, so it is kept at
the most permissive level any live instance needs; each instance's wrapper
then filters what it actually emits. Weak references let an instance that
was garbage collected stop holding the level down.
"""


def _client_level_for(wrapper: _VerbosityWrapper) -> int:
    """The ``composio_client`` level that lets ``wrapper`` see what it wants.

    The client's INFO records are forwarded as DEBUG, so the client only
    needs to produce them when the SDK logger is at DEBUG; otherwise only
    its WARNING and above records are worth producing.
    """
    level = wrapper.logger.getEffectiveLevel()
    return level if level <= logging.DEBUG else max(level, logging.WARNING)


def _install_client_log_forwarder(wrapper: _VerbosityWrapper) -> logging.Logger:
    """Attach the process-wide forwarder to the client logger.

    Idempotent: the single forwarder is created on first use and kept
    afterwards. Each call rebinds its fallback logger to ``wrapper`` (the
    most recently constructed SDK instance); records emitted during a
    request are routed to the requesting instance regardless of that
    fallback, so earlier instances keep receiving their own request logs.

    The client logger's level is the most permissive one any live instance
    needs, so constructing a quieter instance never silences the lifecycle
    records of an earlier, more verbose one.
    """
    client_logger = logging.getLogger(CLIENT_LOGGER_NAME)
    forwarder: t.Optional[_ClientLogForwarder] = None
    for handler in list(client_logger.handlers):
        if not isinstance(handler, _ClientLogForwarder):
            continue
        if forwarder is None:
            forwarder = handler
            continue
        client_logger.removeHandler(handler)
    if forwarder is None:
        client_logger.addHandler(_ClientLogForwarder(wrapper))
    else:
        forwarder.wrapper = wrapper
    _forwarding_wrappers.add(wrapper)
    client_logger.setLevel(min(_client_level_for(w) for w in _forwarding_wrappers))
    client_logger.propagate = False
    return client_logger


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
        disable_api_key: bool = False,
        user_api_key: t.Optional[str] = None,
        org_api_key: t.Optional[str] = None,
        environment: te.Union[NotGiven, APIEnvironment] = "production",
        base_url: t.Optional[t.Union[str, URL, NotGiven]] = NOT_GIVEN,
        timeout: t.Optional[t.Union[float, Timeout, NotGiven]] = NOT_GIVEN,
        max_retries: int = DEFAULT_MAX_RETRIES,
        default_headers: t.Optional[t.Mapping[str, str]] = None,
        default_query: t.Optional[t.Mapping[str, object]] = None,
        http_client: t.Optional[Client] = None,
        logger: t.Optional[logging.Logger] = None,
        logging_level: t.Optional[LogLevel] = None,
        _strict_response_validation: bool = False,
        _environment_variables: t.Optional[t.Mapping[str, str]] = None,
    ) -> None:
        """
        Initialize the client.

        :param provider: The provider to use for the client.
        :param logger: Logger that receives SDK and ``composio_client`` records.
        :param logging_level: Level applied to the SDK and ``composio_client`` loggers.
        :param api_key: The API key to use for the client.
        :param disable_api_key: Turn project-key authentication off, including the
            ``COMPOSIO_API_KEY`` fallback; ``None`` alone keeps that fallback.
        :param _environment_variables: Environment snapshot the generated client
            resolves its fallbacks from instead of ``os.environ``; clones of a
            client built from a snapshot receive an empty one.
        :param user_api_key: User API key, sent only on operations that require it.
        :param org_api_key: Organization API key, sent only on operations that require it.
        :param environment: The environment to use for the client.
        :param base_url: The base URL to use for the client.
        :param timeout: The timeout to use for the client.
        :param max_retries: The maximum number of retries to use for the client.
        :param default_headers: The default headers to use for the client.
        :param default_query: The default query parameters to use for the client.
        :param http_client: The HTTP client to use for the client.
        """
        WithLogger.__init__(self, logger=logger, logging_level=logging_level)
        self._disable_api_key = disable_api_key
        if disable_api_key:
            # The project credential is only ever set from `api_key`: a raw
            # `x-api-key` default header would bypass the disabled project key.
            project_key_header = next(
                (
                    name
                    for name in (default_headers or {})
                    if name.lower() == PROJECT_API_KEY_HEADER
                ),
                None,
            )
            if project_key_header is not None:
                raise InvalidParams(
                    f"`disable_api_key=True` sends no project key, but "
                    f"`default_headers` carries a `{project_key_header}` entry; "
                    "pass the project API key as `api_key` instead of a raw "
                    f"`{PROJECT_API_KEY_HEADER}` header, or remove the entry to "
                    "authenticate with the user API key alone"
                )
            # The generated client reads COMPOSIO_API_KEY whenever `api_key` is
            # None, so hand it an environment without that variable. Clones
            # inherit the resolved values and an empty snapshot.
            api_key = None
            if _environment_variables is None:
                _environment_variables = {
                    name: value
                    for name, value in os.environ.items()
                    if name != "COMPOSIO_API_KEY"
                }
            # The generated client sends its user key only on operations whose
            # security scheme names it, which excludes sessions. The resolved
            # user key is placed as the `x-user-api-key` default header instead,
            # so every request carries exactly that credential.
            resolved_user_api_key = user_api_key or _environment_variables.get(
                "COMPOSIO_USER_API_KEY"
            )
            if resolved_user_api_key and not any(
                name.lower() == USER_API_KEY_HEADER for name in (default_headers or {})
            ):
                default_headers = {
                    **(default_headers or {}),
                    USER_API_KEY_HEADER: resolved_user_api_key,
                }
        BaseComposio.__init__(
            self,
            api_key=api_key,
            user_api_key=user_api_key,
            org_api_key=org_api_key,
            environment=environment,
            base_url=base_url,
            timeout=timeout,
            max_retries=max_retries,
            default_headers=default_headers,
            default_query=default_query,
            http_client=http_client,
            _strict_response_validation=_strict_response_validation,
            _environment_variables=_environment_variables,
        )
        _install_client_log_forwarder(self._logger)
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
                # Clones keep the project key disabled, so a default header
                # added through `with_options` goes through the same checks.
                "disable_api_key": self._disable_api_key,
                # The generated `copy` does not re-pass `_strict_response_validation`,
                # so without this the clone would silently fall back to the default
                # (False) even when the original had it enabled — keeping the sibling
                # a faithful copy that differs from the parent only in `max_retries`.
                "_strict_response_validation": self._strict_response_validation,
                # Share the parent's logger; otherwise constructing the clone
                # rebinds the process-wide client log forwarder to the default
                # `composio` logger.
                "logger": self._logger.logger,
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

    def request(  # type: ignore[override]
        self,
        cast_to: t.Any,
        options: t.Mapping[str, t.Any],
        *,
        stream: bool = False,
        stream_cls: t.Optional[t.Type[t.Any]] = None,
    ) -> t.Any:
        # Bind this instance's logger for the request so the client's
        # lifecycle records reach it (see `_active_log_wrapper`).
        token = _active_log_wrapper.set(self._logger)
        try:
            return super().request(
                cast_to, options, stream=stream, stream_cls=stream_cls
            )
        finally:
            _active_log_wrapper.reset(token)

    def _make_status_error(
        self,
        err_msg: str,
        *,
        body: object,
        response: Response,
    ) -> APIStatusError:
        """
        Build status errors that are also ``ComposioError``s; see
        ``_with_sdk_error_base``.

        Every status error the client raises is built through this hook, so
        overriding it here covers all response paths at once.
        """
        return _as_sdk_error(
            super()._make_status_error(err_msg, body=body, response=response)
        )

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
