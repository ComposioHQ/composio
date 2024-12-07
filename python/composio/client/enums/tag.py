import typing as t

from composio.client.enums.enum import Enum, EnumGenerator
from .base import TagData

_TAG_CACHE: t.Dict[str, "Tag"] = {}


class Tag(Enum[TagData], metaclass=EnumGenerator):
    cache_folder = "tags"
    cache = _TAG_CACHE
    storage = TagData

    @property
    def value(self) -> str:
        return self.load().value

    @property
    def app(self) -> str:
        return self.load().app
