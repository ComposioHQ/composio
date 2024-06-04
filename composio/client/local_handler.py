from composio.local_tools.local_workspace.cmd_manager.tool import (
    CmdManagerTool,
)
from composio.local_tools.local_workspace.commons.history_processor import (
    HistoryProcessor,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    WorkspaceManagerFactory,
)
from composio.local_tools.local_workspace.history_keeper import (
    HistoryKeeper,
)
from composio.local_tools.local_workspace.workspace import LocalWorkspace

from composio.local_tools.ragtool import RagTool
from composio.local_tools import Mathematical
from composio.local_tools.webtool import WebTool
from composio.local_tools.greptile.tool import Greptile


class LocalToolHandler:
    def __init__(self):
        self.registered_tools = self.register_local_tools()
        self.tool_map = {tool.tool_name: tool for tool in self.registered_tools}

    def register_local_tools(self):
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
        ]

    def get_list_of_action_schemas(self, apps=[], actions=[], tags=[]):
        tag_values = [tag if isinstance(tag, str) else tag.value for tag in tags]

        all_action_objs = []

        for app in apps:
            tool_obj = self.tool_map[app.value]
            all_action_objs.extend(tool_obj.get_actions_dict().values())

        for action in actions:
            tool_obj = self.tool_map[action.value[0]]
            action_obj = tool_obj.get_actions_dict()[action.value[1]]
            all_action_objs.append(action_obj)

        # all_action_objs = list(set(all_action_objs))
        all_action_schemas = [
            action_obj.get_action_schema() for action_obj in all_action_objs
        ]
        # all_action_schemas = list(set(all_action_schemas))

        all_action_schemas = list(
            {
                action_schema["name"]: action_schema
                for action_schema in all_action_schemas
            }.values()
        )

        if tag_values:
            all_action_schemas = [
                action_schema
                for action_schema in all_action_schemas
                if bool(set(tag_values) & set(action_schema["tags"]))
            ]

        return all_action_schemas

    def execute_local_action(self, action, request_data: dict, metadata: dict = {}):
        tool_obj = self.tool_map[action.value[0]]
        action_obj = tool_obj.get_actions_dict()[action.value[1]]
        return action_obj.execute_action(request_data, metadata)
