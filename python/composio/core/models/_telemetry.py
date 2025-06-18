import atexit
import functools
import queue as q
import threading as tr
import time
import typing as t

import httpx
import typing_extensions as te

TELEMETRY_URL = "https://telemetry.composio.dev/v1"
METRIC_ENDPOINT = f"{TELEMETRY_URL}/metrics/invocations"
ERROR_ENDPOINT = f"{TELEMETRY_URL}/errors"


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
    while queue.qsize():
        time.sleep(0.1)

    event.set()
    thread.join()


def _push(event: Event):
    _ = (
        httpx.post(
            url=METRIC_ENDPOINT,
            json=[event[1]],
        )
        if event[0] == "metric"
        else httpx.post(
            url=ERROR_ENDPOINT,
            json=event[1],
        )
    )


def _thread_loop(queue: EventQueue, event: tr.Event):
    while not event.is_set():
        try:
            _push(queue.get(timeout=0.1))
        except q.Empty:
            continue


def push_event(event: Event):
    q, _, _ = _setup()
    q.put(event)


def create_event(type: EventType, **payload: te.Unpack[TelemetryData]) -> Event:
    return type, payload
