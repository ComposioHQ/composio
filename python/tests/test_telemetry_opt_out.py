"""``COMPOSIO_DISABLE_TELEMETRY`` opts the SDK out of telemetry.

The variable is parsed the same way the Composio CLI parses it and wins over
``allow_tracking=True``; ``allow_tracking=False`` keeps working on its own.
"""

import typing as t
from unittest.mock import Mock, patch

import pytest

from composio import Composio
from composio.core.models import base
from composio.core.models.base import (
    ENV_DISABLE_TELEMETRY,
    Resource,
    allow_tracking,
    is_telemetry_disabled_by_env,
)

DISABLING_VALUES = ["true", "TRUE", "True", "1", "yes", "on", " true "]
NON_DISABLING_VALUES = ["", "   ", "0", "false", "FALSE", "no", "off"]


class _Probe(Resource):
    def ok(self) -> str:
        return "ok"

    def fail(self) -> None:
        raise ValueError("boom")


@pytest.fixture
def tracking_allowed() -> t.Iterator[None]:
    token = allow_tracking.set(True)
    yield
    allow_tracking.reset(token)


@pytest.fixture
def pushed_events() -> t.Iterator[Mock]:
    with patch.object(base, "push_event") as push_event:
        yield push_event


def _call_probe() -> None:
    probe = _Probe(client=Mock(provider="test"))
    assert probe.ok() == "ok"
    with pytest.raises(ValueError, match="boom"):
        probe.fail()


@pytest.mark.parametrize("value", DISABLING_VALUES)
def test_env_flag_disables_telemetry(
    value: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(ENV_DISABLE_TELEMETRY, value)
    assert is_telemetry_disabled_by_env() is True


@pytest.mark.parametrize("value", NON_DISABLING_VALUES)
def test_env_flag_off_spellings_keep_telemetry(
    value: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(ENV_DISABLE_TELEMETRY, value)
    assert is_telemetry_disabled_by_env() is False


def test_unset_env_flag_keeps_telemetry(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(ENV_DISABLE_TELEMETRY, raising=False)
    assert is_telemetry_disabled_by_env() is False


@pytest.mark.usefixtures("tracking_allowed")
def test_events_are_pushed_by_default(
    monkeypatch: pytest.MonkeyPatch, pushed_events: Mock
) -> None:
    monkeypatch.delenv(ENV_DISABLE_TELEMETRY, raising=False)

    _call_probe()

    assert [call.kwargs["event"][0] for call in pushed_events.call_args_list] == [
        "metric",
        "error",
    ]


@pytest.mark.usefixtures("tracking_allowed")
@pytest.mark.parametrize("value", DISABLING_VALUES)
def test_env_flag_stops_metric_and_error_events(
    value: str, monkeypatch: pytest.MonkeyPatch, pushed_events: Mock
) -> None:
    monkeypatch.setenv(ENV_DISABLE_TELEMETRY, value)

    _call_probe()

    pushed_events.assert_not_called()


@pytest.mark.usefixtures("tracking_allowed")
@pytest.mark.parametrize("value", NON_DISABLING_VALUES)
def test_env_flag_off_spellings_keep_events(
    value: str, monkeypatch: pytest.MonkeyPatch, pushed_events: Mock
) -> None:
    monkeypatch.setenv(ENV_DISABLE_TELEMETRY, value)

    _call_probe()

    assert pushed_events.call_count == 2


def test_env_flag_wins_over_explicit_allow_tracking(
    monkeypatch: pytest.MonkeyPatch, pushed_events: Mock
) -> None:
    monkeypatch.setenv(ENV_DISABLE_TELEMETRY, "true")
    token = allow_tracking.set(True)
    try:
        Composio(api_key="test-key", allow_tracking=True)
        assert allow_tracking.get() is True

        _call_probe()
    finally:
        allow_tracking.reset(token)

    pushed_events.assert_not_called()


def test_allow_tracking_false_still_disables_telemetry(
    monkeypatch: pytest.MonkeyPatch, pushed_events: Mock
) -> None:
    monkeypatch.delenv(ENV_DISABLE_TELEMETRY, raising=False)
    token = allow_tracking.set(False)
    try:
        _call_probe()
    finally:
        allow_tracking.reset(token)

    pushed_events.assert_not_called()
