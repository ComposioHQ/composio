"""
Enum helper base.
"""

import difflib
import os
import typing as t
import warnings
from pathlib import Path

import typing_extensions as te

from composio.constants import LOCAL_CACHE_DIRECTORY
from composio.exceptions import ComposioSDKError
from composio.storage.base import LocalStorage


_model_cache: t.Dict[str, LocalStorage] = {}
_local_actions: t.Dict[str, "ActionData"] = {}
_runtime_actions: t.Dict[str, "ActionData"] = {}

EntityType = t.TypeVar("EntityType", bound=LocalStorage)
ClassType = t.TypeVar("ClassType", bound=t.Type["_AnnotatedEnum"])

TAGS_CACHE = LOCAL_CACHE_DIRECTORY / "tags"
APPS_CACHE = LOCAL_CACHE_DIRECTORY / "apps"
ACTIONS_CACHE = LOCAL_CACHE_DIRECTORY / "actions"
TRIGGERS_CACHE = LOCAL_CACHE_DIRECTORY / "triggers"

NO_REMOTE_ENUM_FETCHING = (
    os.environ.get("COMPOSIO_NO_REMOTE_ENUM_FETCHING", "false") == "true"
)


class EnumStringNotFound(ComposioSDKError):
    """Raise when user provides invalid enum string."""

    def __init__(self, value: str, enum: str, possible_values: t.List[str]) -> None:
        error_message = f"Invalid value `{value}` for enum class `{enum}`"

        matches = difflib.get_close_matches(value, possible_values, n=1)
        if matches:
            (match,) = matches
            error_message += f". Did you mean {match!r}?"

        super().__init__(message=error_message)


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


class TriggerData(LocalStorage):
    """Local storage for `Trigger` object."""

    name: str
    "Name of the trigger."

    app: str
    "Name of the app where this trigger belongs to."


