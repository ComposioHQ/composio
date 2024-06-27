import typing as t

from composio.client.enums import Action, ActionType, App, AppType, Tag, TagType
from composio.local_tools import Mathematical
from composio.local_tools.filetool import FileTool
from composio.local_tools.greptile.tool import Greptile
from composio.local_tools.local_workspace.cmd_manager.tool import CmdManagerTool
from composio.local_tools.local_workspace.commons.history_processor import (
    HistoryProcessor,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    WorkspaceManagerFactory,
)
from composio.local_tools.local_workspace.history_keeper import HistoryKeeper
from composio.local_tools.local_workspace.submit_patch import SubmitPatchTool
from composio.local_tools.local_workspace.workspace import LocalWorkspace
from composio.local_tools.ragtool import RagTool
from composio.local_tools.sqltool import SqlTool
from composio.local_tools.webtool import WebTool


class LocalToolHandler:
    """Local tools registry."""

    def __init__(self) -> None:
        """Initialize local tools registry."""
        self.registered_tools = self._load_local_tools()
        self.tool_map = {tool.tool_name: tool for tool in self.registered_tools}

    def _load_local_tools(self) -> t.List:
        """Load local tools."""
        w = WorkspaceManagerFactory()
        h = HistoryProcessor()

        # initialize workspace tool
        workspace_tool = LocalWorkspace()
        workspace_tool.set_workspace_factory(w)
        workspace_tool.set_history_processor(h)

        # initialize command manager
        cmd_manager_tool = CmdManagerTool()
        cmd_manager_tool.set_workspace_factory(w)
        cmd_manager_tool.set_history_processor(h)

        # initiate history keeper
        h_keeper_tool = HistoryKeeper()
        h_keeper_tool.set_workspace_factory(w)
        h_keeper_tool.set_history_processor(h)
        return [
            Mathematical(),
            workspace_tool,
            cmd_manager_tool,
            h_keeper_tool,
            RagTool(),
            WebTool(),
            Greptile(),
            SubmitPatchTool(),
            SqlTool(),
            FileTool(),
        ]

    def get_action_schemas(
        self,
        apps: t.Optional[t.Sequence[AppType]] = None,
        actions: t.Optional[t.Sequence[ActionType]] = None,
        tags: t.Optional[t.Sequence[TagType]] = None,
    ) -> t.List[t.Dict]:
        """Get action schemas for given parameters."""
        apps = t.cast(t.List[App], [App(app) for app in apps or []])
        actions = t.cast(t.List[Action], [Action(action) for action in actions or []])
        action_objs: t.List[t.Any] = []
        for app in apps:
            tool_obj = self.tool_map[app.name]
            action_objs.extend(tool_obj.get_actions_dict().values())

        for action in actions:
            tool_obj = self.tool_map[action.app]
            action_obj = tool_obj.get_actions_dict()[action.name]
            action_objs.append(action_obj)

        action_schemas = [action_obj.get_action_schema() for action_obj in action_objs]
        action_schemas = list(
            {
                action_schema["name"]: action_schema for action_schema in action_schemas
            }.values()
        )
        if tags:
            tags = t.cast(t.List[str], [Tag(tag).value for tag in tags or []])
            action_schemas = [
                action_schema
                for action_schema in action_schemas
                if bool(set(tags) & set(action_schema["tags"]))
            ]
        return action_schemas

    def execute_action(
        self,
        action: Action,
        request_data: dict,
        metadata: t.Optional[t.Dict] = None,
    ):
        """Execute a local action."""
        tool_obj = self.tool_map[action.app]
        action_obj = tool_obj.get_actions_dict()[action.name]
        return action_obj.execute_action(request_data, metadata or {})
