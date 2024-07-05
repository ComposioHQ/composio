import typing as t

from composio.client.enums import Action, ActionType, App, AppType, Tag, TagType
from composio.tools.local.base import Action as LocalActionType
from composio.tools.local.base import Tool as LocalToolType
from composio.utils.logging import WithLogger


class LocalClient(WithLogger):
    """Local tools client."""

    _tools: t.Dict[str, LocalToolType] = {}
    """Local tools registry."""

    @property
    def tools(self) -> t.Dict[str, LocalToolType]:
        """Local tools."""
        from composio.tools.local import (  # pylint: disable=import-outside-toplevel
            TOOLS,
        )

        for tool in t.cast(t.List[t.Type[LocalToolType]], TOOLS):
            _tool = tool()
            self._tools[_tool.name] = _tool

        return self._tools

    def get_action_schemas(
        self,
        apps: t.Optional[t.Sequence[AppType]] = None,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        tags: t.Optional[t.Sequence[TagType]] = None,
    ) -> t.List[t.Dict]:
        """Get action schemas for given parameters."""
        apps = t.cast(t.List[App], [App(app) for app in apps or []])
        actions = t.cast(t.List[Action], [Action(action) for action in actions or []])
        action_schemas: t.List[t.Dict] = []

        for app in apps:
            action_schemas += [
                action().get_action_schema()
                for action in self.tools[app.name].actions()
            ]

        for action in actions:
            action_schemas.append(
                self.tools[action.app].get_action(name=action.name).get_action_schema()
            )

        if tags:
            tags = t.cast(t.List[str], [Tag(tag).value for tag in tags or []])
            action_schemas = [
                action_schema
                for action_schema in action_schemas
                if bool(set(tags) & set(action_schema["tags"]))
            ]
        return action_schemas

    def get_action(self, action: Action) -> LocalActionType:
        """Get a local action class."""
        return self.tools[action.app].get_action(name=action.name)

    def execute_action(
        self,
        action: Action,
        request_data: dict,
        metadata: t.Optional[t.Dict] = None,
    ):
        """Execute a local action."""
        return (
            self.tools[action.app]
            .get_action(name=action.name)
            .execute_action(
                request_data=request_data,
                metadata=metadata or {},
            )
        )
