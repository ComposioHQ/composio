"""
This module is a light wrapper around the auto-generated composio client.
"""

import contextvars
import datetime
import email.utils
import os
import platform
import re
import typing as t
import warnings
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
from httpx import URL, Client, Request, Response, Timeout

from composio.utils.logging import WithLogger

ComposioAPIError = APIError
APIEnvironment = te.Literal["production", "staging", "local"]


class DeprecationInfo(te.TypedDict):
    """Structured details about a deprecated API operation, passed to the
    optional ``on_deprecation`` hook so applications can route deprecations to
    their own telemetry."""

    method: str
    """Upper-case HTTP method, e.g. ``POST``."""
    path: str
    """Normalized route template with dynamic path params collapsed."""
    deprecated_at: t.Optional[datetime.datetime]
    """When the operation was marked deprecated (parsed from ``Deprecation: @<epoch>``)."""
    sunset: t.Optional[datetime.datetime]
    """Committed removal date (parsed from ``Sunset``), or ``None``."""
    successor: t.Optional[str]
    """Replacement endpoint or migration docs URL (from ``Link``), or ``None``."""


OnDeprecation = t.Callable[[DeprecationInfo], None]

# How close (in the future) a sunset date must be to escalate the wording.
_SUNSET_NEAR_THRESHOLD = datetime.timedelta(days=30)


def _parse_deprecation_date(value: t.Optional[str]) -> t.Optional[datetime.datetime]:
    """Parse the ``Deprecation`` header. Per RFC 9745 it is a Structured-Field
    date such as ``@1782345600`` (seconds since the Unix epoch). Returns the
    parsed datetime, or ``None`` for absent / ``"true"`` / unparseable values —
    callers gate the warning on *presence*, not on this returning a value."""
    if not value:
        return None
    match = re.match(r"^@(-?\d+)$", value.strip())
    if not match:
        return None
    try:
        return datetime.datetime.fromtimestamp(
            int(match.group(1)), tz=datetime.timezone.utc
        )
    except (ValueError, OverflowError, OSError):
        return None


def _parse_sunset_date(value: t.Optional[str]) -> t.Optional[datetime.datetime]:
    """Parse an RFC 8594 ``Sunset`` header (an HTTP-date), or ``None``."""
    if not value:
        return None
    try:
        parsed = email.utils.parsedate_to_datetime(value.strip())
    except (TypeError, ValueError):
        return None
    if parsed is not None and parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
    return parsed


def _parse_link_header(
    link_header: t.Optional[str],
) -> t.Tuple[t.Optional[str], t.Optional[str]]:
    """Parse an RFC 8288 ``Link`` header, returning
    ``(successor_version_url, deprecation_docs_url)``."""
    successor: t.Optional[str] = None
    deprecation: t.Optional[str] = None
    if not link_header:
        return successor, deprecation
    # Link headers are comma-separated lists of ``<uri>; param=value; ...``.
    for entry in link_header.split(","):
        match = re.match(r"\s*<([^>]*)>\s*;\s*(.*)", entry, flags=re.DOTALL)
        if not match:
            continue
        url, params = match.group(1).strip(), match.group(2)
        if successor is None and re.search(
            r'rel\s*=\s*"?successor-version"?', params, flags=re.IGNORECASE
        ):
            successor = url
        elif deprecation is None and re.search(
            r'rel\s*=\s*"?deprecation"?', params, flags=re.IGNORECASE
        ):
            deprecation = url
    return successor, deprecation


def _is_dynamic_segment(segment: str) -> bool:
    """Heuristic for whether a single path segment is a dynamic parameter."""
    if not segment:
        return False
    # UUID.
    if re.match(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
        segment,
        flags=re.IGNORECASE,
    ):
        return True
    # Purely numeric id.
    if re.match(r"^\d+$", segment):
        return True
    # A digit distinguishes an id from a static snake_case resource name
    # (``connected_accounts``, ``auth_configs``, …), which never contain digits.
    has_digit = any(ch.isdigit() for ch in segment)
    if has_digit and re.match(r"^[a-z]{1,12}_[A-Za-z0-9]{4,}$", segment, re.IGNORECASE):
        return True
    if has_digit and len(segment) >= 16 and any(ch.isalpha() for ch in segment):
        return True
    return False


def _normalize_path_template(path: str) -> str:
    """Collapse dynamic path segments to ``{param}`` so repeated calls with
    different path params dedupe to a single warning."""
    return "/".join(
        "{param}" if _is_dynamic_segment(seg) else seg for seg in path.split("/")
    )


