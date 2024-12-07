# pylint: disable=wrong-import-position

from composio.utils import sentry


sentry.init()

import atexit  # noqa: E402

from composio.__version__ import __version__  # noqa: E402
from composio.client import Composio  # noqa: E402
from composio.client.collections import CustomAuthObject  # noqa: E402
from composio.client.enums import (  # noqa: E402
    Action,
    ActionType,
    App,
    AppType,
    Tag,
    TagType,
    Trigger,
    TriggerType,
)
from composio.tools import ComposioToolSet  # noqa: E402
from composio.tools.base.runtime import action  # noqa: E402
from composio.tools.env.factory import (  # noqa: E402
    WorkspaceConfigType,
    WorkspaceFactory,
    WorkspaceType,
)
from composio.tools.env.host.shell import Shell  # noqa: E402
from composio.client.utils import update_apps, update_actions, update_triggers
from composio.utils.logging import LogLevel  # noqa: E402
from composio.utils.warnings import create_latest_version_warning_hook  # noqa: E402


__all__ = (
    "Tag",
    "App",
    "Action",
    "AppType",
    "Trigger",
    "TagType",
    "Composio",
    "ActionType",
    "TriggerType",
    "ComposioToolSet",
    "CustomAuthObject",
    "WorkspaceType",
    "WorkspaceConfigType",
    "WorkspaceFactory",
    "Shell",
    "action",
    "LogLevel",
)


def startup() -> None:
    print("Getting the latest apps, please wait...")
    client = ComposioToolSet().client

    # TODO: only do a full update if the cache is old.
    # Detect if the cache is old by checking if the actions
    # don't contain a "replace_by" field.
    # If the cache isn't old, diff the enums and only cache
    # the ones that don't exist.
    apps = update_apps(client)
    update_actions(client, apps)
    update_triggers(client, apps)


startup()

atexit.register(create_latest_version_warning_hook(version=__version__))
