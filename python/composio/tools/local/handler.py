import typing as t

from composio.client.enums import Action, ActionType, App, AppType, Tag, TagType
from composio.tools.base.abs import Action as LocalActionType
from composio.tools.base.abs import Tool as LocalToolType
from composio.tools.base.abs import action_registry
from composio.utils.logging import WithLogger


_runtime_actions: t.Dict[str, LocalActionType] = {}


class LocalClient(WithLogger):
    """Local tools client."""

    _tools: t.Dict[str, LocalToolType] = {}
    """Local tools registry."""

    @classmethod
    def tools(cls) -> t.Dict[str, LocalToolType]:
        """Local tools."""
        from composio.tools.local import (  # pylint: disable=import-outside-toplevel
            load_local_tools,
        )

        cls._tools = load_local_tools().get("local", {})
        return cls._tools

    @classmethod
    def get_action_schemas(
        cls,
        apps: t.Optional[t.Sequence[AppType]] = None,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        tags: t.Optional[t.Sequence[TagType]] = None,
    ) -> t.List[t.Dict]:
        """Get action schemas for given parameters."""
        tools = cls.tools()
        apps = t.cast(t.List[App], [App(app) for app in apps or []])
        actions = t.cast(t.List[Action], [Action(action) for action in actions or []])
        action_schemas: t.List[t.Dict] = []

        for app in apps:
            action_schemas += [action.schema() for action in tools[app.slug].actions()]

        for action in actions:
            action_schemas.append(action_registry["local"][action.slug].schema())

        if tags:
            tags = t.cast(t.List[str], [Tag(tag).value for tag in tags or []])
            action_schemas = [
                action_schema
                for action_schema in action_schemas
                if bool(set(tags) & set(action_schema["tags"]))
            ]

        for schema in action_schemas:
            schema["name"] = schema["enum"]
        return action_schemas


def add_runtime_action(name: str, cls: t.Type[LocalActionType]) -> None:
    """Add runtime action."""
    _runtime_actions[name] = cls()


def get_runtime_action(name: str) -> LocalActionType:
    """Get a runtime action."""
    return _runtime_actions[name]
