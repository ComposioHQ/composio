import typing as t

from composio.client.enums.action import Action
from composio.client.enums.enum import Enum, EnumGenerator

from .base import AppData


_APP_CACHE: t.Dict[str, "App"] = {}


class App(Enum[AppData], metaclass=EnumGenerator):
    cache_folder = "apps"
    cache = _APP_CACHE
    storage = AppData

    def load_from_runtime(self) -> t.Optional[AppData]:
        # re-load local tools, and check if it's a runtime app
        from composio.tools.base.abs import (  # pylint: disable=import-outside-toplevel
            tool_registry,
        )
        from composio.tools.local import (  # pylint: disable=import-outside-toplevel
            load_local_tools,
        )

        load_local_tools()

        for gid, tools in tool_registry.items():
            if self.slug in tools:
                self._data = AppData(
                    name=tools[self.slug].name,
                    is_local=gid in ("runtime", "local"),
                    path=self.storage_path,
                )
                return self._data

        return None

    def fetch_and_cache(self) -> t.Optional[AppData]:
        from composio.client import Composio  # pylint: disable=import-outside-toplevel

        client = Composio.get_latest()
        response = client.http.get(url=str(client.apps.endpoint / self.slug)).json()
        # TOFIX: Return proper error code when of item is not found
        if "message" in response:
            return None

        return AppData(
            name=response["name"],
            path=self.storage_path,
            is_local=False,
        )

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
