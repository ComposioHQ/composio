from typing import Optional

from composio.core.local import Tool
from composio.local_tools.local_workspace.cmd_manager.actions import (
    CreateFileCmd,
    EditFile,
    FindFileCmd,
    GetCurrentDirCmd,
    GetPatchCmd,
    GitRepoTree,
    GithubCloneCmd,
    GoToLineNumInOpenFile,
    OpenFile,
    RunCommandOnWorkspace,
    Scroll,
    SearchDirCmd,
    SearchFileCmd,
)
from composio.local_tools.local_workspace.commons import (
    HistoryProcessor,
    WorkspaceManagerFactory,
)


class CmdManagerTool(Tool):
    """
    command manager tool for workspace
    """

    workspace_factory: Optional[WorkspaceManagerFactory] = None
    history_processor: Optional[HistoryProcessor] = None

    def actions(self) -> list:
        return [
            FindFileCmd,
            CreateFileCmd,
            GoToLineNumInOpenFile,
            OpenFile,
            Scroll,
            SearchFileCmd,
            SearchDirCmd,
            EditFile,
            RunCommandOnWorkspace,
            GetCurrentDirCmd,
            GithubCloneCmd,
            GitRepoTree,
            GetPatchCmd,
        ]

    def triggers(self) -> list:
        return []

    def set_workspace_factory(self, workspace_factory: WorkspaceManagerFactory):
        self.workspace_factory = workspace_factory

    def get_workspace_factory(self) -> Optional[WorkspaceManagerFactory]:
        return self.workspace_factory

    def set_history_processor(self, history_processor: HistoryProcessor):
        self.history_processor = history_processor

    def get_history_processor(self) -> Optional[HistoryProcessor]:
        return self.history_processor
