"""Composio enum helpers."""

import typing as t

from . import base
from .action import Action
from .app import App
from .tag import Tag
from .trigger import Trigger


TagType = t.Union[str, Tag]
"Type placeholder for `App`"

AppType = t.Union[str, App]
"Type placeholder for `App`"

ActionType = t.Union[str, Action, t.Type[base.SentinalObject]]
"Type placeholder for `Action`"

TriggerType = t.Union[str, Trigger]
"Type placeholder for `Trigger`"

__all__ = (
    "base",
    "Tag",
    "App",
    "Trigger",
    "Action",
    "TagType",
    "AppType",
    "ActionType",
    "TriggerType",
)
