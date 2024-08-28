import atexit

from composio.client import Composio
from composio.client.enums import (
    Action,
    ActionType,
    App,
    AppType,
    Tag,
    TagType,
    Trigger,
    TriggerType,
)
from composio.tools import ComposioToolSet
from composio.tools.base.runtime import action
from composio.tools.env.factory import (
    WorkspaceConfigType,
    WorkspaceFactory,
    WorkspaceType,
)
from composio.tools.env.host.shell import Shell
from composio.utils.logging import LogLevel
from composio.utils.warnings import create_latest_version_warning_hook


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

__version__ = "0.5.9"

atexit.register(create_latest_version_warning_hook(version=__version__))