class _AnnotatedEnum(t.Generic[EntityType]):
    """Enum class that uses class annotations as values."""

    _slug: str
    _path: Path
    _model: t.Type[EntityType]
    _deprecated: t.Dict = {}

    def __new__(cls, value: t.Any, warn: bool = True):
        (base,) = t.cast(t.Tuple[t.Any], getattr(cls, "__orig_bases__"))
        (model,) = t.get_args(base)
        instance = super().__new__(cls)
        instance._model = model
        return instance

    def __init_subclass__(cls, path: Path) -> None:
        cls._path = path
        return super().__init_subclass__()

    def __init__(
        self,
        value: t.Union[str, te.Self, t.Type[SentinalObject]],
        warn: bool = True,
    ) -> None:
        """Create an Enum"""
        if hasattr(value, "sentinel"):
            self._slug = value.enum  # type: ignore
            return

        if isinstance(value, _AnnotatedEnum):
            value = value._slug
        self._slug = t.cast(str, value).upper()

        # Anthropic 😭
        if self._slug == "BASH":
            self._slug = "ANTHROPIC_BASH_COMMAND"

        if self._slug == "COMPUTER":
            self._slug = "ANTHROPIC_COMPUTER"

        if self._slug == "STR_REPLACE_EDITOR":
            self._slug = "ANTHROPIC_TEXT_EDITOR"

        if self._slug in self._deprecated and warn:
            warnings.warn(
                f"`{self._slug}` is deprecated and will be removed. "
                f"Use `{self._deprecated[self._slug]}` instead.",
                UserWarning,
            )
            self._slug = self._deprecated[self._slug]
            return

        if self._slug in self.__annotations__ or self._slug in _runtime_actions:
            return

        if self._cache_from_local() is not None:
            return

        raise EnumStringNotFound(
            value=self._slug,
            enum=self.__class__.__name__,
            possible_values=list(self.iter()),
        )

    @property
    def slug(self) -> str:
        """Enum slug value."""
        return self._slug

    def _cache_from_local(self) -> t.Optional[EntityType]:
        from composio.tools.base.abs import (  # pylint: disable=import-outside-toplevel
            action_registry,
            tool_registry,
            trigger_registry,
        )
        from composio.tools.local import (  # pylint: disable=import-outside-toplevel
            load_local_tools,
        )

        load_local_tools()

        for gid, actions in action_registry.items():
            if self._slug in actions:
                action = actions[self._slug]
                _model_cache[self._slug] = ActionData(
                    name=action.name,
                    app=action.tool,
                    tags=action.tags(),
                    no_auth=action.no_auth,
                    is_local=gid in ("runtime", "local"),
                    path=self._path / self._slug,
                )
                return _model_cache[self._slug]  # type: ignore

        for gid, tools in tool_registry.items():
            if self._slug in tools:
                _model_cache[self._slug] = AppData(
                    name=tools[self._slug].name,
                    is_local=gid in ("runtime", "local"),
                    path=self._path / self._slug,
                )
                return _model_cache[self._slug]  # type: ignore

        for gid, triggers in trigger_registry.items():
            if self._slug in triggers:
                _model_cache[self._slug] = TriggerData(
                    name=triggers[self._slug].name,
                    app=triggers[self._slug].tool,
                    path=self._path / self._slug,
                )
                return _model_cache[self._slug]  # type: ignore

        return None

    def _cache_from_remote(self) -> EntityType:
        if NO_REMOTE_ENUM_FETCHING:
            raise ComposioSDKError(
                message=(
                    f"No metadata found for enum `{self.slug}`, "
                    "You might be trying to use an app or action "
                    "that is deprecated, run `composio apps update` "
                    "and try again"
                )
            )

        from composio.client import Composio  # pylint: disable=import-outside-toplevel
        from composio.client.endpoints import (  # pylint: disable=import-outside-toplevel
            v2,
        )

        client = Composio.get_latest()
        data: t.Union[AppData, TriggerData, ActionData]

        if self._model is AppData:
            response = client.http.get(url=str(client.apps.endpoint / self.slug)).json()
            data = AppData(
                name=response["name"],
                path=self._path / self._slug,
                is_local=False,
            )

        if self._model is ActionData:
            request = client.http.get(url=str(client.actions.endpoint / self.slug))
            response = request.json()
            if isinstance(response, list):
                response, *_ = response

            if request.status_code == 404 or "Not Found" in response.get("message", ""):
                raise ComposioSDKError(
                    message=(
                        f"No metadata found for enum `{self.slug}`, "
                        "You might be trying to use an app or action "
                        "that is deprecated, run `composio apps update` "
                        "and try again"
                    )
                )

            data = ActionData(
                name=response["name"],
                app=response["appName"],
                tags=response["tags"],
                no_auth=(
                    client.http.get(url=str(client.apps.endpoint / response["appName"]))
                    .json()
                    .get("no_auth", False)
                ),
                is_local=False,
                is_runtime=False,
                shell=False,
                path=self._path / self._slug,
            )

        if self._model is TriggerData:
            response = client.http.get(url=str(v2.triggers / self.slug)).json()
            data = TriggerData(
                name=response["enum"],
                app=response["appName"],
                path=self._path / self._slug,
            )

        return data  # type: ignore

    def _cache(self) -> None:
        """Create cache for the enum."""
        data = self._cache_from_local() or self._cache_from_remote()
        _model_cache[self._slug] = data
        try:
            data.store()
        except (OSError, PermissionError):
            pass

    def load(self) -> EntityType:
        """Load action data."""
        if self._slug is None:
            raise ValueError(
                f"Cannot load `{self._model.__class__}` object without initializing object."
            )

        if self._slug in _model_cache:
            return t.cast(EntityType, _model_cache[self._slug])

        if self._slug in _runtime_actions:
            return _runtime_actions[self._slug]  # type: ignore

        if not (self._path / self._slug).exists():
            self._cache()

        if self._slug not in _model_cache:
            _model_cache[self._slug] = self._model.load(self._path / self._slug)

        return t.cast(EntityType, _model_cache[self._slug])

    @classmethod
    def iter(cls) -> t.Iterator[str]:
        """Yield the enum names as strings."""
        for name in cls.__annotations__:
            if name == "_deprecated":
                continue

            yield name

    @classmethod
    def all(cls) -> t.Iterator[te.Self]:
        """Iterate over available object."""
        for app_name in cls.iter():
            yield cls(app_name)

    def __str__(self) -> str:
        """String representation."""
        return self._slug

    def __repr__(self) -> str:
        """Developer friendly representation."""
        return f"{self.__class__.__qualname__}.{self}"

    def __eq__(self, other: object) -> bool:
        """Check equivalence of two objects."""
        if not isinstance(other, (str, _AnnotatedEnum)):
            return NotImplemented
        return str(self) == str(other)

    def __hash__(self) -> int:
        return hash(self._slug)


def enum(cls: ClassType) -> ClassType:
    """Decorate class."""
    for attr in cls.__annotations__:
        if attr == "_deprecated":
            continue
        setattr(cls, attr, cls(attr, warn=False))
    return cls


def add_runtime_action(name: str, data: ActionData) -> None:
    """Add action at runtime."""
    _runtime_actions[name] = data


def get_runtime_actions() -> t.List:
    """Add action at runtime."""
    return list(_runtime_actions)
