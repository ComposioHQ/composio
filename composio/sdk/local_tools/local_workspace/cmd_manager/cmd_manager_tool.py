from composio.sdk.local_tools.lib.tool import Tool
from composio.sdk.local_tools.local_workspace.commons.local_docker_workspace import WorkspaceManagerFactory
from composio.sdk.local_tools.local_workspace.commons.history_processor import HistoryProcessor
from composio.sdk.local_tools.local_workspace.cmd_manager.actions import (CreateFileCmd,
                                                                          GoToCmd,
                                                                          OpenCmd,
                                                                          ScrollUp,
                                                                          ScrollDown,
                                                                          SearchFileCmd,
                                                                          SearchDirCmd,
                                                                          FindFileCmd,
                                                                          SetCursors,
                                                                          EditFile)


class CmdManagerTool(Tool):
    """
    command manager tool for workspace
    """
    workspace_factory: WorkspaceManagerFactory = None
    history_processor: HistoryProcessor = None

    def actions(self) -> list:
        return [
              FindFileCmd,
              CreateFileCmd,
              GoToCmd,
              OpenCmd,
              ScrollUp,
              ScrollDown,
              SearchFileCmd,
              SearchDirCmd,
              SetCursors,
              EditFile]

    def triggers(self) -> list:
        return []

    def set_workspace_factory(self, workspace_factory: WorkspaceManagerFactory):
        self.workspace_factory = workspace_factory

    def get_workspace_factory(self) -> WorkspaceManagerFactory:
        return self.workspace_factory

    def set_history_processor(self, history_processor: HistoryProcessor):
        self.history_processor = history_processor

    def get_history_processor(self) -> HistoryProcessor:
        return self.history_processor