def _build_deprecation_message(
    operation: str,
    sunset: t.Optional[datetime.datetime],
    raw_sunset: t.Optional[str],
    successor: t.Optional[str],
    deprecation_docs: t.Optional[str],
    now: datetime.datetime,
) -> str:
    """Build the developer-facing warning message, escalating on the sunset date."""
    parts = [f"The API operation `{operation}` is deprecated."]

    if sunset is not None:
        label = raw_sunset or sunset.strftime("%a, %d %b %Y %H:%M:%S GMT")
        delta = sunset - now
        if delta.total_seconds() <= 0:
            parts.append(
                f"It was scheduled for removal on {label} and may already be "
                "unavailable — migrate now."
            )
        elif delta <= _SUNSET_NEAR_THRESHOLD:
            # Round up any partial day so "in 0 days" never appears.
            days = max(
                1, delta.days + (1 if delta.seconds or delta.microseconds else 0)
            )
            parts.append(
                f"It will be removed on {label} (in {days} "
                f"day{'' if days == 1 else 's'}) — migrate now."
            )
        else:
            parts.append(f"It is scheduled for removal on {label}.")
    elif raw_sunset:
        # Present but unparseable: surface the raw value rather than dropping it.
        parts.append(f"It is scheduled for removal on {raw_sunset}.")
    else:
        parts.append("It may be removed in a future release.")

    if successor:
        parts.append(f"Use {successor} instead.")
    elif deprecation_docs:
        parts.append(f"See {deprecation_docs} for migration details.")

    return " ".join(parts)


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
        disable_deprecation_warnings: bool = False,
        on_deprecation: t.Optional[OnDeprecation] = None,
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
        :param disable_deprecation_warnings: Silence automatic API deprecation warnings.
        :param on_deprecation: Optional hook invoked once per deprecated operation.
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
        self._disable_deprecation_warnings = disable_deprecation_warnings
        self._on_deprecation = on_deprecation
        # Operations we have already warned about, so a repeatedly-called
        # deprecated operation only warns once. Keyed by ``METHOD path-template``.
        self._warned_deprecated_operations: t.Set[str] = set()
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

    def _process_response(self, *, response: Response, **kwargs: t.Any) -> t.Any:
        """
        Response interceptor that surfaces API deprecations.

        Inspects standard deprecation signalling headers on every response and
        emits a one-time warning per operation before delegating to the default
        processing. Because detection is header-driven, any endpoint deprecated
        server-side is surfaced automatically with no SDK release required.
        """
        self._warn_if_deprecated(response)
        return super()._process_response(response=response, **kwargs)

    def _warn_if_deprecated(self, response: Response) -> None:
        """
        Emit a warning the first time each deprecated operation is seen.

        Deprecation is signalled by the following response headers (pinned,
        stable format from the platform):

        - ``Deprecation: @<unix-epoch-seconds>`` (RFC 9745) — presence marks the
          operation as deprecated. Only presence matters for whether to warn.
        - ``Sunset: <HTTP-date>`` (RFC 8594) — optional removal date.
        - ``Link: <url>; rel="successor-version"`` (RFC 8288/5829) — optional
          pointer to the replacement endpoint (or ``rel="deprecation"`` for a
          docs/changelog link).

        This never raises: any failure inspecting headers is swallowed so
        deprecation handling can never affect real API traffic.
        """
        if self._disable_deprecation_warnings:
            return

        try:
            headers = response.headers
            # Per RFC 9745 the value is a Structured-Field date (e.g.
            # ``@1782345600``), never the literal string "true". Only presence
            # matters here.
            if "deprecation" not in headers:
                return

            request = response.request
            method = request.method.upper()
            path = _normalize_path_template(request.url.path)
            operation = f"{method} {path}"
            if operation in self._warned_deprecated_operations:
                return
            self._warned_deprecated_operations.add(operation)

            raw_sunset = headers.get("sunset")
            sunset = _parse_sunset_date(raw_sunset)
            successor, deprecation_docs = _parse_link_header(headers.get("link"))
            deprecated_at = _parse_deprecation_date(headers.get("deprecation"))

            message = _build_deprecation_message(
                operation,
                sunset,
                raw_sunset,
                successor,
                deprecation_docs,
                datetime.datetime.now(tz=datetime.timezone.utc),
            )
            warnings.warn(message, DeprecationWarning, stacklevel=2)

            if self._on_deprecation is not None:
                try:
                    self._on_deprecation(
                        DeprecationInfo(
                            method=method,
                            path=path,
                            deprecated_at=deprecated_at,
                            sunset=sunset,
                            successor=successor or deprecation_docs,
                        )
                    )
                except Exception:  # noqa: BLE001 - a bad callback must not break traffic
                    self._logger.debug("on_deprecation callback raised; ignoring")
        except Exception:  # noqa: BLE001 - never let this affect real traffic
            self._logger.debug("Failed to inspect response for deprecation headers")
