"""Sentry utilities."""

import atexit
import json
import os
import traceback
import types
import typing as t
from pathlib import Path

import requests
import sentry_sdk
import sentry_sdk.integrations
import sentry_sdk.integrations.atexit
import sentry_sdk.types


def fetch_dsn() -> t.Optional[str]:
    request = requests.get(
        url="https://backend.composio.dev/api/v1/cli/sentry-dns",
        timeout=10,
    )
    if request.status_code != 200:
        return None
    return request.json().get("dns")


def get_sentry_config() -> t.Optional[t.Dict]:
    user_file = Path.home() / ".composio" / "user_data.json"
    if not user_file.exists():
        return None

    try:
        data = json.loads(user_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None

    if data.get("api_key") is None:
        return None

    return data.get("sentry")


def filter_sentry_errors(
    event: sentry_sdk.types.Event,
    hint: sentry_sdk.types.Hint,
) -> t.Optional[sentry_sdk.types.Event]:
    if "exc_info" not in hint:
        return None

    _, _, trb = hint["exc_info"]
    trb = t.cast(types.TracebackType, trb)
    for frm in traceback.format_tb(trb):
        if "site-packages/composio" in frm:
            return event
    return None


def init():
    if os.environ.get("COMPOSIO_DISABLE_SENTRY", "false").lower() in ("true", "t"):
        return

    sentry_config = get_sentry_config()
    if sentry_config is None:
        return

    if sentry_config.get("dsn") is None:
        return

    sentry_sdk.init(
        dsn=sentry_config["dsn"],
        traces_sample_rate=sentry_config.get("traces_sample_rate", 1.0),
        profiles_sample_rate=sentry_config.get("profiles_sample_rate", 1.0),
        debug=False,
        before_send=filter_sentry_errors,
        integrations=[
            sentry_sdk.integrations.atexit.AtexitIntegration(
                callback=lambda x, y: None
            )  # suppress atexit message
        ],
    )


@atexit.register
def update_dns() -> None:
    user_file = Path.home() / ".composio" / "user_data.json"
    if not user_file.exists():
        return

    try:
        data = json.loads(user_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return

    if data.get("api_key") is None:
        return

    if data.get("sentry") is not None and data.get("sentry").get("dsn") is not None:
        return

    dsn = fetch_dsn()
    if dsn is None:
        return

    data["sentry"] = {"dsn": dsn}
    user_file.write_text(json.dumps(data), encoding="utf-8")
