import typing as t

from composio.client.enums.enum import Enum, EnumGenerator

from .base import TagData


_TAG_CACHE: t.Dict[str, "Tag"] = {}


class Tag(Enum[TagData], metaclass=EnumGenerator):
    cache_folder = "tags"
    cache = _TAG_CACHE
    storage = TagData

    def fetch_and_cache(self) -> TagData | None:
        # Tags are only fetched at startup right now.
        return None

    def load_from_runtime(self) -> TagData | None:
        # Tags are not used at runtime right now.
        return None

    # TODO: why is it value in tag but name in trigger
    @property
    def value(self) -> str:
        return self.load().value

    @property
    def app(self) -> str:
        return self.load().app
