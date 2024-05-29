from composio.local_tools.local_workspace.cmd_manager.actions import (
    CreateFileCmd,
    EditFile,
    FindFileCmd,
    GoToLineNumInOpenFile,
    OpenFile,
    RunCommandOnWorkspace,
    ScrollDown,
    ScrollUp,
    SearchDirCmd,
    SearchFileCmd,
    SetCursors,
)
from composio.local_tools.local_workspace.commons.history_processor import (
    HistoryProcessor,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    WorkspaceManagerFactory,
)
from composio.local_tools.tool import Tool


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
            GoToLineNumInOpenFile,
            OpenFile,
            ScrollUp,
            ScrollDown,
            SearchFileCmd,
            SearchDirCmd,
            SetCursors,
            EditFile,
            RunCommandOnWorkspace,
        ]

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
