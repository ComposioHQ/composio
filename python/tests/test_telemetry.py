"""Telemetry lazy init must be thread-safe.

``push_event`` runs on the trace wrapper of every public ``Resource`` method
(see ``base.ResourceMeta``), and the SDK dispatches those methods from thread
pools (e.g. ``triggers`` / ``tool_router_session``). The first call lazily
initializes the module-level queue, event, and daemon consumer thread with a
check-then-set (``if _thread is None: ... _thread.start(); atexit.register(...)``).

Without a lock two threads can each observe ``_thread is None`` on first use and
both start a daemon consumer thread and both register an ``atexit`` teardown, so
an extra background thread leaks and the (up to 2s poll + 3s join) teardown runs
twice at shutdown. ``_setup`` guards the init with ``_init_lock`` so exactly one
queue/event/thread is created and a single teardown is registered.
"""

import threading
import typing as t

import pytest

from composio.core.models import _telemetry


@pytest.fixture
def reset_telemetry() -> t.Iterator[None]:
    """Reset the module globals so each test starts from a first-use state.

    The daemon consumer thread is never actually started in these tests (the
    ``Thread`` class is patched), so there is nothing to tear down; we only need
    to restore the globals afterwards to avoid leaking state between tests.
    """
    saved = (_telemetry._queue, _telemetry._event, _telemetry._thread)
    _telemetry._queue = None
    _telemetry._event = None
    _telemetry._thread = None
    try:
        yield
    finally:
        _telemetry._queue, _telemetry._event, _telemetry._thread = saved


def _run_concurrent_setup(
    monkeypatch: pytest.MonkeyPatch,
    threads: int,
) -> t.Tuple[int, int]:
    """Run ``_setup`` from ``threads`` workers racing on first use.

    ``Thread`` construction is intercepted so that the first worker to reach it
    parks until the others have had a chance to cross the ``_thread is None``
    guard, deterministically exercising the check-then-set window. No real
    consumer thread is started. Returns ``(threads_created, atexit_registrations)``.
    """
    created: t.List[int] = []
    atexit_registrations: t.List[t.Callable] = []
    real_thread_cls = _telemetry.tr.Thread

    release = threading.Event()
    first_arrival = threading.Event()

    class ParkingThread(real_thread_cls):  # type: ignore[valid-type, misc]
        def __init__(self, *args: t.Any, **kwargs: t.Any) -> None:
            created.append(1)
            first_arrival.set()
            # Hold inside the init window so any racing worker (only possible
            # without the lock) can also pass the guard before we finish.
            release.wait(timeout=5.0)
            super().__init__(*args, **kwargs)

        def start(self) -> None:  # do not run the real network loop
            pass

    barrier = threading.Barrier(threads)

    def worker() -> None:
        barrier.wait()
        _telemetry._setup()

    # Build the worker threads with the real Thread class *before* patching, so
    # patching ``tr.Thread`` (the shared ``threading`` module) only affects the
    # thread ``_setup`` constructs, not the harness threads themselves.
    workers = [real_thread_cls(target=worker) for _ in range(threads)]

    monkeypatch.setattr(_telemetry.tr, "Thread", ParkingThread)
    monkeypatch.setattr(
        _telemetry.atexit, "register", lambda func: atexit_registrations.append(func)
    )

    for th in workers:
        th.start()

    # Once one worker is parked inside the window, give the rest a moment to
    # arrive. With the lock they stay blocked on ``_init_lock``; without it they
    # all reach the window and each constructs a thread.
    assert first_arrival.wait(timeout=5.0), "no worker reached _setup()"
    threading.Event().wait(0.3)
    release.set()

    for th in workers:
        th.join(timeout=5.0)
        assert not th.is_alive()

    return len(created), len(atexit_registrations)


class TestSetupThreadSafety:
    """``_setup`` initializes shared telemetry state exactly once under races."""

    def test_concurrent_first_use_starts_single_thread(
        self, reset_telemetry: None, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        threads_created, atexit_registrations = _run_concurrent_setup(
            monkeypatch, threads=8
        )

        # Exactly one consumer thread and one teardown registration, no matter
        # how many callers raced on first use.
        assert threads_created == 1
        assert atexit_registrations == 1

    def test_setup_returns_same_singletons(
        self, reset_telemetry: None, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Every caller gets the identical queue/event/thread objects."""
        # Swallow the atexit registration so this test's teardown does not leak
        # into the interpreter-wide registry; we join the thread ourselves.
        monkeypatch.setattr(_telemetry.atexit, "register", lambda func: None)

        results: t.List[t.Tuple[t.Any, t.Any, t.Any]] = []
        barrier = threading.Barrier(8)

        def worker() -> None:
            barrier.wait()
            results.append(_telemetry._setup())

        workers = [threading.Thread(target=worker) for _ in range(8)]
        for th in workers:
            th.start()
        for th in workers:
            th.join(timeout=5.0)

        try:
            assert len(results) == 8
            first = results[0]
            assert all(result == first for result in results)
            # A single consumer thread drains the shared queue.
            assert first[2] is _telemetry._thread
        finally:
            # A real daemon consumer thread was started here; signal it to exit.
            if _telemetry._event is not None:
                _telemetry._event.set()
            if _telemetry._thread is not None:
                _telemetry._thread.join(timeout=5.0)
