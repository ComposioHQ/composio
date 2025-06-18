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
    code: te.NotRequired[str]
    errorId: te.NotRequired[str]
    message: te.NotRequired[str]
    stack: te.NotRequired[str]


class TelemetryData(te.TypedDict):
    functionName: str
    durationMs: te.NotRequired[float]
    timestamp: te.NotRequired[float]
    props: te.NotRequired[t.Dict]
    source: te.NotRequired[str]
    metadata: te.NotRequired[t.Dict]
    error: te.NotRequired[ErrorData]


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
