# pylint: disable=wrong-import-position


try:
    import sentry_sdk

    sentry_sdk.init(
        dsn=(
            "https://071d95df77abfdaaa87cd9441f42e12f@o4507825828462592.ingest.de."
            "sentry.io/4507833628557392"
        ),
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
        debug=False,
    )
except Exception:
    pass


import atexit  # noqa: E402

from composio.client import Composio  # noqa: E402
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
    "WorkspaceType",
    "WorkspaceConfigType",
    "WorkspaceFactory",
    "Shell",
    "action",
    "LogLevel",
)

__version__ = "0.5.14"

atexit.register(create_latest_version_warning_hook(version=__version__))
