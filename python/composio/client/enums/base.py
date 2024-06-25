"""
Enum helper base.
"""

import typing as t
from pathlib import Path

import typing_extensions as te

from composio.constants import LOCAL_CACHE_DIRECTORY
from composio.exceptions import ComposioSDKError
from composio.storage.base import LocalStorage


_model_cache: t.Dict[str, LocalStorage] = {}

EntityType = t.TypeVar("EntityType", bound=LocalStorage)
ClassType = t.TypeVar("ClassType", bound=t.Type["_AnnotatedEnum"])

TAGS_CACHE = LOCAL_CACHE_DIRECTORY / "tags"
APPS_CACHE = LOCAL_CACHE_DIRECTORY / "apps"
ACTIONS_CACHE = LOCAL_CACHE_DIRECTORY / "actions"
TRIGGERS_CACHE = LOCAL_CACHE_DIRECTORY / "triggers"


class MetadataFileNotFound(ComposioSDKError):
    """Raise when matadata file is missing."""


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


class TriggerData(LocalStorage):
    """Local storage for `Trigger` object."""

    name: str
    "Name of the trigger."

    app: str
    "Name of the app where this trigger belongs to."
    _cache: Path = TRIGGERS_CACHE


class _AnnotatedEnum(t.Generic[EntityType]):
    """Enum class that uses class annotations as values."""

    _slug: str
    _model: t.Type[EntityType]
    _path: Path

    def __new__(cls, value: t.Any):
        (base,) = t.cast(t.Tuple[t.Any], getattr(cls, "__orig_bases__"))
        (model,) = t.get_args(base)
        instance = super().__new__(cls)
        instance._model = model
        return instance

    def __init_subclass__(cls, path: Path) -> None:
        cls._path = path
        return super().__init_subclass__()

    def __init__(self, value: t.Union[str, te.Self]) -> None:
        """Create an Enum"""
        if isinstance(value, _AnnotatedEnum):
            value = value._slug

        value = t.cast(str, value).upper()
        if value not in self.__annotations__:
            raise ValueError(f"Invalid value `{value}` for `{self.__class__.__name__}`")
        self._slug = value

    @property
    def slug(self) -> str:
        """Enum slug value."""
        return self._slug

    def load(self) -> EntityType:
        """Load action data."""
        if self._slug is None:
            raise ValueError(
                "Cannot load `AppData` object without initializing object."
            )
        if not (self._path / self._slug).exists():
            raise MetadataFileNotFound(
                f"Metadata file for `{self._slug}` not found, "
                "Please run `composio apps update` to fix this"
            )
        if self._slug not in _model_cache:
            _model_cache[self._slug] = self._model.load(self._path / self._slug)
        return t.cast(EntityType, _model_cache[self._slug])

    @classmethod
    def all(cls) -> t.Iterator[te.Self]:
        """Iterate over available object."""
        for name in cls.__annotations__:
            yield cls._create(name=name)

    @classmethod
    def _create(cls, name: str) -> te.Self:
        """Create a `_AnnotatedEnum` class."""
        return cls(name)

    def __str__(self) -> str:
        """String representation."""
        return t.cast(str, self._slug)

    def __eq__(self, other: object) -> bool:
        """Check equivilance of two objects."""
        if not isinstance(other, (str, _AnnotatedEnum)):
            return NotImplemented
        return str(self) == str(other)


def enum(cls: ClassType) -> ClassType:
    """Decorate class."""
    for attr in cls.__annotations__:
        setattr(cls, attr, cls(attr))
    return cls
