"""Sentry utilities."""

import atexit
import json
import os
import traceback
import types
import typing as t
from functools import cache

import requests
import sentry_sdk
import sentry_sdk.integrations.argv
import sentry_sdk.integrations.atexit
import sentry_sdk.integrations.dedupe
import sentry_sdk.integrations.excepthook
import sentry_sdk.integrations.fastapi
import sentry_sdk.integrations.logging
import sentry_sdk.integrations.modules
import sentry_sdk.integrations.stdlib
import sentry_sdk.integrations.threading
import sentry_sdk.types

from composio.constants import LOCAL_CACHE_DIRECTORY


@cache
def fetch_dsn() -> t.Optional[str]:
    request = requests.get(
        url="https://backend.composio.dev/api/v1/cli/sentry-dns",
        timeout=10,
    )
    if request.status_code != 200:
        return None
    return request.json().get("dns")


def get_sentry_config() -> t.Optional[t.Dict]:
    user_file = LOCAL_CACHE_DIRECTORY / "user_data.json"
    if not user_file.exists():
        update_dsn()

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

    _, exc, trb = hint["exc_info"]
    if isinstance(exc, KeyboardInterrupt):
        return None

    trb = t.cast(types.TracebackType, trb)
    # In editable installs, we won't have composio in site-packages.
    # This ensures we don't send sentry issues during development.
    traceback_text = "".join(traceback.format_tb(trb))
    if "site-packages" + os.path.sep + "composio" not in traceback_text:
        return None

    return event


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
        default_integrations=False,
        integrations=[
            sentry_sdk.integrations.argv.ArgvIntegration(),
            sentry_sdk.integrations.atexit.AtexitIntegration(
                callback=lambda x, y: None,
            ),  # suppress atexit message
            sentry_sdk.integrations.dedupe.DedupeIntegration(),
            sentry_sdk.integrations.excepthook.ExcepthookIntegration(),
            sentry_sdk.integrations.fastapi.FastApiIntegration(),
            sentry_sdk.integrations.logging.LoggingIntegration(),
            sentry_sdk.integrations.modules.ModulesIntegration(),
            sentry_sdk.integrations.stdlib.StdlibIntegration(),
            sentry_sdk.integrations.threading.ThreadingIntegration(),
        ],
    )


@atexit.register
def update_dsn() -> None:
    user_file = LOCAL_CACHE_DIRECTORY / "user_data.json"
    if user_file.exists():
        try:
            data = json.loads(user_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return
    else:
        data = {}

    if data.get("sentry", {}).get("dsn") is not None:
        return

    try:
        dsn = fetch_dsn()
        if dsn is None:
            return

        data["sentry"] = {"dsn": dsn}
    except Exception:  # pylint: disable=broad-except
        pass

    user_file.parent.mkdir(parents=True, exist_ok=True)
    user_file.write_text(json.dumps(data), encoding="utf-8")
