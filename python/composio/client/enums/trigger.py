import typing as t

from composio.client.enums.enum import Enum, EnumGenerator

from .base import EnumStringNotFound, TriggerData


_TRIGGER_CACHE: t.Dict[str, "Trigger"] = {}


class Trigger(Enum[TriggerData], metaclass=EnumGenerator):
    cache_folder = "triggers"
    cache = _TRIGGER_CACHE
    storage = TriggerData

    def load(self) -> TriggerData:
        try:
            trigger_data = super().load()

        except EnumStringNotFound:
            # check if it's a runtime trigger
            from composio.tools.base.abs import trigger_registry

            for triggers in trigger_registry.values():
                if self.slug in triggers:
                    self._data = TriggerData(
                        name=triggers[self.slug].name,
                        app=triggers[self.slug].tool,
                        path=self.storage_path,
                    )
                    return self._data

            raise

        return trigger_data

    @property
    def name(self) -> str:
        return self.load().name

    @property
    def app(self) -> str:
        return self.load().app
