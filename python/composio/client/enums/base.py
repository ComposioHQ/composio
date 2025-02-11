"""
Enum helper base.
"""

import typing as t

from pydantic import Field

from composio.constants import (
    COMPOSIO_VERSIONING_POLICY,
    LOCAL_CACHE_DIRECTORY,
    VERSION_LATEST,
    VERSION_LATEST_BASE,
)
from composio.storage.base import LocalStorage


_runtime_actions: t.Dict[str, "ActionData"] = {}

EntityType = t.TypeVar("EntityType", bound=LocalStorage)

TAGS_CACHE = LOCAL_CACHE_DIRECTORY / "tags"
APPS_CACHE = LOCAL_CACHE_DIRECTORY / "apps"
ACTIONS_CACHE = LOCAL_CACHE_DIRECTORY / "actions"
TRIGGERS_CACHE = LOCAL_CACHE_DIRECTORY / "triggers"


class SentinalObject:
    """Sentinel object."""

    sentinel = None


class TagData(LocalStorage):
    """Local storage for `Tag` object."""

    app: str
    "App name for this tag."

    value: str
    "Tag string."


class AppData(LocalStorage):
    """Local storage for `App` object."""

    name: str
    "Name of the app."

    is_local: bool = False
    "The tool is local if set to `True`"


class ActionData(LocalStorage):
    """Local storage for `Action` object."""

    name: str
    "Action name."

    app: str
    "App name where the actions belongs to."

    tags: t.List[str]
    "Tag string for the action."

    no_auth: bool = False
    "If set `True` the action does not require authentication."

    is_local: bool = False
    "If set `True` the `app` is a local app."

    is_runtime: bool = False
    "Set `True` for actions registered at runtime."

    shell: bool = False
    "If set `True` the action will be executed using a shell."

    replaced_by: t.Optional[str] = None
    "If set, the action is deprecated and replaced by the given action."

    version: str = COMPOSIO_VERSIONING_POLICY
    "Specify what version to use when executing action."

    available_version: t.List[str] = Field(
        default_factory=lambda: [
            VERSION_LATEST,
            VERSION_LATEST_BASE,
        ]
    )
    "Specify what version to use when executing action."


class TriggerData(LocalStorage):
    """Local storage for `Trigger` object."""

    name: str
    "Name of the trigger."

    app: str
    "Name of the app where this trigger belongs to."


def add_runtime_action(name: str, data: ActionData) -> None:
    """Add action at runtime."""
    _runtime_actions[name] = data


# TODO: action_registry exists, how is _runtime_actions different from that?
def get_runtime_actions() -> t.List:
    """Add action at runtime."""
    return list(_runtime_actions)


DEPRECATED_MARKER = "<<DEPRECATED use "


def replacement_action_name(description: str, app_name: str) -> t.Optional[str]:
    """If the action is deprecated, get the replacement action name."""
    if description is not None and DEPRECATED_MARKER in description:
        _, newact = description.split(DEPRECATED_MARKER, maxsplit=1)
        return (app_name + "_" + newact.replace(">>", "")).upper()

    return None
