import typing as t
import warnings

from composio.client.enums.base import ActionData, replacement_action_name
from composio.client.enums.enum import Enum, EnumGenerator
from composio.exceptions import ComposioSDKError


_ACTION_CACHE: t.Dict[str, "Action"] = {}


class Action(Enum[ActionData], metaclass=EnumGenerator):
    cache_folder = "actions"
    cache = _ACTION_CACHE
    storage = ActionData

    def load(self) -> ActionData:
        """Handle deprecated actions"""
        action_data = super().load()
        if action_data.replaced_by is not None:
            replacement_enum = Action(action_data.replaced_by)
            warnings.warn(
                f"{self!r} is deprecated and will be removed. "
                f"Use {replacement_enum!r} instead.",
                UserWarning,
            )
            return replacement_enum.load()

        return action_data

    def load_from_runtime(self) -> t.Optional[ActionData]:
        """Try to see if the action is a runtime action."""
        from composio.tools.base.abs import (  # pylint: disable=import-outside-toplevel
            action_registry,
        )

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

        return None

    def fetch_and_cache(self) -> t.Optional[ActionData]:
        from composio.client import Composio  # pylint: disable=import-outside-toplevel

        client = Composio.get_latest()
        request = client.http.get(url=str(client.actions.endpoint / self.slug))
        response = request.json()
        if isinstance(response, list):
            response, *_ = response

        if request.status_code == 404 or "Not Found" in response.get("message", ""):
            raise ComposioSDKError(
                message=(
                    f"No metadata found for enum `{self.slug}`, "
                    "You might be trying to use an app or action "
                    "that is deprecated."
                )
            )

        # TOFIX: Return proper error code when of item is not found
        if "appName" not in response:
            return None

        replaced_by = replacement_action_name(
            response["description"], response["appName"]
        )
        return ActionData(  # type: ignore
            name=response["name"],
            app=response["appName"],
            tags=response["tags"],
            no_auth=(
                client.http.get(url=str(client.apps.endpoint / response["appName"]))
                .json()
                .get("no_auth", False)
            ),
            is_local=False,
            is_runtime=False,
            shell=False,
            path=self.storage_path,
            replaced_by=replaced_by,
        )

    @property
    def name(self) -> str:
        """Action name."""
        return self.load().name

    @property
    def app(self) -> str:
        """App name where the actions belongs to."""
        # Normalize app name
        return self.load().app.upper()

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
