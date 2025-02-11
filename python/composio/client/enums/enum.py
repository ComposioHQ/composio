import os
import typing as t
from pathlib import Path

import typing_extensions as te

from composio.constants import LOCAL_CACHE_DIRECTORY
from composio.exceptions import EnumStringNotFound, InvalidEnum
from composio.storage.base import LocalStorage

from .base import ActionData, SentinalObject


DataT = t.TypeVar("DataT", bound=LocalStorage)


NO_REMOTE_ENUM_FETCHING = (
    os.environ.get("COMPOSIO_NO_REMOTE_ENUM_FETCHING", "false") != "false"
)


class Enum(t.Generic[DataT]):
    cache_folder: str
    cache: t.Dict[str, "te.Self"]
    storage: t.Type[DataT]

    def __new__(
        cls,
        value: t.Union[str, te.Self, t.Type[SentinalObject]],
        cache: bool = True,
    ) -> "te.Self":
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
        if cache and cached_enum is not None:
            return cached_enum  # type: ignore[return-value]

        enum = super().__new__(cls)
        if cache:
            cls.cache[value] = enum
        return enum

    def __init__(
        self,
        value: t.Union[str, te.Self, t.Type[SentinalObject]],
        cache: bool = True,  # pylint: disable=unused-argument
    ) -> None:
        if hasattr(self, "_data"):
            # Object was pulled from cache and is already initialized
            return

        self._data: t.Optional[DataT] = None

        # If we get an enum object, return it as is
        if isinstance(value, self.__class__):
            return

        # Runtime action handling
        if hasattr(value, "sentinel"):  # TODO: get rid of SentinalObject
            slug = value.enum  # type: ignore
            if not isinstance(slug, str):
                raise InvalidEnum(f"Invalid enum type: {slug!r}, expected str")

        else:
            slug = str(value)

        # Normalize slug
        slug = slug.upper()
        self.slug = slug

    def __hash__(self) -> int:
        return hash(self.slug)

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}.{self.slug}"

    def __str__(self) -> str:
        return self.slug

    def __eq__(self, other: object) -> bool:
        if isinstance(other, Enum):
            return self.slug == other.slug

        if isinstance(other, str):
            return self.slug == other

        return False

    @classmethod
    def iter(cls) -> t.Iterator[str]:
        """Yield the enum names as strings."""
        # TODO: fetch trigger names from dedicated endpoint in the future
        path = LOCAL_CACHE_DIRECTORY / cls.cache_folder
        # If we try to fetch Actions.iter() with local caching disabled
        # for example, we'd get here.
        if not path.exists():
            # pylint: disable=import-outside-toplevel
            from composio.client import Composio

            # pylint: disable=import-outside-toplevel
            from composio.client.utils import check_cache_refresh

            check_cache_refresh(Composio.get_latest())
            if not path.exists():
                return

        yield from os.listdir(path)

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
            # HACK: if 'replaced_by' field is not present, delete this cached file
            # as it is outdated.
            if isinstance(data, ActionData):
                if hasattr(data, "replaced_by"):
                    self._data = data  # type: ignore
                    return self._data  # type: ignore

                self.storage_path.unlink()

            self._data = data
            return self._data

        # Try to fetch from runtime
        runtime_data = self.load_from_runtime()
        if runtime_data is not None:
            self._data = runtime_data
            return self._data

        # Try to fetch from API, and cache it locally
        if not NO_REMOTE_ENUM_FETCHING:
            remote_data = self.fetch_and_cache()
            if remote_data is not None:
                remote_data.store()
                self._data = remote_data
                return self._data

        raise EnumStringNotFound(
            value=self.slug,
            enum=self.__class__.__name__,
            possible_values=list(self.iter()),
        )

    def load_from_runtime(self) -> t.Optional[DataT]:
        raise NotImplementedError

    def fetch_and_cache(self) -> t.Optional[DataT]:
        raise NotImplementedError


class EnumGenerator(type):
    def __getattr__(cls, name: str):
        return cls(name)
