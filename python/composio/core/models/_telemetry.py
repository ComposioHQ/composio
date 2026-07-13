import atexit
import functools
import queue as q
import re
import threading as tr
import time
import typing as t

import httpx
import typing_extensions as te

TELEMETRY_URL = "https://telemetry.composio.dev/v1"
METRIC_ENDPOINT = f"{TELEMETRY_URL}/metrics/invocations"
ERROR_ENDPOINT = f"{TELEMETRY_URL}/errors"
REDACTED = "[REDACTED]"

_URL_QUERY_PATTERN = re.compile(r"(\bhttps?://[^\s?#'\"]+)\?[^\s'\"]*", re.IGNORECASE)
_AUTH_CREDENTIAL_PATTERN = re.compile(
    r"\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+", re.IGNORECASE
)
_SECRET_PAIR_PATTERN = re.compile(
    r"\b(authorization|api[-_]?key|apikey|x-api-key|access[-_]?token|"
    r"refresh[-_]?token|client[-_]?secret|secret|password|passwd|pwd)\b"
    r"(\s*[:=]+\s*)([\"']?)([^\s\"',}&]+)\3",
    re.IGNORECASE,
)


@t.overload
def redact_sensitive_text(value: None) -> None: ...


@t.overload
def redact_sensitive_text(value: str) -> str: ...


def redact_sensitive_text(value: t.Optional[str]) -> t.Optional[str]:
    """Redact common secret shapes from free-form telemetry text."""
    if not value:
        return value

    output = _URL_QUERY_PATTERN.sub(lambda match: f"{match.group(1)}?{REDACTED}", value)
    output = _AUTH_CREDENTIAL_PATTERN.sub(
        lambda match: f"{match.group(1)} {REDACTED}", output
    )
    return _SECRET_PAIR_PATTERN.sub(
        lambda match: (
            f"{match.group(1)}{match.group(2)}{match.group(3)}"
            f"{REDACTED}{match.group(3)}"
        ),
        output,
    )


class ErrorData(te.TypedDict):
    name: str
    "The name of the error"

    code: te.NotRequired[str]
    "The code of the error"

    errorId: te.NotRequired[str]
    "The error ID of the error"

    message: te.NotRequired[str]
    "The message of the error"

    stack: te.NotRequired[str]
    "The stack trace of the error"


class SourceData(te.TypedDict):
    host: te.NotRequired[str]
    "The name of the source/host"

    service: te.NotRequired[te.Literal["sdk", "apollo", "hermes", "thermos"]]
    "The service of the source"

    language: te.NotRequired[te.Literal["python", "typescript", "go", "rust"]]
    "The language of the function that was invoked"

    version: te.NotRequired[str]
    "The version of the source"

    platform: te.NotRequired[str]
    "The platform of the source"

    environment: te.NotRequired[
        te.Literal["development", "production", "ci", "staging", "test"]
    ]
    "The environment of the source, eg: development, production, ci etc"


class Metadata(te.TypedDict):
    projectId: te.NotRequired[str]
    "The project ID of the source"

    provider: te.NotRequired[str]
    "The provider used in the source"


class TelemetryData(te.TypedDict):
    functionName: str
    "The name of the function that was invoked"

    durationMs: te.NotRequired[float]
    "The duration of the function invocation in milliseconds"

    timestamp: te.NotRequired[float]
    "The timestamp of the function invocation in epoch seconds"

    props: te.NotRequired[t.Dict]
    "The properties of the function invocation"

    source: te.NotRequired[SourceData]
    """Source of the metric"""

    metadata: te.NotRequired[Metadata]
    """Runtime metadata"""

    error: te.NotRequired[ErrorData]
    """Error data."""


EventType: t.TypeAlias = t.Literal["metric", "error"]
Event = t.Tuple[EventType, TelemetryData]
EventQueue: t.TypeAlias = q.Queue[Event]


def _redact_error_event(event: Event) -> Event:
    """Return an error event with sanitized free-form fields."""
    event_type, payload = event
    error = payload.get("error")
    if event_type != "error" or error is None:
        return event

    redacted_error = t.cast(ErrorData, {**error})
    message = redacted_error.get("message")
    if message is not None:
        redacted_error["message"] = redact_sensitive_text(message)
    stack = redacted_error.get("stack")
    if stack is not None:
        redacted_error["stack"] = redact_sensitive_text(stack)

    redacted_payload = t.cast(
        TelemetryData,
        {
            **payload,
            "error": redacted_error,
        },
    )
    return event_type, redacted_payload


_queue: t.Optional[EventQueue] = None
_event: t.Optional[tr.Event] = None
_thread: t.Optional[tr.Thread] = None


def _setup():
    global _queue, _event, _thread
    if _queue is None:
        _queue = q.Queue[Event]()

    if _event is None:
        _event = tr.Event()

    if _thread is None:
        _thread = tr.Thread(
            target=_thread_loop,
            kwargs={
                "queue": _queue,
                "event": _event,
            },
            daemon=True,
        )
        _thread.start()
        atexit.register(
            functools.partial(
                _teardown,
                queue=_queue,
                event=_event,
                thread=_thread,
            )
        )

    return _queue, _event, _thread


def _teardown(queue: EventQueue, event: tr.Event, thread: tr.Thread):
    # Wait max 2 seconds for queue to empty
    deadline = time.time() + 2.0
    while queue.qsize() and time.time() < deadline:
        time.sleep(0.1)

    event.set()
    # Join with timeout to prevent infinite waiting
    thread.join(timeout=3.0)


def _push(event: Event):
    try:
        _ = (
            httpx.post(
                url=METRIC_ENDPOINT,
                json=[event[1]],
                timeout=2.0,  # 2 second timeout to prevent hanging
            )
            if event[0] == "metric"
            else httpx.post(
                url=ERROR_ENDPOINT,
                json=event[1],
                timeout=2.0,  # 2 second timeout to prevent hanging
            )
        )
    except (httpx.TimeoutException, httpx.HTTPError, Exception):
        # Silently fail - telemetry shouldn't break the application
        pass


def _thread_loop(queue: EventQueue, event: tr.Event):
    while not event.is_set():
        try:
            _push(queue.get(timeout=0.1))
        except q.Empty:
            continue


def push_event(event: Event):
    q, _, _ = _setup()
    q.put(_redact_error_event(event))


def create_event(type: EventType, **payload: te.Unpack[TelemetryData]) -> Event:
    return type, payload
