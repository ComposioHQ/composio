import typing as t

from composio.client.enums.action import Action
from composio.client.enums.enum import Enum, EnumGenerator
from .base import AppData, EnumStringNotFound

_APP_CACHE: t.Dict[str, "App"] = {}


class App(Enum[AppData], metaclass=EnumGenerator):
    cache_folder = "apps"
    cache = _APP_CACHE
    storage = AppData

    def load(self) -> AppData:
        try:
            return super().load()

        except EnumStringNotFound:
            # re-load local tools, and check if it's a runtime app
            from composio.tools.local import load_local_tools
            from composio.tools.base.abs import tool_registry

            load_local_tools()

            for gid, tools in tool_registry.items():
                if self.slug in tools:
                    self._data = AppData(
                        name=tools[self.slug].name,
                        is_local=gid in ("runtime", "local"),
                        path=self.storage_path,
                    )
                    return self._data

            raise

    @property
    def name(self) -> str:
        return self.load().name

    @property
    def is_local(self) -> bool:
        return self.load().is_local

    def get_actions(self, tags: t.Optional[t.List[str]] = None) -> t.Iterator[Action]:
        """
        Get actions for the given app filtered by the `tags`

        :param tags: List of tags to filter the actions
        :return: Iterator object which yields `Action`
        """
        tags = tags or []
        for action in Action.all():
            if not action.slug.startswith(f"{self.slug}_"):
                continue

            if len(tags) == 0 or any(tag in action.tags for tag in tags):
                yield action
