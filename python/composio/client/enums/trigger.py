import typing as t

from composio.client.enums.enum import Enum, EnumGenerator

from .base import TriggerData


_TRIGGER_CACHE: t.Dict[str, "Trigger"] = {}


class Trigger(Enum[TriggerData], metaclass=EnumGenerator):
    cache_folder = "triggers"
    cache = _TRIGGER_CACHE
    storage = TriggerData

    def load_from_runtime(self) -> t.Optional[TriggerData]:
        from composio.tools.base.abs import (  # pylint: disable=import-outside-toplevel
            trigger_registry,
        )

        for triggers in trigger_registry.values():
            if self.slug in triggers:
                self._data = TriggerData(
                    name=triggers[self.slug].name,
                    app=triggers[self.slug].tool,
                    path=self.storage_path,
                )
                return self._data

        return None

    def fetch_and_cache(self) -> t.Optional[TriggerData]:
        from composio.client import Composio  # pylint: disable=import-outside-toplevel
        from composio.client.endpoints import (  # pylint: disable=import-outside-toplevel
            v2,
        )

        client = Composio.get_latest()

        # TODO: client.triggers.endpoint is still v1, migrate that
        response = client.http.get(url=str(v2.triggers / self.slug)).json()
        # TOFIX: Return proper error code when of item is not found
        if "appName" not in response:
            return None

        return TriggerData(  # type: ignore
            name=response["enum"],
            app=response["appName"],
            path=self.storage_path,
        )

    @property
    def name(self) -> str:
        return self.load().name

    @property
    def app(self) -> str:
        # Normalize app name
        return self.load().app.upper()
