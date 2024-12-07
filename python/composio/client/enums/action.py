import typing as t

from composio.client.enums.enum import Enum, EnumGenerator
from .base import ActionData, EnumStringNotFound

_ACTION_CACHE: t.Dict[str, "Action"] = {}


class Action(Enum[ActionData], metaclass=EnumGenerator):
    cache_folder = "actions"
    cache = _ACTION_CACHE
    storage = ActionData

    def load(self) -> ActionData:
        try:
            action_data = super().load()

        except EnumStringNotFound:
            # check if it's a runtime action
            from composio.tools.base.abs import action_registry

            for gid, actions in action_registry.items():
                if self.slug in actions:
                    action = actions[self.slug]
                    self._data = ActionData(
                        name=action.name,
                        app=action.tool,
                        tags=action.tags(),
                        no_auth=action.no_auth,
                        is_local=gid in ("runtime", "local"),
                        is_runtime=gid == "runtime",
                        path=self.storage_path,
                    )
                    return self._data

            raise

        # Handle deprecated actions
        if action_data.replaced_by is not None:
            return Action(action_data.replaced_by).load()

        return action_data

    @property
    def name(self) -> str:
        """Action name."""
        return self.load().name

    @property
    def app(self) -> str:
        """App name where the actions belongs to."""
        return self.load().app

    @property
    def tags(self) -> t.List[str]:
        """List of tags for action."""
        return self.load().tags

    @property
    def no_auth(self) -> bool:
        """If set `True` the action does not require authentication."""
        return self.load().no_auth

    @property
    def is_local(self) -> bool:
        """If set `True` the `app` is a local app."""
        return self.load().is_local

    @property
    def is_runtime(self) -> bool:
        """If set `True` the `app` is a runtime app."""
        return self.load().is_runtime
