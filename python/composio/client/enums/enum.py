import os
import typing as t
from pathlib import Path

import typing_extensions as te

from composio.constants import LOCAL_CACHE_DIRECTORY
from composio.exceptions import ComposioSDKError
from composio.storage.base import LocalStorage

from .base import EnumStringNotFound, SentinalObject


DataT = t.TypeVar("DataT", bound=LocalStorage)


# TODO: can we remove the generic altogether, we already have storage
class Enum(t.Generic[DataT]):
    cache_folder: str
    cache: t.Dict[str, "te.Self"]
    storage: t.Type[DataT]

    def __new__(cls, value: t.Union[str, te.Self, t.Type[SentinalObject]]) -> "te.Self":
        """Cache the enum singleton."""
        # No caching for runtime actions
        if hasattr(value, "sentinel"):  # TODO: get rid of SentinalObject
            return super().__new__(cls)

        # If we get an enum object, return it as is
        if isinstance(value, cls):
            return value

        # Because people will pass weird stuff into the constructor
        value = str(value)

        # Normalize slug
        value = value.upper()

        cached_enum = cls.cache.get(value)
        if cached_enum is not None:
            return cached_enum  # type: ignore[return-value]

        enum = super().__new__(cls)
        cls.cache[value] = enum
        return enum

    def __init__(self, value: t.Union[str, te.Self, t.Type[SentinalObject]]) -> None:
        if hasattr(self, "_data"):
            # Object was pulled from cache and is already initialized
            return

        self._data: DataT | None = None

        # If we get an enum object, return it as is
        if isinstance(value, self.__class__):
            return

        # Runtime action handling
        if hasattr(value, "sentinel"):  # TODO: get rid of SentinalObject
            slug = value.enum  # type: ignore
            if not isinstance(slug, str):
                raise ComposioSDKError(f"Invalid enum type: {slug!r}, expected str")
        else:
            slug = str(value)

        # Normalize slug
        slug = slug.upper()
        self.slug = slug

    def __hash__(self) -> int:
        return hash(self.slug)

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}.{self.slug}"

    def __eq__(self, other: object) -> bool:
        if isinstance(other, Enum):
            return self.slug == other.slug

        if isinstance(other, str):
            return self.slug == other

        return False

    @classmethod
    def iter(cls) -> t.Iterator[str]:
        """Yield the enum names as strings."""
        path = LOCAL_CACHE_DIRECTORY / cls.cache_folder
        for file in os.listdir(path):
            yield file

    @classmethod
    def all(cls) -> t.Iterator[te.Self]:
        """Iterate over available object."""
        for app_name in cls.iter():
            yield cls(app_name)

    @property
    def storage_path(self) -> Path:
        return LOCAL_CACHE_DIRECTORY / self.cache_folder / self.slug

    def load(self) -> DataT:
        if self._data is not None:
            return self._data

        if self.storage_path.exists():
            data = self.storage.load(self.storage_path)
            self._data = data
            return self._data

        raise EnumStringNotFound(
            value=self.slug,
            enum=self.__class__.__name__,
            possible_values=list(self.iter()),
        )


class EnumGenerator(type):
    def __getattr__(cls, name: str):
        return cls(name)
